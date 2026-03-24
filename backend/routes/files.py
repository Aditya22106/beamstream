from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from bson import ObjectId
from datetime import datetime

from database import files as files_col, activity_logs
from middleware.auth import get_current_user
from services.cloudinary_service import upload_file, delete_file
from config import MAX_FILE_SIZE_MB

router = APIRouter()

ALLOWED_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/zip",
    "application/x-zip-compressed",
    "video/mp4",
    "audio/mpeg",
    "audio/mp3",
    "application/octet-stream",
]


def _out(doc: dict) -> dict:
    return {
        "file_id":     str(doc["_id"]),
        "owner_id":    doc["owner_id"],
        "owner_name":  doc.get("owner_name", ""),
        "file_name":   doc["file_name"],
        "file_type":   doc["file_type"],
        "file_size":   doc["file_size"],
        "upload_date": doc["upload_date"].isoformat(),
        "url":         doc["url"],
        "public_id":   doc.get("public_id", ""),
        "session_id":  doc.get("session_id"),
    }


@router.post("/upload", status_code=201)
async def upload(
    file:       UploadFile = File(...),
    session_id: str        = Query(None),
    cu:         dict       = Depends(get_current_user),
):
    content = await file.read()

    # Size check
    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            400, f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
        )

    # Type check — allow application/octet-stream as fallback
    file_type = file.content_type or "application/octet-stream"
    if file_type not in ALLOWED_TYPES:
        raise HTTPException(
            400,
            f"File type '{file_type}' is not allowed. "
            "Allowed: PDF, Word, Excel, PowerPoint, images, zip, video, audio, text",
        )

    folder = (
        f"beamstream/{session_id}" if session_id
        else f"beamstream/general/{cu['user_id']}"
    )

    result = upload_file(content, file.filename, folder=folder)

    doc = {
        "owner_id":    cu["user_id"],
        "owner_name":  cu["name"],
        "file_name":   file.filename,
        "file_type":   file_type,
        "file_size":   len(content),
        "upload_date": datetime.utcnow(),
        "url":         result["url"],
        "public_id":   result["public_id"],
        "session_id":  session_id,
    }
    res     = await files_col.insert_one(doc)
    file_id = str(res.inserted_id)

    await activity_logs.insert_one({
        "user_id":     cu["user_id"],
        "action_type": "upload",
        "timestamp":   datetime.utcnow(),
        "details":     file.filename,
    })

    return _out({**doc, "_id": res.inserted_id})


@router.get("/session/{session_id}")
async def session_files(
    session_id: str,
    cu:         dict = Depends(get_current_user),
):
    """Get all files uploaded in a specific session."""
    cursor = files_col.find(
        {"session_id": session_id}
    ).sort("upload_date", -1)
    return [_out(d) async for d in cursor]


@router.get("/")
async def list_files(cu: dict = Depends(get_current_user)):
    """List files owned by current user."""
    cursor = files_col.find(
        {"owner_id": cu["user_id"]}
    ).sort("upload_date", -1).limit(50)
    return [_out(d) async for d in cursor]


@router.get("/{file_id}")
async def get_file(
    file_id: str,
    cu:      dict = Depends(get_current_user),
):
    try:
        doc = await files_col.find_one({"_id": ObjectId(file_id)})
    except Exception:
        raise HTTPException(400, "Invalid file ID")
    if not doc:
        raise HTTPException(404, "File not found")
    return _out(doc)


@router.delete("/{file_id}", status_code=204)
async def delete(
    file_id: str,
    cu:      dict = Depends(get_current_user),
):
    try:
        doc = await files_col.find_one({"_id": ObjectId(file_id)})
    except Exception:
        raise HTTPException(400, "Invalid file ID")
    if not doc:
        raise HTTPException(404, "File not found")
    if doc["owner_id"] != cu["user_id"] and cu["role"] != "admin":
        raise HTTPException(403, "Not authorised to delete this file")

    delete_file(doc.get("public_id", ""))
    await files_col.delete_one({"_id": ObjectId(file_id)})

    await activity_logs.insert_one({
        "user_id":     cu["user_id"],
        "action_type": "delete",
        "timestamp":   datetime.utcnow(),
        "details":     doc["file_name"],
    })

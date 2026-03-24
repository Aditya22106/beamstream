from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime
from typing import Any

from database import documents
from middleware.auth import get_current_user

router = APIRouter()


class SaveBody(BaseModel):
    session_id: str
    doc_type:   str
    title:      str
    content:    Any
    version:    int


class CommentBody(BaseModel):
    text: str


@router.post("/save")
async def save_doc(
    body: SaveBody,
    cu:   dict = Depends(get_current_user),
):
    existing = await documents.find_one({"session_id": body.session_id})
    version_entry = {
        "version":  body.version,
        "saved_by": cu["name"],
        "time":     datetime.utcnow().isoformat(),
    }

    if existing:
        versions = existing.get("versions", [])
        recorded = [v["version"] for v in versions]
        if body.version not in recorded:
            versions.append(version_entry)

        await documents.update_one(
            {"session_id": body.session_id},
            {"$set": {
                "title":      body.title,
                "content":    body.content,
                "version":    body.version,
                "updated_at": datetime.utcnow(),
                "updated_by": cu["name"],
                "versions":   versions[-30:],
            }},
        )
    else:
        await documents.insert_one({
            "session_id": body.session_id,
            "doc_type":   body.doc_type,
            "title":      body.title,
            "content":    body.content,
            "version":    body.version,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by": cu["name"],
            "updated_by": cu["name"],
            "comments":   [],
            "versions":   [version_entry],
        })

    return {"status": "saved", "version": body.version}


@router.get("/{session_id}")
async def get_doc(
    session_id: str,
    cu:         dict = Depends(get_current_user),
):
    doc = await documents.find_one({"session_id": session_id})
    if not doc:
        return {"exists": False}

    return {
        "exists":     True,
        "session_id": doc["session_id"],
        "doc_type":   doc["doc_type"],
        "title":      doc["title"],
        "content":    doc["content"],
        "version":    doc["version"],
        "updated_at": doc["updated_at"].isoformat(),
        "updated_by": doc.get("updated_by", ""),
        "comments":   doc.get("comments", []),
        "versions":   doc.get("versions", []),
    }


@router.post("/{session_id}/comment")
async def add_comment(
    session_id: str,
    body:       CommentBody,
    cu:         dict = Depends(get_current_user),
):
    if not body.text.strip():
        raise HTTPException(400, "Comment cannot be empty")

    comment = {
        "author": cu["name"],
        "text":   body.text.strip(),
        "time":   datetime.utcnow().isoformat(),
    }
    await documents.update_one(
        {"session_id": session_id},
        {"$push": {"comments": comment}},
    )
    return {"status": "added", "comment": comment}


@router.delete("/{session_id}")
async def delete_doc(
    session_id: str,
    cu:         dict = Depends(get_current_user),
):
    await documents.delete_one({"session_id": session_id})
    return {"status": "deleted"}

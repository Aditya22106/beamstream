from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime

from database import (
    sessions, files as files_col,
    notifications, activity_logs, chat_messages,
)
from middleware.auth import get_current_user
from services.session_service import generate_otp, generate_qr, session_expiry
from services.cloudinary_service import delete_file

router = APIRouter()


class JoinBody(BaseModel):
    otp_code: str


@router.post("/create", status_code=201)
async def create_session(
    doc_type: str  = Query("file"),
    cu:       dict = Depends(get_current_user),
):
    otp = generate_otp()
    exp = session_expiry()

    doc = {
        "otp_code":   otp,
        "device_a":   cu["user_id"],
        "device_b":   None,
        "status":     "waiting",
        "doc_type":   doc_type,
        "created_at": datetime.utcnow(),
        "expires_at": exp,
    }
    res = await sessions.insert_one(doc)
    sid = str(res.inserted_id)
    qr  = generate_qr(sid, otp)

    await activity_logs.insert_one({
        "user_id":     cu["user_id"],
        "action_type": "session_create",
        "timestamp":   datetime.utcnow(),
        "details":     f"Session {sid} type={doc_type}",
    })

    return {
        "session_id": sid,
        "otp_code":   otp,
        "qr_code":    qr,
        "doc_type":   doc_type,
        "status":     "waiting",
        "device_a":   cu["user_id"],
        "device_b":   None,
        "created_at": doc["created_at"].isoformat(),
        "expires_at": exp.isoformat(),
    }


@router.post("/join")
async def join_session(
    body: JoinBody,
    cu:   dict = Depends(get_current_user),
):
    if not body.otp_code or len(body.otp_code) != 6:
        raise HTTPException(400, "OTP must be 6 digits")

    session = await sessions.find_one({
        "otp_code":   body.otp_code,
        "status":     "waiting",
        "expires_at": {"$gt": datetime.utcnow()},
    })
    if not session:
        raise HTTPException(404, "Invalid or expired OTP code")
    if session["device_a"] == cu["user_id"]:
        raise HTTPException(400, "Cannot join your own session")

    await sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {
            "device_b": cu["user_id"],
            "status":   "active",
        }},
    )

    await notifications.insert_one({
        "recipient_id": session["device_a"],
        "message":      f"{cu['name']} joined your session",
        "status":       "unread",
        "timestamp":    datetime.utcnow(),
    })

    await activity_logs.insert_one({
        "user_id":     cu["user_id"],
        "action_type": "session_join",
        "timestamp":   datetime.utcnow(),
        "details":     str(session["_id"]),
    })

    return {
        "session_id": str(session["_id"]),
        "status":     "active",
        "device_a":   session["device_a"],
        "device_b":   cu["user_id"],
        "doc_type":   session.get("doc_type", "file"),
        "otp_code":   session["otp_code"],
        "created_at": session["created_at"].isoformat(),
    }


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    cu:         dict = Depends(get_current_user),
):
    try:
        session = await sessions.find_one({"_id": ObjectId(session_id)})
    except Exception:
        raise HTTPException(400, "Invalid session ID")
    if not session:
        raise HTTPException(404, "Session not found")
    if cu["user_id"] not in (
        session["device_a"], session.get("device_b")
    ):
        raise HTTPException(403, "Not part of this session")

    return {
        "session_id": str(session["_id"]),
        "status":     session["status"],
        "device_a":   session["device_a"],
        "device_b":   session.get("device_b"),
        "doc_type":   session.get("doc_type", "file"),
        "otp_code":   session["otp_code"],
        "created_at": session["created_at"].isoformat(),
        "expires_at": session["expires_at"].isoformat(),
    }


@router.get("/{session_id}/messages")
async def get_messages(
    session_id: str,
    cu:         dict = Depends(get_current_user),
):
    """Get all chat messages for a session."""
    try:
        cursor = chat_messages.find(
            {"session_id": session_id}
        ).sort("timestamp", 1).limit(200)

        messages = []
        async for m in cursor:
            messages.append({
                "id":        str(m["_id"]),
                "user_id":   m["user_id"],
                "name":      m["name"],
                "color":     m.get("color", "#4285f4"),
                "text":      m["text"],
                "timestamp": m["timestamp"].isoformat(),
            })
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.delete("/{session_id}", status_code=204)
async def close_session(
    session_id: str,
    cu:         dict = Depends(get_current_user),
):
    try:
        session = await sessions.find_one({"_id": ObjectId(session_id)})
    except Exception:
        raise HTTPException(400, "Invalid session ID")
    if not session:
        raise HTTPException(404, "Session not found")
    if cu["user_id"] not in (
        session.get("device_a"), session.get("device_b")
    ):
        raise HTTPException(403, "Not part of this session")

    # Delete all files from Cloudinary and MongoDB
    cursor = files_col.find({"session_id": session_id})
    async for f in cursor:
        delete_file(f.get("public_id", ""))
    await files_col.delete_many({"session_id": session_id})

    # Delete chat messages
    await chat_messages.delete_many({"session_id": session_id})

    await sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"status": "closed"}},
    )

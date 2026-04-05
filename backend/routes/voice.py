"""
routes/voice.py

WebRTC signaling for voice chat in collaboration sessions.
Each collaboration session can have one voice room.
Users join/leave and exchange SDP offers/answers + ICE candidates
through this REST API. Socket.io then notifies peers.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Any, Optional
from datetime import datetime, timedelta

from database import db
from middleware.auth import get_current_user

router = APIRouter()
voice_col = db["voice_rooms"]


# ── Models ─────────────────────────────────────────────────────────────────

class SignalBody(BaseModel):
    session_id: str
    to_user_id: str
    signal:     Any      # SDP offer / answer / ICE candidate
    signal_type: str     # "offer" | "answer" | "ice"


class JoinBody(BaseModel):
    session_id: str


# ── Join voice room ─────────────────────────────────────────────────────────

@router.post("/join")
async def join_voice(
    body: JoinBody,
    cu:   dict = Depends(get_current_user),
):
    """
    User announces they are joining the voice room for a session.
    Returns list of existing peers so caller can initiate offers.
    """
    room = await voice_col.find_one({"session_id": body.session_id})

    peer = {
        "user_id":   cu["user_id"],
        "name":      cu["name"],
        "joined_at": datetime.utcnow().isoformat(),
        "muted":     False,
    }

    if not room:
        await voice_col.insert_one({
            "session_id": body.session_id,
            "peers":      [peer],
            "created_at": datetime.utcnow(),
        })
        existing_peers = []
    else:
        # Remove stale entry for same user if rejoining
        existing = [
            p for p in room.get("peers", [])
            if p["user_id"] != cu["user_id"]
        ]
        existing_peers = existing

        await voice_col.update_one(
            {"session_id": body.session_id},
            {"$set": {"peers": existing + [peer]}},
        )

    return {
        "status":         "joined",
        "existing_peers": existing_peers,
    }


# ── Leave voice room ────────────────────────────────────────────────────────

@router.post("/leave")
async def leave_voice(
    body: JoinBody,
    cu:   dict = Depends(get_current_user),
):
    room = await voice_col.find_one({"session_id": body.session_id})
    if not room:
        return {"status": "ok"}

    updated = [
        p for p in room.get("peers", [])
        if p["user_id"] != cu["user_id"]
    ]
    await voice_col.update_one(
        {"session_id": body.session_id},
        {"$set": {"peers": updated}},
    )
    return {"status": "left"}


# ── Get room peers ──────────────────────────────────────────────────────────

@router.get("/room/{session_id}")
async def get_room(
    session_id: str,
    cu:         dict = Depends(get_current_user),
):
    room = await voice_col.find_one({"session_id": session_id})
    if not room:
        return {"peers": []}
    return {"peers": room.get("peers", [])}


# ── Update mute status ──────────────────────────────────────────────────────

@router.post("/mute")
async def update_mute(
    body: JoinBody,
    muted: bool = False,
    cu:    dict = Depends(get_current_user),
):
    room = await voice_col.find_one({"session_id": body.session_id})
    if not room:
        raise HTTPException(404, "Voice room not found")

    peers = room.get("peers", [])
    for p in peers:
        if p["user_id"] == cu["user_id"]:
            p["muted"] = muted

    await voice_col.update_one(
        {"session_id": body.session_id},
        {"$set": {"peers": peers}},
    )
    return {"status": "ok"}


# ── Store WebRTC signal (offer/answer/ICE) ─────────────────────────────────

@router.post("/signal")
async def store_signal(
    body: SignalBody,
    cu:   dict = Depends(get_current_user),
):
    """
    Store a WebRTC signal (offer, answer, or ICE candidate)
    destined for a specific peer. The peer polls /signals/{session_id}
    to pick it up.
    """
    signal_doc = {
        "session_id":  body.session_id,
        "from_user":   cu["user_id"],
        "from_name":   cu["name"],
        "to_user":     body.to_user_id,
        "signal":      body.signal,
        "signal_type": body.signal_type,
        "created_at":  datetime.utcnow(),
        "expires_at":  datetime.utcnow() + timedelta(minutes=2),
    }
    await db["voice_signals"].insert_one(signal_doc)
    return {"status": "stored"}


# ── Fetch pending signals for current user ─────────────────────────────────

@router.get("/signals/{session_id}")
async def fetch_signals(
    session_id: str,
    cu:         dict = Depends(get_current_user),
):
    """
    Receiver polls this to get any pending offers/answers/ICE.
    Deletes them after fetching (consume once).
    """
    cursor = db["voice_signals"].find({
        "session_id": session_id,
        "to_user":    cu["user_id"],
        "expires_at": {"$gt": datetime.utcnow()},
    })
    signals = []
    ids     = []
    async for s in cursor:
        signals.append({
            "from_user":   s["from_user"],
            "from_name":   s["from_name"],
            "signal":      s["signal"],
            "signal_type": s["signal_type"],
        })
        ids.append(s["_id"])

    # Delete consumed signals
    if ids:
        await db["voice_signals"].delete_many({"_id": {"$in": ids}})

    return {"signals": signals}

"""
routes/webrtc.py

Signaling server for WebRTC peer-to-peer file transfer.
Stores offers, answers, and ICE candidates temporarily in MongoDB.
Documents expire automatically after 10 minutes via TTL index.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Any, Optional
from datetime import datetime, timedelta
from bson import ObjectId

from database import db
from middleware.auth import get_current_user

router = APIRouter()
rtc_col = db["webrtc_sessions"]


# ── Pydantic models ────────────────────────────────────────────────────────

class OfferBody(BaseModel):
    offer: Any          # RTCSessionDescription as dict


class AnswerBody(BaseModel):
    answer: Any         # RTCSessionDescription as dict


class IceBody(BaseModel):
    candidate: Any      # RTCIceCandidate as dict
    role: str           # "sender" or "receiver"


# ── Helper ─────────────────────────────────────────────────────────────────

def _generate_pin() -> str:
    import random, string
    return "".join(random.choices(string.digits, k=6))


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/create", status_code=201)
async def create_rtc_session(
    body: OfferBody,
    cu:   dict = Depends(get_current_user),
):
    """
    Sender calls this with their WebRTC offer.
    Returns a 6-digit PIN that the receiver enters.
    """
    pin = _generate_pin()

    doc = {
        "pin":         pin,
        "sender_id":   cu["user_id"],
        "sender_name": cu["name"],
        "offer":       body.offer,
        "answer":      None,
        "sender_ice":  [],      # ICE candidates from sender
        "receiver_ice": [],     # ICE candidates from receiver
        "status":      "waiting",
        "created_at":  datetime.utcnow(),
        "expires_at":  datetime.utcnow() + timedelta(minutes=10),
    }

    result = await rtc_col.insert_one(doc)
    return {
        "session_id": str(result.inserted_id),
        "pin":        pin,
    }


@router.get("/poll/{pin}")
async def poll_session(
    pin: str,
    cu:  dict = Depends(get_current_user),
):
    """
    Sender polls this to check if receiver has joined and sent an answer.
    """
    session = await rtc_col.find_one({"pin": pin})
    if not session:
        raise HTTPException(404, "Session not found or expired")

    return {
        "session_id":   str(session["_id"]),
        "status":       session["status"],
        "answer":       session.get("answer"),
        "receiver_ice": session.get("receiver_ice", []),
        "sender_ice":   session.get("sender_ice", []),
    }


@router.post("/join/{pin}")
async def join_rtc_session(
    pin:  str,
    body: AnswerBody,
    cu:   dict = Depends(get_current_user),
):
    """
    Receiver calls this with their WebRTC answer after fetching the offer.
    """
    session = await rtc_col.find_one({
        "pin":    pin,
        "status": "waiting",
        "expires_at": {"$gt": datetime.utcnow()},
    })
    if not session:
        raise HTTPException(404, "Invalid or expired PIN")

    await rtc_col.update_one(
        {"pin": pin},
        {"$set": {
            "answer":      body.answer,
            "receiver_id": cu["user_id"],
            "status":      "connected",
        }},
    )

    return {
        "session_id": str(session["_id"]),
        "offer":      session["offer"],
        "sender_name": session.get("sender_name", ""),
        "sender_ice": session.get("sender_ice", []),
    }


@router.post("/ice/{pin}")
async def add_ice_candidate(
    pin:  str,
    body: IceBody,
    cu:   dict = Depends(get_current_user),
):
    """
    Both sender and receiver push their ICE candidates here.
    role = "sender" or "receiver"
    """
    session = await rtc_col.find_one({"pin": pin})
    if not session:
        raise HTTPException(404, "Session not found")

    field = "sender_ice" if body.role == "sender" else "receiver_ice"

    await rtc_col.update_one(
        {"pin": pin},
        {"$push": {field: body.candidate}},
    )
    return {"status": "ok"}


@router.get("/offer/{pin}")
async def get_offer(
    pin: str,
    cu:  dict = Depends(get_current_user),
):
    """
    Receiver fetches the sender's offer using the PIN.
    """
    session = await rtc_col.find_one({
        "pin":        pin,
        "expires_at": {"$gt": datetime.utcnow()},
    })
    if not session:
        raise HTTPException(404, "Invalid or expired PIN")

    return {
        "session_id":  str(session["_id"]),
        "offer":       session["offer"],
        "sender_name": session.get("sender_name", ""),
        "sender_ice":  session.get("sender_ice", []),
    }


@router.delete("/close/{pin}", status_code=204)
async def close_rtc_session(
    pin: str,
    cu:  dict = Depends(get_current_user),
):
    """Clean up after transfer completes."""
    await rtc_col.delete_one({"pin": pin})

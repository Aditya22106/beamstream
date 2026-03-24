from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from datetime import datetime

from database import notifications
from middleware.auth import get_current_user

router = APIRouter()


@router.get("/")
async def get_notifications(cu: dict = Depends(get_current_user)):
    cursor  = notifications.find(
        {"recipient_id": cu["user_id"]}
    ).sort("timestamp", -1).limit(50)

    result = []
    unread = 0
    async for n in cursor:
        result.append({
            "id":        str(n["_id"]),
            "message":   n["message"],
            "status":    n["status"],
            "timestamp": n["timestamp"].isoformat(),
        })
        if n["status"] == "unread":
            unread += 1

    return {"notifications": result, "unread_count": unread}


@router.patch("/{notif_id}/read")
async def mark_read(
    notif_id: str,
    cu:       dict = Depends(get_current_user),
):
    try:
        await notifications.update_one(
            {"_id": ObjectId(notif_id), "recipient_id": cu["user_id"]},
            {"$set": {"status": "read"}},
        )
    except Exception:
        raise HTTPException(400, "Invalid notification ID")
    return {"status": "ok"}


@router.patch("/read-all")
async def mark_all_read(cu: dict = Depends(get_current_user)):
    await notifications.update_many(
        {"recipient_id": cu["user_id"], "status": "unread"},
        {"$set": {"status": "read"}},
    )
    return {"status": "ok"}


@router.delete("/{notif_id}", status_code=204)
async def delete_notif(
    notif_id: str,
    cu:       dict = Depends(get_current_user),
):
    try:
        await notifications.delete_one(
            {"_id": ObjectId(notif_id), "recipient_id": cu["user_id"]}
        )
    except Exception:
        raise HTTPException(400, "Invalid notification ID")

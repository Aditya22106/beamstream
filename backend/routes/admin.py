from fastapi import APIRouter, HTTPException, Depends, Query
from bson import ObjectId
from datetime import datetime

from database import users, files as files_col, activity_logs, sessions
from middleware.auth import require_admin

router = APIRouter()


@router.get("/stats")
async def stats(_: dict = Depends(require_admin)):
    today = datetime.utcnow().replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return {
        "total_users":     await users.count_documents({}),
        "total_files":     await files_col.count_documents({}),
        "active_sessions": await sessions.count_documents(
            {"status": "active"}
        ),
        "actions_today":   await activity_logs.count_documents(
            {"timestamp": {"$gte": today}}
        ),
    }


@router.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    result = []
    async for u in users.find().sort("created_at", -1):
        result.append({
            "user_id":    str(u["_id"]),
            "name":       u["name"],
            "email":      u["email"],
            "role":       u.get("role", "user"),
            "created_at": u["created_at"].isoformat(),
            "last_login": u["last_login"].isoformat()
                          if u.get("last_login") else None,
        })
    return result


@router.patch("/users/{user_id}/role")
async def change_role(
    user_id: str,
    role:    str,
    _:       dict = Depends(require_admin),
):
    if role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")
    try:
        await users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"role": role}},
        )
    except Exception:
        raise HTTPException(400, "Invalid user ID")
    return {"status": "updated"}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    _:       dict = Depends(require_admin),
):
    try:
        result = await users.delete_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(400, "Invalid user ID")
    if result.deleted_count == 0:
        raise HTTPException(404, "User not found")


@router.get("/logs")
async def get_logs(
    limit: int  = Query(100, ge=1, le=500),
    skip:  int  = Query(0, ge=0),
    _:     dict = Depends(require_admin),
):
    total  = await activity_logs.count_documents({})
    cursor = activity_logs.find().sort(
        "timestamp", -1
    ).skip(skip).limit(limit)

    result = []
    async for log in cursor:
        result.append({
            "log_id":      str(log["_id"]),
            "user_id":     log["user_id"],
            "action_type": log["action_type"],
            "timestamp":   log["timestamp"].isoformat(),
            "details":     log.get("details", ""),
        })
    return {"logs": result, "total": total}


@router.get("/files")
async def list_all_files(
    limit: int  = Query(50, ge=1, le=200),
    _:     dict = Depends(require_admin),
):
    result = []
    async for f in files_col.find().sort("upload_date", -1).limit(limit):
        result.append({
            "file_id":     str(f["_id"]),
            "owner_name":  f.get("owner_name", ""),
            "file_name":   f["file_name"],
            "file_size":   f["file_size"],
            "upload_date": f["upload_date"].isoformat(),
            "session_id":  f.get("session_id"),
            "url":         f["url"],
        })
    return result

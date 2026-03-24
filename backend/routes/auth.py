from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime

from database import users, activity_logs
from services.auth_service import hash_password, verify_password, create_token
from middleware.auth import get_current_user

router = APIRouter()


class RegisterBody(BaseModel):
    name:     str
    email:    str
    password: str


class LoginBody(BaseModel):
    email:    str
    password: str


def _user_out(doc: dict) -> dict:
    return {
        "user_id":    str(doc["_id"]),
        "name":       doc["name"],
        "email":      doc["email"],
        "role":       doc.get("role", "user"),
        "created_at": doc["created_at"].isoformat(),
        "last_login": doc["last_login"].isoformat()
                      if doc.get("last_login") else None,
    }


@router.post("/register", status_code=201)
async def register(body: RegisterBody):
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    if "@" not in body.email:
        raise HTTPException(400, "Invalid email address")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    email = body.email.strip().lower()

    if await users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")

    result = await users.insert_one({
        "name":          body.name.strip(),
        "email":         email,
        "password_hash": hash_password(body.password),
        "role":          "user",
        "created_at":    datetime.utcnow(),
        "last_login":    None,
    })
    return {
        "user_id": str(result.inserted_id),
        "message": "Account created successfully",
    }


@router.post("/login")
async def login(body: LoginBody):
    if not body.email or not body.password:
        raise HTTPException(400, "Email and password are required")

    email = body.email.strip().lower()
    user  = await users.find_one({"email": email})

    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    await users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}},
    )
    await activity_logs.insert_one({
        "user_id":     str(user["_id"]),
        "action_type": "login",
        "timestamp":   datetime.utcnow(),
        "details":     email,
    })

    token = create_token(
        str(user["_id"]),
        user.get("role", "user"),
        user["name"],
    )
    return {
        "access_token": token,
        "token_type":   "bearer",
        "user":         _user_out(user),
    }


@router.post("/logout")
async def logout(cu: dict = Depends(get_current_user)):
    await activity_logs.insert_one({
        "user_id":     cu["user_id"],
        "action_type": "logout",
        "timestamp":   datetime.utcnow(),
        "details":     "",
    })
    return {"message": "Logged out successfully"}


@router.get("/me")
async def me(cu: dict = Depends(get_current_user)):
    user = await users.find_one({"_id": ObjectId(cu["user_id"])})
    if not user:
        raise HTTPException(404, "User not found")
    return _user_out(user)

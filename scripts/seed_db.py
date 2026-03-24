"""
seed_db.py — Populate MongoDB with demo data for BeamStream v2.
Run from the backend folder with venv active:
    python ../scripts/seed_db.py
"""

import asyncio
import sys
import os
import bcrypt
import random
import string

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

MONGO_URI     = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "beamstream")


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def gen_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


async def seed():
    client = AsyncIOMotorClient(MONGO_URI)
    db     = client[MONGO_DB_NAME]

    print("🌱 Seeding BeamStream v2 database…")

    for col in ["users", "files", "sessions", "documents",
                "notifications", "activity_logs"]:
        await db[col].delete_many({})
    print("  ✓ Cleared existing data")

    now = datetime.utcnow()

    # ── Users ──────────────────────────────────────────────────────────────────
    users = [
        {
            "_id":           ObjectId(),
            "name":          "Aditya Yeole",
            "email":         "aditya@beamstream.app",
            "password_hash": hash_pw("demo1234"),
            "role":          "admin",
            "created_at":    now - timedelta(days=30),
            "last_login":    now - timedelta(minutes=5),
        },
        {
            "_id":           ObjectId(),
            "name":          "Raunak Gond",
            "email":         "raunak@beamstream.app",
            "password_hash": hash_pw("demo1234"),
            "role":          "user",
            "created_at":    now - timedelta(days=20),
            "last_login":    now - timedelta(hours=2),
        },
        {
            "_id":           ObjectId(),
            "name":          "Manan Vernekar",
            "email":         "manan@beamstream.app",
            "password_hash": hash_pw("demo1234"),
            "role":          "user",
            "created_at":    now - timedelta(days=10),
            "last_login":    now - timedelta(days=1),
        },
    ]
    await db.users.insert_many(users)
    aditya, raunak, manan = users
    print(f"  ✓ Created {len(users)} users (password: demo1234)")

    # ── Session ────────────────────────────────────────────────────────────────
    otp        = gen_otp()
    session_id = ObjectId()
    await db.sessions.insert_one({
        "_id":        session_id,
        "otp_code":   otp,
        "device_a":   str(aditya["_id"]),
        "device_b":   str(raunak["_id"]),
        "status":     "active",
        "doc_type":   "file",
        "created_at": now - timedelta(minutes=10),
        "expires_at": now + timedelta(minutes=5),
    })
    print(f"  ✓ Created demo session  OTP: {otp}")

    # ── Notifications ──────────────────────────────────────────────────────────
    await db.notifications.insert_many([
        {
            "recipient_id": str(aditya["_id"]),
            "message":      "Raunak Gond joined your session",
            "status":       "unread",
            "timestamp":    now - timedelta(minutes=2),
        },
        {
            "recipient_id": str(raunak["_id"]),
            "message":      "Aditya Yeole shared a file with you",
            "status":       "unread",
            "timestamp":    now - timedelta(hours=1),
        },
        {
            "recipient_id": str(aditya["_id"]),
            "message":      "Document auto-saved successfully",
            "status":       "read",
            "timestamp":    now - timedelta(hours=2),
        },
    ])
    print("  ✓ Created 3 notifications")

    # ── Activity logs ──────────────────────────────────────────────────────────
    await db.activity_logs.insert_many([
        {
            "user_id":     str(aditya["_id"]),
            "action_type": "login",
            "timestamp":   now - timedelta(minutes=5),
            "details":     "aditya@beamstream.app",
        },
        {
            "user_id":     str(raunak["_id"]),
            "action_type": "session_join",
            "timestamp":   now - timedelta(minutes=3),
            "details":     str(session_id),
        },
        {
            "user_id":     str(aditya["_id"]),
            "action_type": "session_create",
            "timestamp":   now - timedelta(minutes=10),
            "details":     f"Session {str(session_id)}",
        },
    ])
    print("  ✓ Created activity logs")

    print("")
    print("✅ Seed complete!")
    print("")
    print("Demo accounts (password: demo1234):")
    print("  Admin → aditya@beamstream.app")
    print("  User  → raunak@beamstream.app")
    print("  User  → manan@beamstream.app")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())

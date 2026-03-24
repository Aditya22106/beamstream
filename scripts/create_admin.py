"""
create_admin.py — Create or promote a user to admin.
Usage:
    python create_admin.py --email admin@beamstream.app --password secret
    python create_admin.py --promote --email existing@beamstream.app
"""

import asyncio
import sys
import os
import argparse
import bcrypt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

MONGO_URI     = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "beamstream")


async def run(email: str, password: str | None, promote: bool):
    client   = AsyncIOMotorClient(MONGO_URI)
    db       = client[MONGO_DB_NAME]
    existing = await db.users.find_one({"email": email})

    if existing:
        if promote:
            await db.users.update_one(
                {"email": email},
                {"$set": {"role": "admin"}},
            )
            print(f"✅ Promoted {email} to admin.")
        else:
            print(f"⚠️  User {email} already exists. Use --promote to make admin.")
    else:
        if not password:
            print("❌ --password is required when creating a new user.")
            sys.exit(1)
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        await db.users.insert_one({
            "name":          email.split("@")[0].capitalize(),
            "email":         email,
            "password_hash": hashed,
            "role":          "admin",
            "created_at":    datetime.utcnow(),
            "last_login":    None,
        })
        print(f"✅ Admin user created: {email}")

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email",    required=True)
    parser.add_argument("--password", required=False)
    parser.add_argument("--promote",  action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.email, args.password, args.promote))

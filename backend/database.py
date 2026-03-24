import motor.motor_asyncio
from config import MONGO_URI, MONGO_DB_NAME

client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
db     = client[MONGO_DB_NAME]

users          = db["users"]
files          = db["files"]
sessions       = db["sessions"]
documents      = db["documents"]
notifications  = db["notifications"]
activity_logs  = db["activity_logs"]
chat_messages  = db["chat_messages"]
webrtc_sessions = db["webrtc_sessions"]


async def create_indexes():
    await users.create_index("email", unique=True)
    await files.create_index("session_id")
    await sessions.create_index("otp_code")
    await sessions.create_index("expires_at", expireAfterSeconds=0)
    await documents.create_index("session_id", unique=True)
    await notifications.create_index("recipient_id")
    await activity_logs.create_index("timestamp")
    await chat_messages.create_index("session_id")
    await chat_messages.create_index("timestamp")
    # WebRTC sessions auto-expire after 10 minutes
    await webrtc_sessions.create_index("expires_at", expireAfterSeconds=0)
    await webrtc_sessions.create_index("pin")
    print("[DB] Indexes created")

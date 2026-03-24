import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI             = os.getenv("MONGO_URI")
MONGO_DB_NAME         = os.getenv("MONGO_DB_NAME", "beamstream")
SECRET_KEY            = os.getenv("SECRET_KEY", "change-me")
ALGORITHM             = os.getenv("ALGORITHM", "HS256")
TOKEN_EXPIRE_HOURS    = int(os.getenv("TOKEN_EXPIRE_HOURS", "24"))
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY    = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
OTP_EXPIRE_MINUTES    = int(os.getenv("OTP_EXPIRE_MINUTES", "5"))
MAX_FILE_SIZE_MB      = int(os.getenv("MAX_FILE_SIZE_MB", "50"))

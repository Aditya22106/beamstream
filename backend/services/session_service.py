import random
import string
import qrcode
import io
import base64
from datetime import datetime, timedelta
from config import OTP_EXPIRE_MINUTES


def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def generate_qr(session_id: str, otp: str) -> str:
    data = f"beamstream://join/{session_id}/{otp}"
    qr   = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def session_expiry() -> datetime:
    return datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)

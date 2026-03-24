import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta
from config import SECRET_KEY, ALGORITHM, TOKEN_EXPIRE_HOURS


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            hashed.encode("utf-8"),
        )
    except Exception:
        return False


def create_token(user_id: str, role: str, name: str) -> str:
    return jwt.encode(
        {
            "sub":  user_id,
            "role": role,
            "name": name,
            "exp":  datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
            "iat":  datetime.utcnow(),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("sub"):
            raise ValueError("Invalid token payload")
        return payload
    except JWTError as e:
        raise ValueError(f"Token error: {e}")

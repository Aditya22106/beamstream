from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from services.auth_service import decode_token

security = HTTPBearer()


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        payload = decode_token(creds.credentials)
        return {
            "user_id": payload["sub"],
            "role":    payload.get("role", "user"),
            "name":    payload.get("name", ""),
        }
    except Exception as e:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = str(e),
            headers     = {"WWW-Authenticate": "Bearer"},
        )


def require_admin(
    current_user: dict = Depends(get_current_user),
) -> dict:
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "Admin access required",
        )
    return current_user

import cloudinary
import cloudinary.uploader
import cloudinary.api
from config import (
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
)

cloudinary.config(
    cloud_name = CLOUDINARY_CLOUD_NAME,
    api_key    = CLOUDINARY_API_KEY,
    api_secret = CLOUDINARY_API_SECRET,
    secure     = True,
)


def upload_file(
    file_bytes: bytes,
    filename:   str,
    folder:     str = "beamstream",
) -> dict:
    """Upload file bytes to Cloudinary. Returns url and public_id."""
    result = cloudinary.uploader.upload(
        file_bytes,
        folder          = folder,
        resource_type   = "auto",
        use_filename    = True,
        unique_filename = True,
    )
    return {
        "url":       result["secure_url"],
        "public_id": result["public_id"],
    }


def delete_file(public_id: str) -> bool:
    """Delete a single file from Cloudinary by public_id."""
    if not public_id:
        return False
    try:
        cloudinary.uploader.destroy(public_id, resource_type="auto")
        return True
    except Exception as e:
        print(f"[Cloudinary] Delete failed for {public_id}: {e}")
        return False


def delete_session_files(session_id: str) -> int:
    """Delete all files uploaded under a session folder."""
    deleted = 0
    try:
        result = cloudinary.api.resources(
            type          = "upload",
            prefix        = f"beamstream/{session_id}",
            resource_type = "image",
            max_results   = 100,
        )
        for r in result.get("resources", []):
            cloudinary.uploader.destroy(r["public_id"])
            deleted += 1
    except Exception:
        pass

    try:
        result = cloudinary.api.resources(
            type          = "upload",
            prefix        = f"beamstream/{session_id}",
            resource_type = "video",
            max_results   = 100,
        )
        for r in result.get("resources", []):
            cloudinary.uploader.destroy(
                r["public_id"], resource_type="video"
            )
            deleted += 1
    except Exception:
        pass

    try:
        result = cloudinary.api.resources(
            type          = "upload",
            prefix        = f"beamstream/{session_id}",
            resource_type = "raw",
            max_results   = 100,
        )
        for r in result.get("resources", []):
            cloudinary.uploader.destroy(
                r["public_id"], resource_type="raw"
            )
            deleted += 1
    except Exception:
        pass

    return deleted

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import auth, files, sessions, documents, notifications, admin, webrtc
from socket_manager import sio
from database import create_indexes

app = FastAPI(
    title       = "BeamStream API",
    description = "Cloud-based file sharing and document collaboration platform",
    version     = "2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(auth.router,          prefix="/api/auth",          tags=["Authentication"])
app.include_router(files.router,         prefix="/api/files",         tags=["Files"])
app.include_router(sessions.router,      prefix="/api/sessions",      tags=["Sessions"])
app.include_router(documents.router,     prefix="/api/documents",     tags=["Documents"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(admin.router,         prefix="/api/admin",         tags=["Admin"])
app.include_router(webrtc.router,        prefix="/api/webrtc",        tags=["WebRTC"])


@app.on_event("startup")
async def startup():
    await create_indexes()
    print("BeamStream API v2.0 started")


@app.get("/")
async def root():
    return {
        "message": "BeamStream API v2.0",
        "status":  "running",
        "docs":    "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


socket_app = socketio.ASGIApp(sio, app)

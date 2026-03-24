import socketio
from datetime import datetime
from services.auth_service import decode_token

sio    = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
rooms: dict[str, dict] = {}

COLORS = [
    "#4285f4", "#0f9d58", "#f4b400", "#db4437",
    "#673ab7", "#e91e63", "#00bcd4", "#ff5722",
]


def _color(idx: int) -> str:
    return COLORS[idx % len(COLORS)]


@sio.event
async def connect(sid, environ, auth):
    token = (auth or {}).get("token", "")
    try:
        payload = decode_token(token)
        await sio.save_session(sid, {
            "user_id": payload["sub"],
            "name":    payload.get("name", "User"),
        })
        print(f"[WS] Connected: {payload.get('name')} ({sid})")
    except Exception as e:
        print(f"[WS] Auth failed: {e}")
        await sio.disconnect(sid)


@sio.event
async def disconnect(sid):
    try:
        session = await sio.get_session(sid)
        uid     = session.get("user_id")
        for room_id, members in list(rooms.items()):
            if uid in members:
                del members[uid]
                await sio.emit("user_left", {"user_id": uid}, room=room_id)
                if not members:
                    del rooms[room_id]
                break
        print(f"[WS] Disconnected: {uid} ({sid})")
    except Exception:
        pass


@sio.event
async def join_room(sid, data):
    """data: { session_id }"""
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        name    = session["name"]
        room_id = data.get("session_id")

        await sio.enter_room(sid, room_id)

        if room_id not in rooms:
            rooms[room_id] = {}

        color = _color(len(rooms[room_id]))
        rooms[room_id][uid] = {
            "name":   name,
            "color":  color,
            "cursor": 0,
        }

        await sio.emit("room_state", {
            "users": [
                {"user_id": u, **info}
                for u, info in rooms[room_id].items()
            ]
        }, room=room_id)

        print(f"[WS] {name} joined room {room_id}")
    except Exception as e:
        print(f"[WS] join_room error: {e}")


@sio.event
async def leave_room(sid, data):
    """data: { session_id }"""
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")
        await sio.leave_room(sid, room_id)
        if room_id in rooms and uid in rooms[room_id]:
            del rooms[room_id][uid]
        await sio.emit("user_left", {"user_id": uid}, room=room_id)
    except Exception as e:
        print(f"[WS] leave_room error: {e}")


@sio.event
async def doc_change(sid, data):
    """
    Broadcast document delta to all other users in the room.
    data: { session_id, delta, content, version, doc_type }
    """
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")

        await sio.emit(
            "doc_update",
            {
                "delta":    data.get("delta"),
                "content":  data.get("content"),
                "version":  data.get("version"),
                "doc_type": data.get("doc_type"),
                "from":     uid,
                "name":     session["name"],
            },
            room     = room_id,
            skip_sid = sid,
        )
    except Exception as e:
        print(f"[WS] doc_change error: {e}")


@sio.event
async def cursor_move(sid, data):
    """
    Broadcast cursor position.
    data: { session_id, index, length }
    """
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")
        color   = rooms.get(room_id, {}).get(uid, {}).get("color", "#4285f4")

        await sio.emit(
            "cursor_update",
            {
                "user_id": uid,
                "name":    session["name"],
                "color":   color,
                "index":   data.get("index", 0),
                "length":  data.get("length", 0),
            },
            room     = room_id,
            skip_sid = sid,
        )
    except Exception as e:
        print(f"[WS] cursor_move error: {e}")


@sio.event
async def sheet_change(sid, data):
    """
    Broadcast spreadsheet cell changes.
    data: { session_id, cells, version }
    """
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")

        await sio.emit(
            "sheet_update",
            {
                "cells":   data.get("cells"),
                "version": data.get("version"),
                "from":    uid,
                "name":    session["name"],
            },
            room     = room_id,
            skip_sid = sid,
        )
    except Exception as e:
        print(f"[WS] sheet_change error: {e}")


@sio.event
async def slide_change(sid, data):
    """
    Broadcast presentation slide changes.
    data: { session_id, slides, version }
    """
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")

        await sio.emit(
            "slide_update",
            {
                "slides":  data.get("slides"),
                "version": data.get("version"),
                "from":    uid,
                "name":    session["name"],
            },
            room     = room_id,
            skip_sid = sid,
        )
    except Exception as e:
        print(f"[WS] slide_change error: {e}")


@sio.event
async def file_notify(sid, data):
    """
    Notify all room members that a new file was uploaded.
    data: { session_id, file }
    """
    try:
        session = await sio.get_session(sid)
        room_id = data.get("session_id")
        await sio.emit(
            "new_file",
            {
                "file": data.get("file"),
                "from": session["name"],
            },
            room     = room_id,
            skip_sid = sid,
        )
    except Exception as e:
        print(f"[WS] file_notify error: {e}")


@sio.event
async def chat_message(sid, data):
    """
    Broadcast a chat message to all users in the room and persist it.
    data: { session_id, text }
    """
    try:
        from database import chat_messages

        session = await sio.get_session(sid)
        uid     = session["user_id"]
        name    = session["name"]
        room_id = data.get("session_id")
        text    = (data.get("text") or "").strip()

        if not text:
            return

        color = rooms.get(room_id, {}).get(uid, {}).get("color", "#4285f4")

        msg = {
            "session_id": room_id,
            "user_id":    uid,
            "name":       name,
            "color":      color,
            "text":       text,
            "timestamp":  datetime.utcnow(),
        }

        # Persist to MongoDB
        result = await chat_messages.insert_one(msg)

        payload = {
            "id":        str(result.inserted_id),
            "user_id":   uid,
            "name":      name,
            "color":     color,
            "text":      text,
            "timestamp": msg["timestamp"].isoformat(),
        }

        # Broadcast to everyone in the room INCLUDING sender
        await sio.emit("new_message", payload, room=room_id)

        print(f"[WS] Chat from {name} in {room_id}: {text[:40]}")
    except Exception as e:
        print(f"[WS] chat_message error: {e}")

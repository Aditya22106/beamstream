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
    except Exception as e:
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
    except Exception:
        pass


@sio.event
async def join_room(sid, data):
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        name    = session["name"]
        room_id = data.get("session_id")
        await sio.enter_room(sid, room_id)
        if room_id not in rooms:
            rooms[room_id] = {}
        color = _color(len(rooms[room_id]))
        rooms[room_id][uid] = {"name": name, "color": color, "cursor": 0}
        await sio.emit("room_state", {
            "users": [{"user_id": u, **info} for u, info in rooms[room_id].items()]
        }, room=room_id)
    except Exception as e:
        print(f"[WS] join_room error: {e}")


@sio.event
async def leave_room(sid, data):
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
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")
        await sio.emit("doc_update", {
            "delta":    data.get("delta"),
            "content":  data.get("content"),
            "version":  data.get("version"),
            "doc_type": data.get("doc_type"),
            "from":     uid,
            "name":     session["name"],
        }, room=room_id, skip_sid=sid)
    except Exception as e:
        print(f"[WS] doc_change error: {e}")


@sio.event
async def cursor_move(sid, data):
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")
        color   = rooms.get(room_id, {}).get(uid, {}).get("color", "#4285f4")
        await sio.emit("cursor_update", {
            "user_id": uid,
            "name":    session["name"],
            "color":   color,
            "index":   data.get("index", 0),
            "length":  data.get("length", 0),
        }, room=room_id, skip_sid=sid)
    except Exception as e:
        print(f"[WS] cursor_move error: {e}")


@sio.event
async def sheet_change(sid, data):
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")
        await sio.emit("sheet_update", {
            "cells":   data.get("cells"),
            "version": data.get("version"),
            "from":    uid,
            "name":    session["name"],
        }, room=room_id, skip_sid=sid)
    except Exception as e:
        print(f"[WS] sheet_change error: {e}")


@sio.event
async def slide_change(sid, data):
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")
        await sio.emit("slide_update", {
            "slides":  data.get("slides"),
            "version": data.get("version"),
            "from":    uid,
            "name":    session["name"],
        }, room=room_id, skip_sid=sid)
    except Exception as e:
        print(f"[WS] slide_change error: {e}")


@sio.event
async def file_notify(sid, data):
    try:
        session = await sio.get_session(sid)
        room_id = data.get("session_id")
        await sio.emit("new_file", {
            "file": data.get("file"),
            "from": session["name"],
        }, room=room_id, skip_sid=sid)
    except Exception as e:
        print(f"[WS] file_notify error: {e}")


@sio.event
async def chat_message(sid, data):
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
        msg   = {
            "session_id": room_id,
            "user_id":    uid,
            "name":       name,
            "color":      color,
            "text":       text,
            "timestamp":  datetime.utcnow(),
        }
        result  = await chat_messages.insert_one(msg)
        payload = {
            "id":        str(result.inserted_id),
            "user_id":   uid,
            "name":      name,
            "color":     color,
            "text":      text,
            "timestamp": msg["timestamp"].isoformat(),
        }
        await sio.emit("new_message", payload, room=room_id)
    except Exception as e:
        print(f"[WS] chat_message error: {e}")


# ── VOICE CHAT EVENTS ──────────────────────────────────────────────────────

@sio.event
async def voice_join(sid, data):
    """
    User joined the voice room.
    Notify all other users in the session room so they can
    initiate WebRTC offers to the new peer.
    data: { session_id, name }
    """
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        name    = session["name"]
        room_id = data.get("session_id")

        # Notify all others — they need to initiate offers to the new peer
        await sio.emit("voice_user_joined", {
            "user_id": uid,
            "name":    name,
        }, room=room_id, skip_sid=sid)

        print(f"[Voice] {name} joined voice in room {room_id}")
    except Exception as e:
        print(f"[WS] voice_join error: {e}")


@sio.event
async def voice_leave(sid, data):
    """
    User left the voice room.
    data: { session_id }
    """
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")

        await sio.emit("voice_user_left", {
            "user_id": uid,
        }, room=room_id, skip_sid=sid)

        print(f"[Voice] {session['name']} left voice in room {room_id}")
    except Exception as e:
        print(f"[WS] voice_leave error: {e}")


@sio.event
async def voice_signal(sid, data):
    """
    Relay WebRTC signal (offer/answer/ICE) between two specific peers.
    data: { session_id, to_user_id, signal, signal_type }

    We find the socket ID of the target user and emit directly to them.
    This avoids polling — signals are delivered instantly via Socket.io.
    """
    try:
        session    = await sio.get_session(sid)
        uid        = session["user_id"]
        name       = session["name"]
        room_id    = data.get("session_id")
        to_user_id = data.get("to_user_id")

        # Find the socket ID of the target user
        # We search all sockets in the room
        target_sid = None
        for s_id in sio.manager.get_participants("/", room_id):
            try:
                s_session = await sio.get_session(s_id)
                if s_session.get("user_id") == to_user_id:
                    target_sid = s_id
                    break
            except Exception:
                continue

        if target_sid:
            await sio.emit("voice_signal", {
                "from_user":   uid,
                "from_name":   name,
                "signal":      data.get("signal"),
                "signal_type": data.get("signal_type"),
            }, to=target_sid)
        else:
            # Fallback — broadcast to room (target will filter by from_user)
            await sio.emit("voice_signal", {
                "from_user":   uid,
                "from_name":   name,
                "signal":      data.get("signal"),
                "signal_type": data.get("signal_type"),
            }, room=room_id, skip_sid=sid)

    except Exception as e:
        print(f"[WS] voice_signal error: {e}")


@sio.event
async def voice_mute(sid, data):
    """
    Broadcast mute/unmute state to all room members.
    data: { session_id, muted }
    """
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")

        await sio.emit("voice_mute_update", {
            "user_id": uid,
            "muted":   data.get("muted", False),
        }, room=room_id, skip_sid=sid)
    except Exception as e:
        print(f"[WS] voice_mute error: {e}")


@sio.event
async def voice_speaking(sid, data):
    """
    Broadcast speaking state for visual indicator.
    data: { session_id, speaking }
    """
    try:
        session = await sio.get_session(sid)
        uid     = session["user_id"]
        room_id = data.get("session_id")

        await sio.emit("voice_speaking_update", {
            "user_id":  uid,
            "speaking": data.get("speaking", False),
        }, room=room_id, skip_sid=sid)
    except Exception as e:
        print(f"[WS] voice_speaking error: {e}")

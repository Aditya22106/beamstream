import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
  return socket
}

export function connectSocket(token) {
  if (socket?.connected) return socket

  socket = io('/', {
    auth:                 { token },
    transports:           ['websocket', 'polling'],
    reconnection:         true,
    reconnectionDelay:    1000,
    reconnectionAttempts: 10,
  })

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id)
  })
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
  })
  socket.on('connect_error', (err) => {
    console.error('[Socket] Error:', err.message)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function joinRoom(sessionId) {
  socket?.emit('join_room', { session_id: sessionId })
}

export function leaveRoom(sessionId) {
  socket?.emit('leave_room', { session_id: sessionId })
}

// Document collaboration
export function emitDocChange(sessionId, delta, content, version, docType) {
  socket?.emit('doc_change', {
    session_id: sessionId,
    delta,
    content,
    version,
    doc_type: docType,
  })
}

export function emitCursorMove(sessionId, index, length) {
  socket?.emit('cursor_move', { session_id: sessionId, index, length })
}

// Spreadsheet collaboration
export function emitSheetChange(sessionId, cells, version) {
  socket?.emit('sheet_change', { session_id: sessionId, cells, version })
}

// Presentation collaboration
export function emitSlideChange(sessionId, slides, version) {
  socket?.emit('slide_change', { session_id: sessionId, slides, version })
}

// File sharing notification
export function emitFileNotify(sessionId, file) {
  socket?.emit('file_notify', { session_id: sessionId, file })
}

// Chat message
export function emitChatMessage(sessionId, text) {
  socket?.emit('chat_message', { session_id: sessionId, text })
}

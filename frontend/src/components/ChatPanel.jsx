import { useState, useEffect, useRef, useCallback } from 'react'
import { getSocket, emitChatMessage } from '../api/socket'
import { useAuth } from '../context/AuthContext'
import { formatDate, getInitials } from '../utils/helpers'
import api from '../api/axios'
import { Send, MessageSquare } from 'lucide-react'

/**
 * ChatPanel — Real-time chat for a BeamStream session.
 *
 * Props:
 *   sessionId  string   — The active session ID
 *   accentColor string  — Hex color for send button (matches editor theme)
 *   compact    bool     — If true, renders without outer border/bg (for embedding in panels)
 */
export default function ChatPanel({
  sessionId,
  accentColor = '#4285f4',
  compact = false,
}) {
  const { user }           = useAuth()
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)

  // ── Load chat history from MongoDB ─────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    api.get(`/sessions/${sessionId}/messages`)
      .then(({ data }) => {
        setMessages(data.messages || [])
      })
      .catch(() => {})
  }, [sessionId])

  // ── Listen for new messages via Socket.io ───────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    function onNewMessage(msg) {
      setMessages(prev => {
        // Avoid duplicates (in case server echoes back)
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }

    socket.on('new_message', onNewMessage)
    return () => socket.off('new_message', onNewMessage)
  }, [])

  // ── Auto scroll to bottom on new message ───────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    emitChatMessage(sessionId, text)
    setInput('')
    setSending(false)
    inputRef.current?.focus()
  }, [input, sending, sessionId])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Group messages by sender for cleaner UI ─────────────────────────────────
  function isNewGroup(idx) {
    if (idx === 0) return true
    return messages[idx].user_id !== messages[idx - 1].user_id
  }

  const containerClass = compact
    ? 'flex flex-col h-full'
    : 'flex flex-col h-full bg-white border-l border-gray-200'

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <MessageSquare size={15} style={{ color: accentColor }} />
        <span className="text-sm font-semibold text-gray-700">Session Chat</span>
        <span className="ml-auto text-xs text-gray-400">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <MessageSquare size={32} className="text-gray-200" />
            <p className="text-xs text-gray-400 text-center">
              No messages yet.<br />Start the conversation!
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe    = msg.user_id === user?.user_id
            const newGroup = isNewGroup(idx)

            return (
              <div
                key={msg.id || idx}
                className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}
                  ${newGroup ? 'mt-3' : 'mt-0.5'}`}
              >
                {/* Avatar — only show on first message of group */}
                <div className="flex-shrink-0 w-7">
                  {newGroup && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center
                                 text-white text-[9px] font-bold"
                      style={{ background: msg.color || accentColor }}
                    >
                      {getInitials(msg.name)}
                    </div>
                  )}
                </div>

                {/* Bubble */}
                <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {/* Name + time — only on first of group */}
                  {newGroup && (
                    <div className={`flex items-center gap-1.5 mb-1
                      ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span className="text-[10px] font-semibold"
                        style={{ color: msg.color || accentColor }}>
                        {isMe ? 'You' : msg.name}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatDate(msg.timestamp)}
                      </span>
                    </div>
                  )}

                  {/* Message bubble */}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words
                      ${isMe
                        ? 'rounded-tr-sm text-white'
                        : 'rounded-tl-sm bg-gray-100 text-gray-800'}`}
                    style={isMe ? { background: accentColor } : {}}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-gray-100">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-200
                        rounded-xl px-3 py-2 focus-within:border-gray-400 transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-700 resize-none
                       outline-none placeholder-gray-400 leading-relaxed
                       max-h-24 overflow-y-auto"
            style={{ minHeight: '22px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                       disabled:opacity-40 transition hover:opacity-80"
            style={{ background: accentColor }}
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

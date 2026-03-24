import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import Quill from 'quill'
import QuillCursors from 'quill-cursors'
import api from '../api/axios'
import { getSocket, joinRoom, leaveRoom, emitDocChange, emitCursorMove } from '../api/socket'
import { useAuth } from '../context/AuthContext'
import { getErrMsg, formatDate, getInitials } from '../utils/helpers'
import ChatPanel from '../components/ChatPanel'
import toast from 'react-hot-toast'
import { MessageSquare, Clock, X, Users } from 'lucide-react'

Quill.register('modules/cursors', QuillCursors)

export default function DocEditor() {
  const { sessionId } = useParams()
  const { state }     = useLocation()
  const navigate      = useNavigate()
  const { user }      = useAuth()

  const editorRef  = useRef(null)
  const quillRef   = useRef(null)
  const cursorsRef = useRef(null)
  const isRemote   = useRef(false)
  const saveTimer  = useRef(null)

  const [session,    setSession]    = useState(state?.session || null)
  const [docData,    setDocData]    = useState(null)
  const [title,      setTitle]      = useState('Untitled Document')
  const [version,    setVersion]    = useState(1)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [connUsers,  setConnUsers]  = useState([])
  const [comments,   setComments]   = useState([])
  const [versions,   setVersions]   = useState([])
  const [newComment, setNewComment] = useState('')
  const [showPanel,  setShowPanel]  = useState('chat')   // chat | comments | history | null
  const [updatedBy,  setUpdatedBy]  = useState('')

  // ── Load session + doc ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        if (!session) {
          const { data } = await api.get(`/sessions/${sessionId}`)
          setSession(data)
        }
        const { data } = await api.get(`/documents/${sessionId}`)
        if (data.exists) {
          setDocData(data)
          setTitle(data.title)
          setVersion(data.version)
          setComments(data.comments || [])
          setVersions(data.versions || [])
          setUpdatedBy(data.updated_by || '')
        }
      } catch (err) {
        toast.error(getErrMsg(err))
      }
    }
    load()
  }, [sessionId])

  // ── Init Quill ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current || quillRef.current) return

    quillRef.current = new Quill(editorRef.current, {
      theme: 'snow',
      placeholder: 'Start typing your document here…',
      modules: {
        cursors: true,
        toolbar: [
          [{ font: [] }, { size: ['small', false, 'large', 'huge'] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ script: 'sub' }, { script: 'super' }],
          ['blockquote', 'code-block'],
          [{ header: 1 }, { header: 2 }, { header: 3 }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ indent: '-1' }, { indent: '+1' }],
          [{ align: [] }],
          ['link', 'image'],
          ['clean'],
        ],
      },
    })

    cursorsRef.current = quillRef.current.getModule('cursors')

    if (docData?.content?.ops) {
      quillRef.current.setContents(docData.content)
    } else if (docData?.content?.text) {
      quillRef.current.setText(docData.content.text)
    }

    quillRef.current.on('text-change', (delta, _old, source) => {
      if (source !== 'user') return
      setSaveStatus('saving')
      const content = quillRef.current.getContents()
      const newVer  = version + 1
      setVersion(newVer)
      emitDocChange(sessionId, delta, content, newVer, 'document')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => saveDoc(content, newVer), 1500)
    })

    quillRef.current.on('selection-change', (range) => {
      if (!range) return
      emitCursorMove(sessionId, range.index, range.length)
    })

    return () => {
      if (quillRef.current) {
        quillRef.current.off('text-change')
        quillRef.current.off('selection-change')
      }
    }
  }, [docData])

  // ── Socket listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    joinRoom(sessionId)

    socket.on('room_state', ({ users }) => setConnUsers(users))
    socket.on('user_left',  ({ user_id }) =>
      setConnUsers(p => p.filter(u => u.user_id !== user_id)))

    socket.on('doc_update', ({ delta, from, name, version: rv }) => {
      if (!quillRef.current || !delta) return
      isRemote.current = true
      quillRef.current.updateContents(delta, 'api')
      isRemote.current = false
      setVersion(rv)
      setUpdatedBy(name)
      setSaveStatus('saved')
    })

    socket.on('cursor_update', ({ user_id, name, color, index, length }) => {
      if (!cursorsRef.current) return
      try {
        cursorsRef.current.createCursor(user_id, name, color)
        cursorsRef.current.moveCursor(user_id, { index, length })
      } catch {}
    })

    return () => {
      socket.off('room_state')
      socket.off('user_left')
      socket.off('doc_update')
      socket.off('cursor_update')
      leaveRoom(sessionId)
    }
  }, [sessionId])

  const saveDoc = useCallback(async (content, ver) => {
    try {
      await api.post('/documents/save', {
        session_id: sessionId,
        doc_type:   'document',
        title,
        content:    content || quillRef.current?.getContents(),
        version:    ver || version,
      })
      setSaveStatus('saved')
      setUpdatedBy(user?.name || '')
    } catch {
      setSaveStatus('error')
    }
  }, [sessionId, title, version, user])

  async function postComment() {
    if (!newComment.trim()) return
    try {
      const { data } = await api.post(`/documents/${sessionId}/comment`,
        { text: newComment.trim() })
      setComments(p => [...p, data.comment])
      setNewComment('')
      toast.success('Comment added')
    } catch (err) {
      toast.error(getErrMsg(err))
    }
  }

  async function closeEditor() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await saveDoc(quillRef.current?.getContents(), version)
    leaveRoom(sessionId)
    navigate('/collaborate')
  }

  const COLOR_MAP  = { saved: '#0f9d58', saving: '#f4b400', error: '#ef4444' }
  const STATUS_TEXT = { saved: '✓ All changes saved', saving: '⟳ Saving…', error: '✗ Save failed' }

  const PANEL_TABS = [
    { id: 'chat',     label: '💬 Chat'    },
    { id: 'comments', label: '📝 Comments' },
    { id: 'history',  label: '🕒 History'  },
  ]

  return (
    <div className="h-screen flex flex-col bg-[#f0f0f0] overflow-hidden">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-shrink-0 shadow-sm">
        <span className="text-2xl">📝</span>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => saveDoc(null, version)}
          className="flex-1 text-lg font-medium text-gray-800 bg-transparent border-none outline-none
                     border-b-2 border-transparent focus:border-brand-500 transition py-1"
        />

        {session?.otp_code && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-1.5 text-center flex-shrink-0">
            <p className="text-[10px] text-brand-500 font-semibold uppercase tracking-wider">Share OTP</p>
            <p className="text-lg font-black text-brand-500 tracking-widest">{session.otp_code}</p>
          </div>
        )}

        <span className="text-xs font-medium flex-shrink-0"
          style={{ color: COLOR_MAP[saveStatus] }}>
          {STATUS_TEXT[saveStatus]}
        </span>

        {/* Panel tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {PANEL_TABS.map(({ id, label }) => (
            <button key={id}
              onClick={() => setShowPanel(p => p === id ? null : id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition
                ${showPanel === id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        <button onClick={closeEditor}
          className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-500 rounded-lg transition">
          <X size={18} />
        </button>
      </div>

      {/* ── Users bar ── */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Users size={13} />
          <span>{connUsers.length + 1} editing</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-brand-100">
          <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-white text-[9px] font-bold">
            {getInitials(user?.name)}
          </div>
          <span className="text-xs text-brand-700 font-medium">{user?.name}</span>
          <span className="text-[10px] text-brand-500">● editing</span>
        </div>
        {connUsers.map(u => (
          <div key={u.user_id} className="flex items-center gap-1.5 px-2 py-1 rounded-full"
            style={{ background: u.color + '22' }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
              style={{ background: u.color }}>
              {getInitials(u.name)}
            </div>
            <span className="text-xs font-medium" style={{ color: u.color }}>{u.name}</span>
          </div>
        ))}
        {updatedBy && (
          <span className="ml-auto text-xs text-gray-400">
            Last edit by <b className="text-gray-600">{updatedBy}</b>
          </span>
        )}
        <span className="text-xs text-gray-400">v{version}</span>
      </div>

      {/* ── Editor + Sidebar ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Quill editor */}
        <div className="flex-1 overflow-auto">
          <div ref={editorRef} className="h-full" />
        </div>

        {/* Side panel */}
        {showPanel && (
          <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0">

            {/* Panel tab switcher */}
            <div className="flex border-b border-gray-100 flex-shrink-0">
              {PANEL_TABS.map(({ id, label }) => (
                <button key={id} onClick={() => setShowPanel(id)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition
                    ${showPanel === id
                      ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50'
                      : 'text-gray-400 hover:text-gray-600'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Chat panel */}
            {showPanel === 'chat' && (
              <div className="flex-1 overflow-hidden">
                <ChatPanel
                  sessionId={sessionId}
                  accentColor="#4285f4"
                  compact
                />
              </div>
            )}

            {/* Comments panel */}
            {showPanel === 'comments' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {comments.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-8">No comments yet</p>
                    : comments.map((c, i) => (
                      <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-white text-[9px] font-bold">
                            {getInitials(c.author)}
                          </div>
                          <span className="text-xs font-semibold text-gray-700">{c.author}</span>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">{c.text}</p>
                        <p className="text-[10px] text-gray-400 mt-1.5">{formatDate(c.time)}</p>
                      </div>
                    ))
                  }
                </div>
                <div className="p-3 border-t border-gray-100 flex-shrink-0">
                  <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Add a comment…"
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-brand-500 text-gray-700"
                  />
                  <button onClick={postComment}
                    className="mt-2 w-full py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg transition">
                    Post Comment
                  </button>
                </div>
              </div>
            )}

            {/* Version history */}
            {showPanel === 'history' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {versions.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-8">No versions yet</p>
                  : [...versions].reverse().slice(0, 20).map((v, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-brand-600">Version {v.version}</span>
                        <span className="text-[10px] text-gray-400">{formatDate(v.time)}</span>
                      </div>
                      <p className="text-xs text-gray-500">{v.saved_by}</p>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

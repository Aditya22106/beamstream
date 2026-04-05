import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { getSocket, joinRoom, leaveRoom, emitSlideChange } from '../api/socket'
import { useAuth } from '../context/AuthContext'
import { getErrMsg, formatDate, getInitials } from '../utils/helpers'
import ChatPanel from '../components/ChatPanel'
import VoiceBar from '../components/VoiceBar'
import toast from 'react-hot-toast'
import { X, Users, Plus, Trash2, Play } from 'lucide-react'

const BG_COLORS = [
  '#ffffff','#f8f9fa','#e8f0fe','#e6f4ea','#fef9e7',
  '#fce8e6','#f3e8fd','#e0f7fa','#1a1a2e','#0d1117',
]

export default function SlideEditor() {
  const { sessionId } = useParams()
  const { state }     = useLocation()
  const navigate      = useNavigate()
  const { user }      = useAuth()

  const saveTimer = useRef(null)
  const isRemote  = useRef(false)

  const [session,    setSession]    = useState(state?.session || null)
  const [slides,     setSlides]     = useState([{ id:1, title:'', content:'', notes:'', bg:'#ffffff' }])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [title,      setTitle]      = useState('Untitled Presentation')
  const [version,    setVersion]    = useState(1)
  const [saveStatus, setSaveStatus] = useState('saved')
  const [connUsers,  setConnUsers]  = useState([])
  const [comments,   setComments]   = useState([])
  const [versions,   setVersions]   = useState([])
  const [newComment, setNewComment] = useState('')
  const [showPanel,  setShowPanel]  = useState('chat')
  const [updatedBy,  setUpdatedBy]  = useState('')
  const [presenting, setPresenting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        if (!session) {
          const { data } = await api.get(`/sessions/${sessionId}`)
          setSession(data)
        }
        const { data } = await api.get(`/documents/${sessionId}`)
        if (data.exists) {
          setTitle(data.title)
          setVersion(data.version)
          setComments(data.comments || [])
          setVersions(data.versions || [])
          setUpdatedBy(data.updated_by || '')
          if (data.content?.slides?.length > 0) setSlides(data.content.slides)
        }
      } catch (err) { toast.error(getErrMsg(err)) }
    }
    load()
  }, [sessionId])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    joinRoom(sessionId)
    socket.on('room_state', ({ users }) => setConnUsers(users))
    socket.on('user_left',  ({ user_id }) =>
      setConnUsers(p => p.filter(u => u.user_id !== user_id)))
    socket.on('slide_update', ({ slides: remoteSlides, version: rv, name }) => {
      if (!remoteSlides) return
      isRemote.current = true
      setSlides(remoteSlides)
      isRemote.current = false
      setVersion(rv)
      setUpdatedBy(name)
      setSaveStatus('saved')
    })
    return () => {
      socket.off('room_state')
      socket.off('user_left')
      socket.off('slide_update')
      leaveRoom(sessionId)
    }
  }, [sessionId])

  const persistSlides = useCallback((newSlides, newVer) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await api.post('/documents/save', {
          session_id: sessionId, doc_type: 'presentation',
          title, content: { slides: newSlides }, version: newVer,
        })
        setSaveStatus('saved')
        setUpdatedBy(user?.name || '')
      } catch { setSaveStatus('error') }
    }, 1000)
  }, [sessionId, title, user])

  const updateSlide = useCallback((field, value) => {
    if (isRemote.current) return
    setSlides(prev => {
      const next   = prev.map((s, i) => i === currentIdx ? { ...s, [field]: value } : s)
      const newVer = version + 1
      setVersion(newVer)
      setSaveStatus('saving')
      emitSlideChange(sessionId, next, newVer)
      persistSlides(next, newVer)
      return next
    })
  }, [currentIdx, sessionId, version, persistSlides])

  function addSlide() {
    const next   = [...slides, { id: slides.length+1, title:'', content:'', notes:'', bg:'#ffffff' }]
    const newVer = version + 1
    setSlides(next)
    setCurrentIdx(next.length - 1)
    setVersion(newVer)
    emitSlideChange(sessionId, next, newVer)
    persistSlides(next, newVer)
  }

  function deleteSlide(idx) {
    if (slides.length <= 1) return toast.error('Cannot delete the only slide')
    const next   = slides.filter((_, i) => i !== idx)
    const newVer = version + 1
    setSlides(next)
    setCurrentIdx(Math.max(0, idx - 1))
    setVersion(newVer)
    emitSlideChange(sessionId, next, newVer)
    persistSlides(next, newVer)
  }

  async function postComment() {
    if (!newComment.trim()) return
    try {
      const { data } = await api.post(`/documents/${sessionId}/comment`, { text: newComment.trim() })
      setComments(p => [...p, data.comment])
      setNewComment('')
    } catch (err) { toast.error(getErrMsg(err)) }
  }

  async function closeEditor() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    try {
      await api.post('/documents/save', {
        session_id: sessionId, doc_type: 'presentation',
        title, content: { slides }, version,
      })
    } catch {}
    leaveRoom(sessionId)
    navigate('/collaborate')
  }

  const STATUS_COLOR = { saved: '#f4b400', saving: '#94a3b8', error: '#ef4444' }
  const STATUS_TEXT  = { saved: '✓ Saved', saving: '⟳ Saving…', error: '✗ Error' }

  const PANEL_TABS = [
    { id: 'chat',     label: '💬 Chat'    },
    { id: 'comments', label: '📝 Comments' },
    { id: 'history',  label: '🕒 History'  },
  ]

  const slide = slides[currentIdx] || slides[0]

  if (presenting) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
        <div className="w-full max-w-5xl mx-auto px-8">
          <div className="rounded-lg shadow-2xl overflow-hidden flex flex-col p-16 gap-8"
            style={{ background: slide.bg || '#ffffff', aspectRatio: '16/9', minHeight: '360px' }}>
            <h1 className="text-5xl font-bold leading-tight"
              style={{ color: (slide.bg === '#1a1a2e' || slide.bg === '#0d1117') ? '#fff' : '#202124' }}>
              {slide.title || 'Untitled Slide'}
            </h1>
            <div className="text-2xl leading-relaxed whitespace-pre-line flex-1"
              style={{ color: (slide.bg === '#1a1a2e' || slide.bg === '#0d1117') ? '#e2e8f0' : '#444' }}>
              {slide.content || ''}
            </div>
          </div>
          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setCurrentIdx(p => Math.max(0, p-1))}
              disabled={currentIdx === 0}
              className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl
                         disabled:opacity-30 transition">
              ← Previous
            </button>
            <div className="flex items-center gap-2">
              {slides.map((_, i) => (
                <button key={i} onClick={() => setCurrentIdx(i)}
                  className={`w-2.5 h-2.5 rounded-full transition
                    ${i === currentIdx ? 'bg-yellow-400 scale-125' : 'bg-white/40'}`} />
              ))}
              <span className="ml-4 text-white/70 text-sm">{currentIdx+1} / {slides.length}</span>
            </div>
            <button onClick={() => setCurrentIdx(p => Math.min(slides.length-1, p+1))}
              disabled={currentIdx === slides.length-1}
              className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl
                         disabled:opacity-30 transition">
              Next →
            </button>
          </div>
        </div>
        <button onClick={() => setPresenting(false)}
          className="fixed top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg">
          <X size={20} />
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[#f0f0f0] overflow-hidden">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center
                      gap-3 flex-shrink-0 shadow-sm z-10">
        <span className="text-2xl flex-shrink-0">📑</span>
        <input value={title} onChange={e => setTitle(e.target.value)}
          onBlur={async () => {
            try { await api.post('/documents/save', { session_id: sessionId, doc_type: 'presentation', title, content: { slides }, version }) } catch {}
          }}
          className="text-lg font-medium text-gray-800 bg-transparent border-none outline-none
                     border-b-2 border-transparent focus:border-[#f4b400] transition py-1 w-56" />
        {session?.otp_code && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-1.5
                          text-center flex-shrink-0">
            <p className="text-[10px] text-yellow-600 font-semibold uppercase tracking-wider">
              Share OTP</p>
            <p className="text-lg font-black text-yellow-600 tracking-widest">
              {session.otp_code}</p>
          </div>
        )}
        <span className="text-xs font-medium flex-shrink-0 ml-2"
          style={{ color: STATUS_COLOR[saveStatus] }}>
          {STATUS_TEXT[saveStatus]}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setPresenting(true)}
            className="flex items-center gap-2 px-4 py-1.5 bg-yellow-500 hover:bg-yellow-600
                       text-white text-sm font-semibold rounded-lg transition">
            <Play size={14} /> Present
          </button>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {PANEL_TABS.map(({ id, label }) => (
              <button key={id} onClick={() => setShowPanel(p => p === id ? null : id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition
                  ${showPanel === id ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={closeEditor}
            className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-500 rounded-lg transition">
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Users bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center
                      gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Users size={13} /><span>{connUsers.length+1} editing</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-100">
          <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center
                          text-white text-[9px] font-bold">
            {getInitials(user?.name)}
          </div>
          <span className="text-xs text-yellow-800 font-medium">{user?.name}</span>
          <span className="text-[10px] text-yellow-600">● editing</span>
        </div>
        {connUsers.map(u => (
          <div key={u.user_id} className="flex items-center gap-1.5 px-2 py-1 rounded-full"
            style={{ background: u.color+'22' }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center
                            text-white text-[9px] font-bold" style={{ background: u.color }}>
              {getInitials(u.name)}
            </div>
            <span className="text-xs font-medium" style={{ color: u.color }}>{u.name}</span>
          </div>
        ))}
        {updatedBy && (
          <span className="ml-auto text-xs text-gray-400">
            Last edit: <b className="text-gray-600">{updatedBy}</b>
          </span>
        )}
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Slide thumbnails */}
        <div className="w-48 bg-gray-100 border-r border-gray-200 flex flex-col
                        overflow-hidden flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {slides.map((s, i) => (
              <div key={i} onClick={() => setCurrentIdx(i)}
                className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition
                  ${i === currentIdx ? 'border-yellow-500 shadow-md' : 'border-transparent hover:border-yellow-300'}`}>
                <div className="w-full aspect-video flex flex-col justify-center p-3 gap-1"
                  style={{ background: s.bg || '#ffffff' }}>
                  <div className="text-[8px] font-bold text-gray-800 truncate">
                    {s.title || `Slide ${i+1}`}</div>
                  <div className="text-[6px] text-gray-500 truncate">{s.content || ''}</div>
                </div>
                <div className="absolute bottom-1 left-1 text-[9px] text-gray-500 font-semibold">
                  {i+1}</div>
                {slides.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); deleteSlide(i) }}
                    className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded
                               opacity-0 group-hover:opacity-100 transition">
                    <Trash2 size={9} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-200">
            <button onClick={addSlide}
              className="w-full flex items-center justify-center gap-1.5 py-2 bg-yellow-500
                         hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition">
              <Plus size={13} /> New Slide
            </button>
          </div>
        </div>

        {/* Slide canvas */}
        <div className="flex-1 overflow-auto flex flex-col items-center p-8 gap-4">
          <p className="text-xs text-gray-500 self-start">Slide {currentIdx+1} of {slides.length}</p>
          <div className="self-start flex items-center gap-2">
            <span className="text-xs text-gray-500">Background:</span>
            {BG_COLORS.map(color => (
              <button key={color} onClick={() => updateSlide('bg', color)}
                className={`w-5 h-5 rounded-full border-2 transition
                  ${(slide.bg||'#ffffff') === color ? 'border-yellow-500 scale-125' : 'border-gray-300'}`}
                style={{ background: color }} />
            ))}
          </div>
          <div className="w-full max-w-4xl rounded-lg shadow-lg overflow-hidden border border-gray-200"
            style={{ background: slide.bg || '#ffffff' }}>
            <div className="flex flex-col p-14 gap-6 min-h-[420px]">
              <div>
                <p className="text-[10px] text-gray-300 uppercase tracking-wider mb-1 font-semibold">
                  Title</p>
                <input value={slide.title||''} onChange={e => updateSlide('title', e.target.value)}
                  placeholder="Click to add slide title"
                  className="slide-title-input text-3xl"
                  style={{ color: (slide.bg==='#1a1a2e'||slide.bg==='#0d1117') ? '#ffffff' : '#202124' }} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-gray-300 uppercase tracking-wider mb-1 font-semibold">
                  Content</p>
                <textarea value={slide.content||''} onChange={e => updateSlide('content', e.target.value)}
                  placeholder={'• Click to add content\n• Use bullet points'}
                  className="slide-body-input text-lg" rows={8}
                  style={{ color: (slide.bg==='#1a1a2e'||slide.bg==='#0d1117') ? '#e2e8f0' : '#444444' }} />
              </div>
            </div>
          </div>
          <div className="w-full max-w-4xl">
            <p className="text-xs text-gray-500 font-medium mb-2">Speaker notes</p>
            <textarea value={slide.notes||''} onChange={e => updateSlide('notes', e.target.value)}
              placeholder="Add speaker notes…" rows={3}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm
                         text-gray-600 resize-none focus:outline-none focus:border-yellow-400
                         transition font-[Arial]" />
          </div>
        </div>

        {/* Right panel */}
        {showPanel && (
          <div className="w-80 bg-white border-l border-gray-200 flex flex-col
                          overflow-hidden flex-shrink-0">
            <div className="flex border-b border-gray-100 flex-shrink-0">
              {PANEL_TABS.map(({ id, label }) => (
                <button key={id} onClick={() => setShowPanel(id)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition
                    ${showPanel === id
                      ? 'text-yellow-700 border-b-2 border-yellow-500 bg-yellow-50/50'
                      : 'text-gray-400'}`}>
                  {label}
                </button>
              ))}
            </div>
            {showPanel === 'chat' && (
              <div className="flex-1 overflow-hidden">
                <ChatPanel sessionId={sessionId} accentColor="#f4b400" compact />
              </div>
            )}
            {showPanel === 'comments' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {comments.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-8">No comments yet</p>
                    : comments.map((c, i) => (
                      <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center
                                          justify-center text-white text-[9px] font-bold">
                            {getInitials(c.author)}
                          </div>
                          <span className="text-xs font-semibold text-gray-700">{c.author}</span>
                        </div>
                        <p className="text-sm text-gray-600">{c.text}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{formatDate(c.time)}</p>
                      </div>
                    ))
                  }
                </div>
                <div className="p-3 border-t border-gray-100 flex-shrink-0">
                  <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                    placeholder="Add a comment…" rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
                               resize-none focus:outline-none focus:border-yellow-500 text-gray-700" />
                  <button onClick={postComment}
                    className="mt-2 w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-white
                               text-xs font-semibold rounded-lg transition">
                    Post Comment
                  </button>
                </div>
              </div>
            )}
            {showPanel === 'history' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {versions.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-8">No versions yet</p>
                  : [...versions].reverse().slice(0, 20).map((v, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-yellow-700">Version {v.version}</span>
                        <span className="text-[10px] text-gray-400">{formatDate(v.time)}</span>
                      </div>
                      <p className="text-xs text-gray-500">{v.saved_by}</p>
                    </div>
                  ))
                }
              </div>
            )}
            {/* Voice bar */}
            <VoiceBar sessionId={sessionId} accentColor="#f4b400" />
          </div>
        )}

        {!showPanel && (
          <div className="w-72 bg-white border-l border-gray-200 flex flex-col
                          justify-end flex-shrink-0">
            <VoiceBar sessionId={sessionId} accentColor="#f4b400" />
          </div>
        )}
      </div>
    </div>
  )
}

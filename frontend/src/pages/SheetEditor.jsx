import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { getSocket, joinRoom, leaveRoom, emitSheetChange } from '../api/socket'
import { useAuth } from '../context/AuthContext'
import { getErrMsg, formatDate, getInitials } from '../utils/helpers'
import ChatPanel from '../components/ChatPanel'
import VoiceBar from '../components/VoiceBar'
import toast from 'react-hot-toast'
import { X, Users } from 'lucide-react'

const COLS = ['A','B','C','D','E','F','G','H','I','J']
const ROWS = Array.from({ length: 50 }, (_, i) => i + 1)

function makeEmptyCells() {
  const cells = {}
  COLS.forEach(c => ROWS.forEach(r => { cells[`${c}${r}`] = '' }))
  return cells
}

export default function SheetEditor() {
  const { sessionId } = useParams()
  const { state }     = useLocation()
  const navigate      = useNavigate()
  const { user }      = useAuth()

  const saveTimer = useRef(null)
  const isRemote  = useRef(false)

  const [session,      setSession]      = useState(state?.session || null)
  const [cells,        setCells]        = useState(makeEmptyCells())
  const [title,        setTitle]        = useState('Untitled Spreadsheet')
  const [version,      setVersion]      = useState(1)
  const [saveStatus,   setSaveStatus]   = useState('saved')
  const [connUsers,    setConnUsers]    = useState([])
  const [comments,     setComments]     = useState([])
  const [versions,     setVersions]     = useState([])
  const [newComment,   setNewComment]   = useState('')
  const [showPanel,    setShowPanel]    = useState('chat')
  const [updatedBy,    setUpdatedBy]    = useState('')
  const [selectedCell, setSelectedCell] = useState('A1')

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
          if (data.content?.cells) setCells({ ...makeEmptyCells(), ...data.content.cells })
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
    socket.on('sheet_update', ({ cells: remoteCells, version: rv, name }) => {
      if (!remoteCells) return
      isRemote.current = true
      setCells({ ...makeEmptyCells(), ...remoteCells })
      isRemote.current = false
      setVersion(rv)
      setUpdatedBy(name)
      setSaveStatus('saved')
    })
    return () => {
      socket.off('room_state')
      socket.off('user_left')
      socket.off('sheet_update')
      leaveRoom(sessionId)
    }
  }, [sessionId])

  const handleCellChange = useCallback((key, value) => {
    if (isRemote.current) return
    setCells(prev => {
      const next   = { ...prev, [key]: value }
      const newVer = version + 1
      setVersion(newVer)
      setSaveStatus('saving')
      emitSheetChange(sessionId, next, newVer)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        api.post('/documents/save', {
          session_id: sessionId, doc_type: 'spreadsheet',
          title, content: { cells: next }, version: newVer,
        }).then(() => { setSaveStatus('saved'); setUpdatedBy(user?.name || '') })
          .catch(() => setSaveStatus('error'))
      }, 1500)
      return next
    })
  }, [sessionId, title, version, user])

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
        session_id: sessionId, doc_type: 'spreadsheet',
        title, content: { cells }, version,
      })
    } catch {}
    leaveRoom(sessionId)
    navigate('/collaborate')
  }

  const STATUS_COLOR = { saved: '#0f9d58', saving: '#f4b400', error: '#ef4444' }
  const STATUS_TEXT  = { saved: '✓ Saved', saving: '⟳ Saving…', error: '✗ Error' }

  const PANEL_TABS = [
    { id: 'chat',     label: '💬 Chat'    },
    { id: 'comments', label: '📝 Comments' },
    { id: 'history',  label: '🕒 History'  },
  ]

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center
                      gap-3 flex-shrink-0 shadow-sm z-10">
        <span className="text-2xl flex-shrink-0">📊</span>
        <input value={title} onChange={e => setTitle(e.target.value)}
          onBlur={async () => {
            try { await api.post('/documents/save', { session_id: sessionId, doc_type: 'spreadsheet', title, content: { cells }, version }) } catch {}
          }}
          className="text-lg font-medium text-gray-800 bg-transparent border-none
                     outline-none border-b-2 border-transparent focus:border-[#0f9d58]
                     transition py-1 w-56" />
        {session?.otp_code && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-1.5
                          text-center flex-shrink-0">
            <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wider">
              Share OTP</p>
            <p className="text-lg font-black text-green-600 tracking-widest">
              {session.otp_code}</p>
          </div>
        )}
        <span className="text-xs font-medium flex-shrink-0 ml-2"
          style={{ color: STATUS_COLOR[saveStatus] }}>
          {STATUS_TEXT[saveStatus]}
        </span>
        <div className="ml-auto flex gap-1 bg-gray-100 rounded-lg p-1">
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

      {/* Users bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center
                      gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Users size={13} /><span>{connUsers.length + 1} editing</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100">
          <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center
                          text-white text-[9px] font-bold">
            {getInitials(user?.name)}
          </div>
          <span className="text-xs text-green-800 font-medium">{user?.name}</span>
          <span className="text-[10px] text-green-600">● editing</span>
        </div>
        {connUsers.map(u => (
          <div key={u.user_id} className="flex items-center gap-1.5 px-2 py-1 rounded-full"
            style={{ background: u.color + '22' }}>
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

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-1.5 flex items-center
                      gap-1 flex-shrink-0 flex-wrap">
        {[['↩','Undo'],['↪','Redo'],['|'],['B','Bold'],['I','Italic'],['U','Underline'],['|'],
          ['$','Currency'],['%','Percent'],['.0','Decimal'],['|'],
          ['≡','Left'],['≡','Center'],['≡','Right'],['|'],
          ['⊞','Merge'],['▦','Borders'],['|'],['Σ','Sum'],['f(x)','Formula']
        ].map(([label, title], i) => label === '|'
          ? <div key={i} className="w-px h-5 bg-gray-200 mx-1" />
          : <button key={i} title={title}
              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded
                         font-semibold transition min-w-[26px] h-7 flex items-center justify-center">
              {label}
            </button>
        )}
      </div>

      {/* Formula bar */}
      <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center
                      gap-3 flex-shrink-0">
        <div className="px-3 py-1 bg-gray-50 border border-gray-200 rounded text-xs
                        font-bold text-[#0f9d58] min-w-[52px] text-center">
          {selectedCell}
        </div>
        <div className="w-px h-5 bg-gray-200" />
        <span className="text-xs text-[#0f9d58] font-bold px-2">fx</span>
        <div className="flex-1 text-sm text-gray-600">{cells[selectedCell] || ''}</div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <table className="border-collapse w-max min-w-full">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 w-10 h-7 bg-gray-50 border
                               border-gray-200 text-center text-xs text-gray-400" />
                {COLS.map(col => (
                  <th key={col} className="sticky top-0 z-10 h-7 bg-gray-50 border
                                           border-gray-200 text-center text-xs font-semibold
                                           text-gray-600 px-2 min-w-[120px]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row}>
                  <td className="sticky left-0 z-10 w-10 h-7 bg-gray-50 border border-gray-200
                                 text-center text-xs text-gray-500 font-semibold select-none">
                    {row}
                  </td>
                  {COLS.map(col => {
                    const key    = `${col}${row}`
                    const active = selectedCell === key
                    return (
                      <td key={key} className={`border border-gray-200 p-0 h-7 relative
                        ${active ? 'outline outline-2 outline-[#0f9d58] z-10' : ''}`}>
                        <input value={cells[key] || ''} onFocus={() => setSelectedCell(key)}
                          onChange={e => handleCellChange(key, e.target.value)}
                          className="w-full h-full px-1.5 text-sm text-gray-800 bg-transparent
                                     border-none outline-none font-[Arial] min-w-[120px]" />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Side panel */}
        {showPanel && (
          <div className="w-80 bg-white border-l border-gray-200 flex flex-col
                          overflow-hidden flex-shrink-0">
            <div className="flex border-b border-gray-100 flex-shrink-0">
              {PANEL_TABS.map(({ id, label }) => (
                <button key={id} onClick={() => setShowPanel(id)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition
                    ${showPanel === id
                      ? 'text-green-700 border-b-2 border-green-600 bg-green-50/50'
                      : 'text-gray-400'}`}>
                  {label}
                </button>
              ))}
            </div>
            {showPanel === 'chat' && (
              <div className="flex-1 overflow-hidden">
                <ChatPanel sessionId={sessionId} accentColor="#0f9d58" compact />
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
                          <div className="w-6 h-6 rounded-full bg-green-600 flex items-center
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
                               resize-none focus:outline-none focus:border-green-500 text-gray-700" />
                  <button onClick={postComment}
                    className="mt-2 w-full py-2 bg-green-600 hover:bg-green-700 text-white
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
                        <span className="text-xs font-bold text-green-700">Version {v.version}</span>
                        <span className="text-[10px] text-gray-400">{formatDate(v.time)}</span>
                      </div>
                      <p className="text-xs text-gray-500">{v.saved_by}</p>
                    </div>
                  ))
                }
              </div>
            )}
            {/* Voice bar */}
            <VoiceBar sessionId={sessionId} accentColor="#0f9d58" />
          </div>
        )}

        {!showPanel && (
          <div className="w-72 bg-white border-l border-gray-200 flex flex-col
                          justify-end flex-shrink-0">
            <VoiceBar sessionId={sessionId} accentColor="#0f9d58" />
          </div>
        )}
      </div>

      {/* Sheet tabs */}
      <div className="bg-white border-t border-gray-200 px-4 py-1.5 flex items-center
                      gap-2 flex-shrink-0">
        <button className="px-4 py-1 bg-white border-t-2 border-t-[#0f9d58] text-xs
                           text-[#0f9d58] font-semibold">
          Sheet 1
        </button>
        <button className="px-2 py-1 text-gray-400 hover:text-gray-600 text-lg leading-none">
          +
        </button>
      </div>
    </div>
  )
}

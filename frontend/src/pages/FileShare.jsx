import { useState, useEffect, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import Layout from '../components/Layout'
import ChatPanel from '../components/ChatPanel'
import OfflineShare from './OfflineShare'
import api from '../api/axios'
import { getSocket, joinRoom, leaveRoom, emitFileNotify } from '../api/socket'
import { formatSize, formatDate, fileIcon, getErrMsg } from '../utils/helpers'
import toast from 'react-hot-toast'
import {
  Link2, QrCode, Upload, Download, Trash2,
  RefreshCw, X, AlertTriangle, MessageSquare,
  Wifi, Cloud,
} from 'lucide-react'

const TABS = [
  { id: 'cloud',   label: 'Cloud Share',   icon: Cloud,    desc: 'Via Cloudinary CDN — any network' },
  { id: 'offline', label: 'Offline Share',  icon: Wifi,     desc: 'Direct P2P — same WiFi, no cloud' },
]

export default function FileShare() {
  const [activeTab,  setActiveTab]  = useState('cloud')
  const [tab,        setTab]        = useState('create')
  const [session,    setSession]    = useState(null)
  const [files,      setFiles]      = useState([])
  const [uploading,  setUploading]  = useState(false)
  const [busy,       setBusy]       = useState(false)
  const [joinOtp,    setJoinOtp]    = useState('')
  const [connUsers,  setConnUsers]  = useState([])
  const [showChat,   setShowChat]   = useState(true)
  const pollRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (session) leaveRoom(session.session_id)
    }
  }, [session])

  // ── Socket listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    const socket = getSocket()
    if (!socket) return
    joinRoom(session.session_id)
    socket.on('room_state', ({ users }) => setConnUsers(users))
    socket.on('user_left',  ({ user_id }) =>
      setConnUsers(p => p.filter(u => u.user_id !== user_id)))
    socket.on('new_file',   () => fetchFiles())
    pollRef.current = setInterval(fetchFiles, 5000)
    return () => {
      socket.off('room_state')
      socket.off('user_left')
      socket.off('new_file')
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [session])

  async function fetchFiles() {
    if (!session) return
    try {
      const { data } = await api.get(`/files/session/${session.session_id}`)
      setFiles(data)
    } catch {}
  }

  async function createSession() {
    setBusy(true)
    try {
      const { data } = await api.post('/sessions/create?doc_type=file')
      setSession(data)
      setFiles([])
      toast.success('Session created!')
    } catch (err) {
      toast.error(getErrMsg(err))
    } finally { setBusy(false) }
  }

  async function joinSession() {
    if (!joinOtp || joinOtp.length !== 6)
      return toast.error('Enter a valid 6-digit OTP')
    setBusy(true)
    try {
      const { data } = await api.post('/sessions/join', { otp_code: joinOtp })
      setSession(data)
      setFiles([])
      toast.success('Joined session!')
      setTimeout(fetchFiles, 500)
    } catch (err) {
      toast.error(getErrMsg(err))
    } finally { setBusy(false) }
  }

  async function endSession() {
    if (!confirm('End session? All uploaded files will be permanently deleted from Cloudinary.'))
      return
    try {
      await api.delete(`/sessions/${session.session_id}`)
      leaveRoom(session.session_id)
      setSession(null)
      setFiles([])
      setConnUsers([])
      if (pollRef.current) clearInterval(pollRef.current)
      toast.success('Session ended. All files deleted.')
    } catch (err) {
      toast.error(getErrMsg(err))
    }
  }

  const onDrop = useCallback(async (accepted) => {
    if (!session) return toast.error('Create or join a session first')
    setUploading(true)
    let uploaded = 0
    for (const file of accepted) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post(
          `/files/upload?session_id=${session.session_id}`, fd,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
        emitFileNotify(session.session_id, data)
        uploaded++
      } catch (err) {
        toast.error(`Failed: ${file.name} — ${getErrMsg(err)}`)
      }
    }
    if (uploaded > 0) {
      toast.success(`${uploaded} file(s) uploaded to Cloudinary`)
      fetchFiles()
    }
    setUploading(false)
  }, [session])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !session || uploading,
  })

  async function deleteFile(fileId, name) {
    if (!confirm(`Delete "${name}" from Cloudinary?`)) return
    try {
      await api.delete(`/files/${fileId}`)
      setFiles(p => p.filter(f => f.file_id !== fileId))
      toast.success('File deleted')
    } catch (err) {
      toast.error(getErrMsg(err))
    }
  }

  return (
    <Layout>
      <div className="p-8">

        {/* ── Page header ── */}
        <div className="mb-6 fade-in">
          <h1 className="text-3xl font-bold text-white mb-2">File Sharing</h1>
          <p className="text-slate-400 text-sm">
            Choose Cloud Share for any network worldwide, or Offline Share for
            direct P2P transfer on the same WiFi — no cloud, no size limit.
          </p>
        </div>

        {/* ── Mode tabs ── */}
        <div className="flex gap-3 mb-8">
          {TABS.map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border text-sm
                          font-medium transition-all
                ${activeTab === id
                  ? id === 'offline'
                    ? 'bg-green-500/10 border-green-500/40 text-green-300'
                    : 'bg-brand-500/10 border-brand-500/40 text-brand-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              <Icon size={16} />
              <div className="text-left">
                <div>{label}</div>
                <div className="text-[10px] font-normal opacity-70">{desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* OFFLINE P2P TAB                                               */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'offline' && (
          <div className="max-w-3xl">
            <OfflineShare />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* CLOUD SHARE TAB                                               */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'cloud' && (
          <div className="flex gap-6">
            {/* Main content */}
            <div className="flex-1 min-w-0">
              {!session ? (
                /* Create or Join */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 fade-in">
                  {/* Create */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-brand-500/10 rounded-xl flex items-center justify-center">
                        <Link2 size={20} className="text-brand-400" />
                      </div>
                      <div>
                        <h2 className="font-bold text-white">Create Session</h2>
                        <p className="text-xs text-slate-500">Generate OTP + QR code</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                      Generate a session. Share the OTP or QR with the other device.
                      Upload files — they appear instantly for download.
                    </p>
                    <button
                      onClick={createSession}
                      disabled={busy}
                      className="w-full py-3 bg-brand-500 hover:bg-brand-600
                                 disabled:opacity-50 text-white font-semibold
                                 rounded-xl transition"
                    >
                      {busy ? 'Creating…' : '⚡ Generate Session'}
                    </button>
                  </div>

                  {/* Join */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
                        <QrCode size={20} className="text-green-400" />
                      </div>
                      <div>
                        <h2 className="font-bold text-white">Join Session</h2>
                        <p className="text-xs text-slate-500">Enter OTP from other device</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                      Enter the 6-digit OTP shown on the device that created the session.
                    </p>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="OTP"
                        value={joinOtp}
                        onChange={e => setJoinOtp(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={e => e.key === 'Enter' && joinSession()}
                        className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700
                                   rounded-xl text-center text-xl font-bold tracking-widest
                                   text-brand-400 focus:outline-none focus:border-brand-500 transition"
                      />
                      <button
                        onClick={joinSession}
                        disabled={busy || joinOtp.length !== 6}
                        className="px-6 py-3 bg-green-600 hover:bg-green-700
                                   disabled:opacity-50 text-white font-semibold
                                   rounded-xl transition"
                      >
                        Join →
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Active session */
                <div className="space-y-6 fade-in">
                  {/* Session header */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase
                                      tracking-wider mb-3">
                          Share OTP — other device enters this
                        </p>
                        <div className="flex gap-2 mb-4">
                          {session.otp_code.split('').map((d, i) => (
                            <div key={i} className="otp-box">{d}</div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                          <div className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
                          Session active · {connUsers.length + 1} device(s) connected
                          {connUsers.map(u => (
                            <span key={u.user_id}
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: u.color + '22', color: u.color }}>
                              {u.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        <p className="text-xs font-semibold text-slate-500 uppercase
                                      tracking-wider mb-2">Or scan QR</p>
                        <img
                          src={`data:image/png;base64,${session.qr_code}`}
                          alt="QR Code"
                          className="w-28 h-28 rounded-lg border border-slate-700 bg-white"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => setShowChat(p => !p)}
                          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium
                                      rounded-lg transition
                            ${showChat
                              ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                        >
                          <MessageSquare size={14} />
                          {showChat ? 'Hide Chat' : 'Chat'}
                        </button>
                        <button
                          onClick={fetchFiles}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-800
                                     hover:bg-slate-700 text-slate-300 text-sm
                                     font-medium rounded-lg transition"
                        >
                          <RefreshCw size={14} /> Refresh
                        </button>
                        <button
                          onClick={endSession}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/10
                                     hover:bg-red-500/20 text-red-400 text-sm font-medium
                                     rounded-lg transition border border-red-500/20"
                        >
                          <X size={14} /> End Session
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Drop zone */}
                  <div
                    {...getRootProps()}
                    className={`drop-zone p-10 text-center cursor-pointer transition
                      ${isDragActive ? 'active' : ''}
                      ${!session ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input {...getInputProps()} />
                    <Upload size={36} className="mx-auto mb-3 text-slate-600" />
                    {uploading ? (
                      <p className="text-slate-400 font-medium">Uploading to Cloudinary…</p>
                    ) : isDragActive ? (
                      <p className="text-brand-400 font-medium">Drop files here!</p>
                    ) : (
                      <>
                        <p className="text-slate-300 font-medium mb-1">
                          Drag & drop files here, or click to browse
                        </p>
                        <p className="text-slate-600 text-sm">
                          All file types · Max 50MB · Stored on Cloudinary CDN
                        </p>
                      </>
                    )}
                  </div>

                  {/* Files list */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4
                                    border-b border-slate-800">
                      <h3 className="font-semibold text-white">
                        Shared Files
                        <span className="ml-2 text-slate-500 text-sm font-normal">
                          ({files.length})
                        </span>
                      </h3>
                    </div>
                    {files.length === 0 ? (
                      <div className="py-14 text-center">
                        <Upload size={28} className="mx-auto mb-3 text-slate-700" />
                        <p className="text-slate-500 text-sm">No files yet.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800">
                        {files.map(f => (
                          <div key={f.file_id}
                            className="flex items-center gap-4 px-6 py-4
                                       hover:bg-slate-800/50 transition">
                            <span className="text-2xl flex-shrink-0">{fileIcon(f.file_type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-200 truncate">
                                {f.file_name}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatSize(f.file_size)} · {formatDate(f.upload_date)}
                                · by {f.owner_name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5
                                           bg-brand-500/10 hover:bg-brand-500/20
                                           text-brand-400 text-xs font-medium rounded-lg
                                           transition border border-brand-500/20"
                              >
                                <Download size={12} /> Download
                              </a>
                              <button
                                onClick={() => deleteFile(f.file_id, f.file_name)}
                                className="p-1.5 text-slate-600 hover:text-red-400
                                           hover:bg-red-500/10 rounded-lg transition"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Warning */}
                  <div className="flex items-start gap-3 p-4 bg-yellow-500/5
                                  border border-yellow-500/20 rounded-xl">
                    <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-400/80">
                      All files are stored on Cloudinary CDN and will be permanently
                      deleted when you end the session.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Chat panel */}
            {session && showChat && (
              <div className="w-80 flex-shrink-0 border border-slate-800 rounded-2xl
                              overflow-hidden bg-white">
                <ChatPanel
                  sessionId={session.session_id}
                  accentColor="#4285f4"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}

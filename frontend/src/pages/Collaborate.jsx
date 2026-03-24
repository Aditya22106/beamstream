import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../api/axios'
import { getErrMsg } from '../utils/helpers'
import toast from 'react-hot-toast'
import { FileText, Sheet, Presentation, ArrowRight } from 'lucide-react'

const DOC_TYPES = [
  {
    type:  'document',
    icon:  '📝',
    label: 'Document',
    desc:  'Write and format text with a full rich text editor. Bold, italic, headers, lists, colors — just like Google Docs.',
    color: '#4285f4',
    bg:    '#e8f0fe',
    route: '/doc',
  },
  {
    type:  'spreadsheet',
    icon:  '📊',
    label: 'Spreadsheet',
    desc:  'Create tables and data with a full spreadsheet grid. Resize columns, context menu, fill handle — like Google Sheets.',
    color: '#0f9d58',
    bg:    '#e6f4ea',
    route: '/sheet',
  },
  {
    type:  'presentation',
    icon:  '📑',
    label: 'Presentation',
    desc:  'Build slide decks with a full slide canvas editor. Add/delete slides, speaker notes — like Google Slides.',
    color: '#f4b400',
    bg:    '#fef9e7',
    route: '/slide',
  },
]

export default function Collaborate() {
  const navigate      = useNavigate()
  const [busy, setBusy]   = useState(false)
  const [joinOtp, setJoinOtp] = useState('')

  async function createDoc(dtype, route) {
    setBusy(dtype)
    try {
      const { data } = await api.post(`/sessions/create?doc_type=${dtype}`)
      navigate(`${route}/${data.session_id}`, { state: { session: data } })
    } catch (err) {
      toast.error(getErrMsg(err))
    } finally { setBusy(false) }
  }

  async function joinSession() {
    if (!joinOtp || joinOtp.length !== 6)
      return toast.error('Enter a valid 6-digit OTP')
    setBusy('join')
    try {
      const { data } = await api.post('/sessions/join', { otp_code: joinOtp })
      const dtype    = data.doc_type || 'document'
      const routeMap = {
        document:     '/doc',
        spreadsheet:  '/sheet',
        presentation: '/slide',
      }
      const route = routeMap[dtype] || '/doc'
      navigate(`${route}/${data.session_id}`, { state: { session: data } })
    } catch (err) {
      toast.error(getErrMsg(err))
    } finally { setBusy(false) }
  }

  return (
    <Layout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-10 fade-in">
          <h1 className="text-3xl font-bold text-white mb-2">Collaboration</h1>
          <p className="text-slate-400">
            Create a document and share the OTP with a collaborator. Changes sync
            instantly via Socket.io with live cursors.
          </p>
        </div>

        {/* New document */}
        <div className="mb-10 fade-in">
          <h2 className="text-lg font-semibold text-slate-300 mb-4">
            Start a new document
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {DOC_TYPES.map(({ type, icon, label, desc, color, bg, route }) => (
              <button
                key={type}
                onClick={() => createDoc(type, route)}
                disabled={!!busy}
                className="group text-left bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden
                           hover:border-slate-600 transition-all disabled:opacity-60"
                style={{ '--color': color }}
              >
                <div className="h-32 flex items-center justify-center text-6xl"
                  style={{ background: bg }}>
                  {icon}
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-white mb-2">
                    {busy === type ? 'Creating…' : label}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">{desc}</p>
                  <div className="flex items-center gap-1 text-xs font-semibold"
                    style={{ color }}>
                    Create {label} <ArrowRight size={12} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Join session */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 fade-in">
          <h2 className="text-lg font-semibold text-white mb-2">
            Join a collaboration session
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            Enter the 6-digit OTP shared by the document creator to start
            collaborating in real time.
          </p>
          <div className="flex gap-4 max-w-sm">
            <input
              type="text"
              maxLength={6}
              placeholder="Enter OTP"
              value={joinOtp}
              onChange={e => setJoinOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && joinSession()}
              className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-center
                         text-xl font-bold tracking-widest text-brand-400 focus:outline-none
                         focus:border-brand-500 transition"
            />
            <button
              onClick={joinSession}
              disabled={joinOtp.length !== 6 || !!busy}
              className="px-6 py-3 bg-green-600 hover:bg-green-900 disabled:opacity-100
                         text-white font-semibold rounded-xl transition"
            >
              {busy === 'join' ? '…' : 'Join →'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}

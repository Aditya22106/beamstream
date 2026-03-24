import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getErrMsg } from '../utils/helpers'
import toast from 'react-hot-toast'
import { FolderUp, Users, Shield, Globe, Clock, Zap } from 'lucide-react'

export default function Landing() {
  const { login, register, user } = useAuth()
  const navigate                  = useNavigate()
  const [tab,  setTab]  = useState('login')
  const [busy, setBusy] = useState(false)

  if (user) { navigate('/home'); return null }

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm,   setRegForm]   = useState({
    name: '', email: '', password: '', confirm: '',
  })

  async function handleLogin(e) {
    e.preventDefault()
    if (!loginForm.email || !loginForm.password)
      return toast.error('Enter email and password')
    setBusy(true)
    try {
      const u = await login(loginForm.email, loginForm.password)
      toast.success(`Welcome back, ${u.name}!`)
      navigate('/home')
    } catch (err) {
      toast.error(getErrMsg(err))
    } finally { setBusy(false) }
  }

  async function handleRegister(e) {
    e.preventDefault()
    if (!regForm.name || !regForm.email || !regForm.password)
      return toast.error('All fields are required')
    if (regForm.password !== regForm.confirm)
      return toast.error('Passwords do not match')
    if (regForm.password.length < 6)
      return toast.error('Password must be at least 6 characters')
    setBusy(true)
    try {
      await register(regForm.name, regForm.email, regForm.password)
      toast.success('Account created! Please sign in.')
      setTab('login')
      setLoginForm({ email: regForm.email, password: '' })
    } catch (err) {
      toast.error(getErrMsg(err))
    } finally { setBusy(false) }
  }

  const FEATURES = [
    { icon: FolderUp, color: '#4285f4', title: 'Instant File Sharing',
      desc: 'Connect via OTP or QR. Upload files — other device downloads from Cloudinary CDN instantly.' },
    { icon: Users,    color: '#0f9d58', title: 'Real-Time Collaboration',
      desc: 'Edit Documents, Sheets and Presentations together. Changes sync instantly via Socket.io.' },
    { icon: Shield,   color: '#f4b400', title: 'Secure & Encrypted',
      desc: 'JWT authentication, bcrypt passwords. Your files are private and secure.' },
    { icon: Globe,    color: '#db4437', title: 'Cross-Platform',
      desc: 'Works on any device — PC, mobile, tablet. Share across different operating systems.' },
    { icon: Clock,    color: '#673ab7', title: 'Version History',
      desc: 'Every change recorded. See who edited, restore any previous version.' },
    { icon: Zap,      color: '#e91e63', title: 'Cloud Storage',
      desc: 'Files stored on Cloudinary CDN. Fast download from anywhere in the world.' },
  ]

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-200">

      {/* ── Navbar with logo ── */}
      <nav className="border-b border-slate-800 px-8 py-3 flex items-center justify-between">

        {/* Logo + brand */}
        <div className="flex items-center gap-3">
          <img
            src="/beamstream_logo.png"
            alt="BeamStream logo"
            className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
            onError={e => { e.target.style.display = 'none' }}
          />
          <div className="leading-tight">
            <span className="text-xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              BeamStream
            </span>
            <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase hidden sm:block">
              Stream · Share · Experience
            </p>
          </div>
        </div>

        {/* Nav buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab('login')}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition"
          >
            Sign In
          </button>
          <button
            onClick={() => setTab('register')}
            className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition font-medium"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div className="max-w-7xl mx-auto px-6 py-16 flex flex-col lg:flex-row gap-16 items-start">

        {/* Left — Hero */}
        <div className="flex-1 pt-4">
          <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20
                          text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Zap size={12} /> Cloud-Based · Real-Time · Cross-Platform
          </div>
          <h1 className="text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Share Files.<br />
            <span className="text-brand-400">Collaborate</span><br />
            Instantly.
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-10 max-w-xl">
            Connect two devices using an OTP or QR code. Transfer any file stored on
            Cloudinary CDN. Edit documents, spreadsheets and presentations together
            in real time — from anywhere in the world.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, color, title, desc }) => (
              <div
                key={title}
                className="p-4 bg-slate-900 border border-slate-800 rounded-xl
                           hover:border-slate-600 transition"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: color + '22' }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <p className="text-sm font-semibold text-slate-200 mb-1">{title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Auth card */}
        <div className="w-full lg:w-[420px] flex-shrink-0">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">

            {/* Auth card header with logo */}
            <div className="flex items-center gap-3 px-8 pt-7 pb-0">
              <img
                src="/beamstream_logo.png"
                alt="BeamStream"
                className="w-9 h-9 rounded-xl object-cover flex-shrink-0"
                onError={e => { e.target.style.display = 'none' }}
              />
              <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-pink-400 bg-clip-text text-transparent">
                BeamStream
              </span>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800 mt-4">
              {['login', 'register'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-3.5 text-sm font-semibold transition
                    ${tab === t
                      ? 'text-brand-400 border-b-2 border-brand-400'
                      : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            <div className="p-8">
              {tab === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <p className="text-xl font-bold text-white mb-1">Welcome back</p>
                    <p className="text-sm text-slate-500">Sign in to your BeamStream account</p>
                  </div>
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Email address
                      </label>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={loginForm.email}
                        onChange={e => setLoginForm(p => ({...p, email: e.target.value}))}
                        className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg
                                   text-sm text-slate-200 placeholder-slate-500 focus:outline-none
                                   focus:border-brand-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Password
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={e => setLoginForm(p => ({...p, password: e.target.value}))}
                        className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg
                                   text-sm text-slate-200 placeholder-slate-500 focus:outline-none
                                   focus:border-brand-500 transition"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50
                               text-white font-semibold rounded-lg transition text-sm"
                  >
                    {busy ? 'Signing in…' : 'Sign In →'}
                  </button>
                  <p className="text-center text-xs text-slate-600">
                    Demo: aditya@beamstream.app / demo1234
                  </p>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-5">
                  <div>
                    <p className="text-xl font-bold text-white mb-1">Create account</p>
                    <p className="text-sm text-slate-500">Free forever. No credit card required.</p>
                  </div>
                  <div className="space-y-4 pt-2">
                    {[
                      { label: 'Full name',        key: 'name',     type: 'text',     placeholder: 'Your Name'        },
                      { label: 'Email address',    key: 'email',    type: 'email',    placeholder: 'you@example.com'  },
                      { label: 'Password',         key: 'password', type: 'password', placeholder: 'Min 6 characters' },
                      { label: 'Confirm password', key: 'confirm',  type: 'password', placeholder: 'Repeat password'  },
                    ].map(({ label, key, type, placeholder }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">
                          {label}
                        </label>
                        <input
                          type={type}
                          placeholder={placeholder}
                          value={regForm[key]}
                          onChange={e => setRegForm(p => ({...p, [key]: e.target.value}))}
                          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg
                                     text-sm text-slate-200 placeholder-slate-500 focus:outline-none
                                     focus:border-brand-500 transition"
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50
                               text-white font-semibold rounded-lg transition text-sm"
                  >
                    {busy ? 'Creating…' : 'Create Account →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

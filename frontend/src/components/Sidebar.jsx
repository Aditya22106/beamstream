import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, FolderUp, Users, Bell, Shield, LogOut,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../utils/helpers'
import { useState, useEffect } from 'react'
import api from '../api/axios'

const NAV = [
  { to: '/home',          icon: Home,     label: 'Home'          },
  { to: '/fileshare',     icon: FolderUp, label: 'File Sharing'  },
  { to: '/collaborate',   icon: Users,    label: 'Collaborate'   },
  { to: '/notifications', icon: Bell,     label: 'Notifications' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    api.get('/notifications/')
      .then(r => setUnread(r.data.unread_count || 0))
      .catch(() => {})
    const t = setInterval(() => {
      api.get('/notifications/')
        .then(r => setUnread(r.data.unread_count || 0))
        .catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#0f1f3d] border-r border-slate-800 flex flex-col z-40">

      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800">
        <img
          src="/beamstream_logo.png"
          alt="BeamStream"
          className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
          onError={e => { e.target.style.display = 'none' }}
        />
        <div className="leading-tight">
          <span className="text-lg font-extrabold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            BeamStream
          </span>
          <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">
            Stream · Share · Experience
          </p>
        </div>
      </div>

      {/* ── User card ── */}
      <div className="mx-3 mt-4 p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center
                          text-white text-sm font-bold flex-shrink-0">
            {getInitials(user?.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-200 truncate">
              {user?.name}
            </p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded font-semibold
          ${user?.role === 'admin'
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-brand-500/20 text-brand-400'}`}>
          {user?.role?.toUpperCase()}
        </span>
      </div>

      {/* ── Nav links ── */}
      <nav className="flex-1 px-3 mt-4 space-y-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
              ${isActive
                ? 'bg-brand-500/20 text-brand-400 border-l-[3px] border-brand-400 rounded-l-none'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
            {label === 'Notifications' && unread > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs rounded-full
                               px-1.5 py-0.5 min-w-[20px] text-center">
                {unread}
              </span>
            )}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
              ${isActive
                ? 'bg-yellow-500/20 text-yellow-400 border-l-[3px] border-yellow-400 rounded-l-none'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`
            }
          >
            <Shield size={18} />
            <span>Admin</span>
          </NavLink>
        )}
      </nav>

      {/* ── Logout ── */}
      <div className="p-3 border-t border-slate-800">
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm
                     font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

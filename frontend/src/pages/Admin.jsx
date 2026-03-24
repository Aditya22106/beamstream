import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import api from '../api/axios'
import { formatDate, formatSize } from '../utils/helpers'
import toast from 'react-hot-toast'
import {
  Users, FileText, Activity, BarChart3,
  Trash2, RefreshCw, Shield, Clock,
} from 'lucide-react'

export default function Admin() {
  const [tab,     setTab]     = useState('overview')
  const [stats,   setStats]   = useState(null)
  const [users,   setUsers]   = useState([])
  const [logs,    setLogs]    = useState([])
  const [files,   setFiles]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [s, u, l, f] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/logs'),
        api.get('/admin/files'),
      ])
      setStats(s.data)
      setUsers(u.data)
      setLogs(l.data.logs || [])
      setFiles(f.data)
    } catch {
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  async function deleteUser(userId, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/admin/users/${userId}`)
      setUsers(p => p.filter(u => u.user_id !== userId))
      toast.success(`User "${name}" deleted`)
    } catch {
      toast.error('Failed to delete user')
    }
  }

  async function changeRole(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    try {
      await api.patch(`/admin/users/${userId}/role?role=${newRole}`)
      setUsers(p => p.map(u =>
        u.user_id === userId ? { ...u, role: newRole } : u
      ))
      toast.success(`Role changed to ${newRole}`)
    } catch {
      toast.error('Failed to change role')
    }
  }

  const ACTION_COLORS = {
    login:          '#4285f4',
    logout:         '#9aa0a6',
    upload:         '#0f9d58',
    delete:         '#ef4444',
    session_create: '#f4b400',
    session_join:   '#673ab7',
  }

  const STAT_CARDS = stats ? [
    { label: 'Total Users',     value: stats.total_users,     icon: Users,    color: '#4285f4' },
    { label: 'Total Files',     value: stats.total_files,     icon: FileText, color: '#0f9d58' },
    { label: 'Active Sessions', value: stats.active_sessions, icon: Activity, color: '#f4b400' },
    { label: 'Actions Today',   value: stats.actions_today,   icon: BarChart3,color: '#db4437' },
  ] : []

  const TABS = [
    { id: 'overview', label: 'Overview',    icon: BarChart3 },
    { id: 'users',    label: 'Users',       icon: Users     },
    { id: 'files',    label: 'Files',       icon: FileText  },
    { id: 'logs',     label: 'Activity Log',icon: Clock     },
  ]

  return (
    <Layout>
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-yellow-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
              <p className="text-slate-500 text-sm">Manage users, files and activity</p>
            </div>
          </div>
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700
                       text-slate-300 text-sm font-medium rounded-lg transition"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-slate-900 p-1 rounded-xl w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition
                ${tab === id
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-brand-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Overview ── */}
            {tab === 'overview' && (
              <div className="fade-in space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  {STAT_CARDS.map(({ label, value, icon: Icon, color }) => (
                    <div key={label}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ background: color + '22' }}>
                          <Icon size={20} style={{ color }} />
                        </div>
                      </div>
                      <p className="text-3xl font-extrabold text-white mb-1">{value}</p>
                      <p className="text-xs text-slate-500 font-medium">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Recent activity */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800">
                    <h3 className="font-semibold text-white">Recent Activity</h3>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {logs.slice(0, 10).map((log, i) => (
                      <div key={i} className="flex items-center gap-4 px-6 py-3.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: ACTION_COLORS[log.action_type] || '#64748b' }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium capitalize"
                            style={{ color: ACTION_COLORS[log.action_type] || '#94a3b8' }}>
                            {log.action_type.replace('_', ' ')}
                          </span>
                          {log.details && (
                            <span className="text-slate-500 text-sm ml-2 truncate">
                              — {log.details}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-600 flex-shrink-0">
                          {formatDate(log.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Users ── */}
            {tab === 'users' && (
              <div className="fade-in bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="font-semibold text-white">
                    All Users
                    <span className="ml-2 text-slate-500 text-sm font-normal">
                      ({users.length})
                    </span>
                  </h3>
                </div>
                <div className="divide-y divide-slate-800">
                  {users.map(u => (
                    <div key={u.user_id}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-800/50 transition">
                      <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center
                                      justify-center text-white font-bold text-sm flex-shrink-0">
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-200 text-sm">{u.name}</p>
                        <p className="text-slate-500 text-xs">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold
                          ${u.role === 'admin'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-brand-500/20 text-brand-400'}`}>
                          {u.role}
                        </span>
                        <span className="text-xs text-slate-600">
                          {u.last_login ? `Last: ${formatDate(u.last_login)}` : 'Never logged in'}
                        </span>
                        <button
                          onClick={() => changeRole(u.user_id, u.role)}
                          className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700
                                     text-slate-400 rounded-lg transition"
                        >
                          Toggle Role
                        </button>
                        <button
                          onClick={() => deleteUser(u.user_id, u.name)}
                          className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10
                                     rounded-lg transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Files ── */}
            {tab === 'files' && (
              <div className="fade-in bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800">
                  <h3 className="font-semibold text-white">
                    All Files
                    <span className="ml-2 text-slate-500 text-sm font-normal">
                      ({files.length})
                    </span>
                  </h3>
                </div>
                {files.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 text-sm">
                    No files uploaded yet
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-800/50 transition">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">{f.file_name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatSize(f.file_size)} · {formatDate(f.upload_date)} · by {f.owner_name}
                          </p>
                        </div>
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-400 hover:text-brand-300 font-medium transition"
                        >
                          View →
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Activity Log ── */}
            {tab === 'logs' && (
              <div className="fade-in bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800">
                  <h3 className="font-semibold text-white">
                    Activity Log
                    <span className="ml-2 text-slate-500 text-sm font-normal">
                      (Last {logs.length} actions)
                    </span>
                  </h3>
                </div>
                <div className="divide-y divide-slate-800">
                  {logs.map((log, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-800/30 transition">
                      <div className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: ACTION_COLORS[log.action_type] || '#64748b' }} />
                      <div className="w-28 flex-shrink-0">
                        <span className="text-xs font-semibold capitalize px-2 py-1 rounded"
                          style={{
                            background: (ACTION_COLORS[log.action_type] || '#64748b') + '22',
                            color:       ACTION_COLORS[log.action_type] || '#94a3b8',
                          }}>
                          {log.action_type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex-1 text-xs text-slate-500 truncate">
                        {log.details || '—'}
                      </div>
                      <span className="text-xs text-slate-600 flex-shrink-0">
                        {formatDate(log.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}

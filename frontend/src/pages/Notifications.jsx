import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import api from '../api/axios'
import { formatDate } from '../utils/helpers'
import toast from 'react-hot-toast'
import { Bell, CheckCheck, Trash2, RefreshCw } from 'lucide-react'

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [unread,        setUnread]        = useState(0)
  const [loading,       setLoading]       = useState(true)

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/notifications/')
      setNotifications(data.notifications || [])
      setUnread(data.unread_count || 0)
    } catch {
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchNotifications() }, [])

  async function markRead(id) {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications(p =>
        p.map(n => n.id === id ? { ...n, status: 'read' } : n)
      )
      setUnread(p => Math.max(0, p - 1))
    } catch {}
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all')
      setNotifications(p => p.map(n => ({ ...n, status: 'read' })))
      setUnread(0)
      toast.success('All marked as read')
    } catch {
      toast.error('Failed to mark all as read')
    }
  }

  async function deleteNotif(id) {
    try {
      await api.delete(`/notifications/${id}`)
      setNotifications(p => p.filter(n => n.id !== id))
      toast.success('Notification deleted')
    } catch {}
  }

  return (
    <Layout>
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8 fade-in">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Notifications</h1>
            <p className="text-slate-400 text-sm">
              {unread > 0
                ? `${unread} unread notification${unread > 1 ? 's' : ''}`
                : 'All caught up!'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchNotifications}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700
                         text-slate-300 text-sm font-medium rounded-lg transition"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 hover:bg-brand-500/20
                           text-brand-400 text-sm font-medium rounded-lg transition border border-brand-500/20"
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-brand-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20 fade-in">
            <Bell size={48} className="mx-auto mb-4 text-slate-700" />
            <p className="text-slate-500 font-medium">No notifications yet</p>
            <p className="text-slate-600 text-sm mt-1">
              You will be notified when someone joins your session or shares a file.
            </p>
          </div>
        ) : (
          <div className="space-y-3 fade-in">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`flex items-start gap-4 p-5 rounded-xl border transition
                  ${n.status === 'unread'
                    ? 'bg-brand-500/5 border-brand-500/20'
                    : 'bg-slate-900 border-slate-800'}`}
              >
                {/* Indicator dot */}
                <div className="flex-shrink-0 mt-1">
                  {n.status === 'unread'
                    ? <div className="w-2.5 h-2.5 rounded-full bg-brand-400 pulse-dot" />
                    : <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-relaxed
                    ${n.status === 'unread' ? 'text-slate-200' : 'text-slate-400'}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {formatDate(n.timestamp)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {n.status === 'unread' && (
                    <button
                      onClick={() => markRead(n.id)}
                      title="Mark as read"
                      className="p-2 text-slate-600 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition"
                    >
                      <CheckCheck size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotif(n.id)}
                    title="Delete"
                    className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}

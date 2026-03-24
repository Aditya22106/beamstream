import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

import Landing      from './pages/Landing'
import Home         from './pages/Home'
import FileShare    from './pages/FileShare'
import Collaborate  from './pages/Collaborate'
import DocEditor    from './pages/DocEditor'
import SheetEditor  from './pages/SheetEditor'
import SlideEditor  from './pages/SlideEditor'
import Notifications from './pages/Notifications'
import Admin        from './pages/Admin'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-brand-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-400 text-sm">Loading BeamStream…</span>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/" replace />
}

function AdminRoute({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/home" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/"  element={<Landing />} />

        <Route path="/home" element={
          <PrivateRoute><Home /></PrivateRoute>
        } />

        <Route path="/fileshare" element={
          <PrivateRoute><FileShare /></PrivateRoute>
        } />

        <Route path="/collaborate" element={
          <PrivateRoute><Collaborate /></PrivateRoute>
        } />

        <Route path="/doc/:sessionId" element={
          <PrivateRoute><DocEditor /></PrivateRoute>
        } />

        <Route path="/sheet/:sessionId" element={
          <PrivateRoute><SheetEditor /></PrivateRoute>
        } />

        <Route path="/slide/:sessionId" element={
          <PrivateRoute><SlideEditor /></PrivateRoute>
        } />

        <Route path="/notifications" element={
          <PrivateRoute><Notifications /></PrivateRoute>
        } />

        <Route path="/admin" element={
          <PrivateRoute><AdminRoute><Admin /></AdminRoute></PrivateRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

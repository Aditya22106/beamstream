import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { connectSocket, disconnectSocket } from '../api/socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // Restore session from localStorage on mount
  useEffect(() => {
    const token    = localStorage.getItem('bs_token')
    const userData = localStorage.getItem('bs_user')
    if (token && userData) {
      try {
        const parsed = JSON.parse(userData)
        setUser(parsed)
        connectSocket(token)
      } catch {
        localStorage.removeItem('bs_token')
        localStorage.removeItem('bs_user')
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('bs_token', data.access_token)
    localStorage.setItem('bs_user',  JSON.stringify(data.user))
    setUser(data.user)
    connectSocket(data.access_token)
    return data.user
  }, [])

  const register = useCallback(async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password })
    return data
  }, [])

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch {}
    localStorage.removeItem('bs_token')
    localStorage.removeItem('bs_user')
    disconnectSocket()
    setUser(null)
    navigate('/')
  }, [navigate])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

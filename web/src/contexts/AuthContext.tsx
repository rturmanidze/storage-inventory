import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../api/client'

export interface User {
  id: number
  username: string
  role: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      setIsLoading(false)
      return
    }
    api
      .get<User>('/auth/me')
      .then(res => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('token')
        setToken(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function login(username: string, password: string) {
    const res = await api.post<{ access_token: string; user: User }>('/auth/login', {
      username,
      password,
    })
    const { access_token, user: userData } = res.data
    localStorage.setItem('token', access_token)
    setToken(access_token)
    setUser(userData)
  }

  function logout() {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

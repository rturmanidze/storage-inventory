/**
 * Notification context — stores in-app notifications and provides
 * helpers to mark them read. Stays in sync via WebSocket events.
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import api from '../api/client'
import { useWebSocket } from './WebSocketContext'
import { useAuth } from './AuthContext'

export interface Notification {
  id: number
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  refresh: () => void
}

const NotificationContext = createContext<NotificationContextType | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const { subscribe } = useWebSocket()
  const { token } = useAuth()

  const refresh = useCallback(async () => {
    if (!token) {
      setNotifications([])
      return
    }
    try {
      const res = await api.get<Notification[]>('/notifications')
      setNotifications(res.data)
    } catch {
      // ignore auth errors (e.g. during logout)
    }
  }, [token])

  // Initial load & re-fetch when auth state changes
  useEffect(() => {
    refresh()
  }, [refresh])

  // Listen for real-time notification events
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.event === 'notification') {
        const n = msg.notification as Notification
        setNotifications((prev) => [n, ...prev.slice(0, 49)])
      }
    })
  }, [subscribe])

  async function markRead(id: number) {
    await api.patch(`/notifications/${id}/read`)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    )
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all')
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, refresh }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}

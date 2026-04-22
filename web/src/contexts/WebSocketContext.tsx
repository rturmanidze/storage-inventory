/**
 * WebSocket context — provides a single shared connection to /api/ws
 * and exposes an event listener pattern for components to subscribe.
 */
import { createContext, useContext, useEffect, useRef, ReactNode } from 'react'
import { useAuth } from './AuthContext'

export interface WsEvent {
  event: string
  [key: string]: unknown
}

type WsListener = (msg: WsEvent) => void

interface WebSocketContextType {
  subscribe: (listener: WsListener) => () => void
}

const WebSocketContext = createContext<WebSocketContextType | null>(null)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const listenersRef = useRef<Set<WsListener>>(new Set())
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!token) return

    // Determine WebSocket URL based on current page protocol
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`

    let ws: WebSocket
    let reconnectTimeout: ReturnType<typeof setTimeout>

    function connect() {
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg: WsEvent = JSON.parse(e.data)
          listenersRef.current.forEach((fn) => fn(msg))
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        // Reconnect after 3 seconds unless the component unmounted
        reconnectTimeout = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [token])

  function subscribe(listener: WsListener) {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }

  return (
    <WebSocketContext.Provider value={{ subscribe }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext)
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider')
  return ctx
}

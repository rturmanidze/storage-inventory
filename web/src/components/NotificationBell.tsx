import { useState, useRef, useEffect } from 'react'
import { useNotifications } from '../contexts/NotificationContext'

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const TYPE_ICON: Record<string, string> = {
    LOW_STOCK: '⚠️',
    SUSPICIOUS_ACTIVITY: '🚨',
    INVENTORY_UPDATE: '📦',
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v: boolean) => !v)}
        className="relative p-2 rounded-md text-gray-500 hover:bg-gray-100 focus:outline-none"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white font-bold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg ring-1 ring-black/5 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">No notifications</li>
            )}
            {notifications.map((n: Notification) => (
              <li
                key={n.id}
                className={`px-4 py-3 flex gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  !n.isRead ? 'bg-amber-50' : ''
                }`}
                onClick={() => !n.isRead && markRead(n.id)}
              >
                <span className="mt-0.5 text-lg shrink-0">{TYPE_ICON[n.type] ?? '🔔'}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                  <p className="text-xs text-gray-500 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                {!n.isRead && (
                  <span className="ml-auto mt-1 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

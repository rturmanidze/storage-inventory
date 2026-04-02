import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface NavItem {
  label: string
  to: string
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Items', to: '/items' },
  { label: 'Warehouses', to: '/warehouses' },
  { label: 'Issued To', to: '/issued-to' },
  { label: 'Units (Search)', to: '/units' },
  { label: '↩ Receive', to: '/movements/receive' },
  { label: '⇄ Transfer', to: '/movements/transfer' },
  { label: '↗ Issue', to: '/movements/issue' },
  { label: '↙ Return', to: '/movements/return' },
  { label: '⬆ Import', to: '/import' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-60 bg-indigo-900 text-white flex flex-col transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}
      >
        <div className="flex items-center h-16 px-4 bg-indigo-950 shrink-0">
          <span className="text-xl font-bold tracking-tight">📦 StorageInv</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-700 text-white'
                    : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-indigo-800 shrink-0">
          <p className="text-xs text-indigo-300 truncate">{user?.username}</p>
          <p className="text-xs text-indigo-400 capitalize mb-2">{user?.role}</p>
          <button onClick={logout} className="btn-secondary btn-sm w-full text-gray-700">
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center h-16 px-4 bg-white border-b border-gray-200 shrink-0">
          <button
            className="lg:hidden mr-3 p-2 rounded-md text-gray-500 hover:bg-gray-100"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="hidden sm:inline">{user?.username}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 capitalize">
              {user?.role}
            </span>
            <button onClick={logout} className="btn-secondary btn-sm">
              Log out
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

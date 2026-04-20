import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../contexts/WebSocketContext'

interface StatusBreakdown {
  IN_STOCK: number
  ISSUED: number
  QUARANTINED: number
  SCRAPPED: number
  DAMAGED: number
  EXPIRED: number
  DESTROYED: number
}

interface LowStockItem {
  id: number
  sku: string
  name: string
  category: string | null
  inStockCount: number
  minStock: number
}

interface RecentMovement {
  id: number
  type: string
  note: string | null
  createdAt: string
  createdBy: { id: number; username: string; role: string }
  linesCount: number
}

interface DashboardStats {
  totalUnits: number
  statusBreakdown: StatusBreakdown
  lowStockItems: LowStockItem[]
  recentMovements: RecentMovement[]
}

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'In Stock',
  ISSUED: 'In Use',
  QUARANTINED: 'Quarantined',
  SCRAPPED: 'Scrapped',
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  DESTROYED: 'Destroyed',
}

const STATUS_COLORS: Record<string, { badge: string; bar: string; dot: string }> = {
  IN_STOCK: { badge: 'status-in-stock', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  ISSUED: { badge: 'status-issued', bar: 'bg-blue-500', dot: 'bg-blue-500' },
  QUARANTINED: { badge: 'status-quarantined', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  SCRAPPED: { badge: 'status-scrapped', bar: 'bg-gray-400', dot: 'bg-gray-400' },
  DAMAGED: { badge: 'status-damaged', bar: 'bg-orange-500', dot: 'bg-orange-500' },
  EXPIRED: { badge: 'status-expired', bar: 'bg-purple-400', dot: 'bg-purple-400' },
  DESTROYED: { badge: 'status-destroyed', bar: 'bg-red-600', dot: 'bg-red-600' },
}

const MOVEMENT_LABELS: Record<string, { text: string; badge: string; icon: string }> = {
  RECEIVE: { text: 'Receive', badge: 'status-in-stock', icon: '↓' },
  TRANSFER: { text: 'Transfer', badge: 'status-issued', icon: '⇄' },
  ISSUE: { text: 'Issue', badge: 'status-quarantined', icon: '→' },
  RETURN: { text: 'Return', badge: 'status-expired', icon: '←' },
  ADJUST: { text: 'Adjust', badge: 'status-scrapped', icon: '⚙' },
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  accent,
  onClick,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent: string
  onClick?: () => void
}) {
  return (
    <div
      className={`card-hover p-5 flex items-start gap-4 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
    >
      <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${accent} shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
      </div>
      {onClick && (
        <svg className="w-4 h-4 text-gray-300 ml-auto shrink-0 self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { subscribe } = useWebSocket()

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/dashboard/stats').then(r => r.data),
    refetchInterval: 30_000,
  })

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.event === 'inventory_update' || msg.event === 'movement_created') {
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      }
      if (msg.event === 'low_stock_alert') {
        const item = msg as { event: string; name?: string; sku?: string; inStock?: number; minStock?: number }
        toast(`⚠️ Low stock: ${item.name ?? item.sku} (${item.inStock}/${item.minStock})`, {
          duration: 6000,
          style: { background: '#fef3c7', color: '#92400e' },
        })
      }
    })
  }, [subscribe, queryClient])

  const defaultBreakdown: StatusBreakdown = {
    IN_STOCK: 0,
    ISSUED: 0,
    QUARANTINED: 0,
    SCRAPPED: 0,
    DAMAGED: 0,
    EXPIRED: 0,
    DESTROYED: 0,
  }
  const total = stats?.totalUnits ?? 0
  const breakdown = stats?.statusBreakdown ?? defaultBreakdown
  const inStock = breakdown.IN_STOCK ?? 0
  const damaged = (breakdown.DAMAGED ?? 0) + (breakdown.EXPIRED ?? 0) + (breakdown.DESTROYED ?? 0)

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Welcome */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Welcome back, <span className="font-medium text-gray-700">{user?.username}</span>
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">Loading dashboard…</span>
          </div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Inventory"
              value={total}
              sub="all serialized units"
              accent="bg-primary-50 text-primary-600"
              onClick={() => navigate('/units')}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
              }
            />
            <MetricCard
              label="In Stock"
              value={inStock}
              sub={total ? `${Math.round((inStock / total) * 100)}% of total` : '—'}
              accent="bg-emerald-50 text-emerald-600"
              onClick={() => navigate('/units?status=IN_STOCK')}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              }
            />
            <MetricCard
              label="Damaged / Expired / Destroyed"
              value={damaged}
              sub={total ? `${Math.round((damaged / total) * 100)}% of total` : '—'}
              accent="bg-red-50 text-red-600"
              onClick={() => navigate('/units?status=DAMAGED')}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              }
            />
            <MetricCard
              label="Low Stock Alerts"
              value={stats?.lowStockItems.length ?? 0}
              sub="items below minimum"
              accent="bg-amber-50 text-amber-600"
              onClick={() => navigate('/items?lowStock=true')}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              }
            />
          </div>

          {/* Status Breakdown */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Inventory Status Breakdown</h2>
            {total > 0 ? (
              <>
                <div className="flex h-3 rounded-full overflow-hidden gap-px bg-gray-100">
                  {(Object.entries(breakdown) as [string, number][]).map(([status, count]) =>
                    count > 0 ? (
                      <div
                        key={status}
                        className={`${STATUS_COLORS[status]?.bar ?? 'bg-gray-300'} transition-all duration-500 first:rounded-l-full last:rounded-r-full cursor-pointer hover:opacity-80`}
                        style={{ width: `${(count / total) * 100}%` }}
                        title={`${STATUS_LABELS[status]}: ${count} — click to view`}
                        onClick={() => navigate(`/units?status=${status}`)}
                      />
                    ) : null
                  )}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
                  {(Object.entries(breakdown) as [string, number][]).map(([status, count]) => (
                    <button
                      key={status}
                      className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                      onClick={() => navigate(`/units?status=${status}`)}
                      title={`View ${STATUS_LABELS[status]} units`}
                    >
                      <span className={`badge-dot ${STATUS_COLORS[status]?.dot ?? 'bg-gray-300'}`} />
                      <span>{STATUS_LABELS[status]}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">No units recorded yet.</p>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Low Stock Alerts */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Low Stock Alerts
                </h2>
                <button
                  className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  onClick={() => navigate('/items?lowStock=true')}
                >
                  View all →
                </button>
              </div>
              {stats?.lowStockItems.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm text-gray-400">All items above minimum stock</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {stats?.lowStockItems.map(item => (
                    <li
                      key={item.id}
                      className="px-6 py-3 flex items-center justify-between hover:bg-surface-secondary transition-colors cursor-pointer"
                      onClick={() => navigate(`/items/${item.id}`)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.sku} · {item.category ?? 'No category'}</p>
                      </div>
                      <span className="badge status-destroyed shrink-0 ml-3">
                        {item.inStockCount} / {item.minStock}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recent Activity */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Recent Activity
                </h2>
                <button
                  className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  onClick={() => navigate('/audit')}
                >
                  View all →
                </button>
              </div>
              {stats?.recentMovements.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm text-gray-400">No movements recorded yet</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {stats?.recentMovements.map(m => {
                    const meta = MOVEMENT_LABELS[m.type] ?? { text: m.type, badge: 'status-scrapped', icon: '•' }
                    return (
                      <li key={m.id} className="px-6 py-3 flex items-start justify-between gap-3 hover:bg-surface-secondary transition-colors">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`badge ${meta.badge}`}>
                              {meta.icon} {meta.text}
                            </span>
                            <span className="text-xs text-gray-400">
                              {m.linesCount} unit{m.linesCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            by {m.createdBy.username}
                          </p>
                          {m.note && <p className="text-xs text-gray-400 truncate mt-0.5">{m.note}</p>}
                        </div>
                        <time className="text-2xs text-gray-400 whitespace-nowrap shrink-0 pt-0.5">
                          {new Date(m.createdAt).toLocaleString()}
                        </time>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="section-title mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Receive Stock',
                  to: '/movements/receive',
                  color: 'hover:border-emerald-300 hover:bg-emerald-50/50',
                  iconColor: 'bg-emerald-50 text-emerald-600',
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
                    </svg>
                  ),
                },
                {
                  label: 'View Inventory',
                  to: '/units',
                  color: 'hover:border-primary-300 hover:bg-primary-50/50',
                  iconColor: 'bg-primary-50 text-primary-600',
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                    </svg>
                  ),
                },
                {
                  label: 'Audit Log',
                  to: '/audit',
                  color: 'hover:border-indigo-300 hover:bg-indigo-50/50',
                  iconColor: 'bg-indigo-50 text-indigo-600',
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                  ),
                },
                {
                  label: 'Reports',
                  to: '/reports',
                  color: 'hover:border-purple-300 hover:bg-purple-50/50',
                  iconColor: 'bg-purple-50 text-purple-600',
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                    </svg>
                  ),
                },
              ].map(q => (
                <button
                  key={q.to}
                  className={`card-hover p-4 flex flex-col items-center gap-3 cursor-pointer transition-all ${q.color}`}
                  onClick={() => navigate(q.to)}
                >
                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${q.iconColor}`}>
                    {q.icon}
                  </div>
                  <span className="text-xs font-medium text-gray-700">{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

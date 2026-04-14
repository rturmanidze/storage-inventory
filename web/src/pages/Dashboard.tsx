import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface StatusBreakdown {
  IN_STOCK: number
  ISSUED: number
  QUARANTINED: number
  SCRAPPED: number
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
  IN_STOCK: 'Active',
  ISSUED: 'In Use',
  QUARANTINED: 'Damaged',
  SCRAPPED: 'Removed',
}

const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: 'bg-emerald-100 text-emerald-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  QUARANTINED: 'bg-amber-100 text-amber-800',
  SCRAPPED: 'bg-red-100 text-red-800',
}

const STATUS_BAR_COLORS: Record<string, string> = {
  IN_STOCK: 'bg-emerald-500',
  ISSUED: 'bg-blue-500',
  QUARANTINED: 'bg-amber-500',
  SCRAPPED: 'bg-red-500',
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  RECEIVE: '↩ Receive',
  TRANSFER: '⇄ Transfer',
  ISSUE: '↗ Issue',
  RETURN: '↙ Return',
  ADJUST: '⚙ Adjust',
}

const MOVEMENT_TYPE_COLORS: Record<string, string> = {
  RECEIVE: 'bg-emerald-100 text-emerald-800',
  TRANSFER: 'bg-blue-100 text-blue-800',
  ISSUE: 'bg-amber-100 text-amber-800',
  RETURN: 'bg-purple-100 text-purple-800',
  ADJUST: 'bg-gray-100 text-gray-800',
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Shift Manager',
  VIEWER: 'Operations Manager',
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent: string
}) {
  return (
    <div className={`card p-5 border-l-4 ${accent}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/dashboard/stats').then(r => r.data),
    refetchInterval: 30_000,
  })

  const total = stats?.totalUnits ?? 0
  const breakdown = stats?.statusBreakdown ?? { IN_STOCK: 0, ISSUED: 0, QUARANTINED: 0, SCRAPPED: 0 }
  const inStock = breakdown.IN_STOCK
  const inUse = breakdown.ISSUED
  const damaged = breakdown.QUARANTINED
  const removed = breakdown.SCRAPPED

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          🎰 Casino WMS — Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, <strong>{user?.username}</strong> · {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">Loading metrics…</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Inventory"
              value={total}
              sub="all serialized units"
              accent="border-indigo-500"
            />
            <MetricCard
              label="Active"
              value={inStock}
              sub={total ? `${Math.round((inStock / total) * 100)}% of total` : '—'}
              accent="border-emerald-500"
            />
            <MetricCard
              label="In Use / Issued"
              value={inUse}
              sub={total ? `${Math.round((inUse / total) * 100)}% of total` : '—'}
              accent="border-blue-500"
            />
            <MetricCard
              label="Low Stock Alerts"
              value={stats?.lowStockItems.length ?? 0}
              sub="items below minimum"
              accent="border-red-500"
            />
          </div>

          {/* Status Breakdown bar */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Inventory Status Breakdown</h2>
            {total > 0 ? (
              <>
                <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
                  {(Object.entries(breakdown) as [string, number][]).map(([status, count]) =>
                    count > 0 ? (
                      <div
                        key={status}
                        className={`${STATUS_BAR_COLORS[status]} transition-all`}
                        style={{ width: `${(count / total) * 100}%` }}
                        title={`${STATUS_LABELS[status]}: ${count}`}
                      />
                    ) : null
                  )}
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  {(Object.entries(breakdown) as [string, number][]).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_BAR_COLORS[status]}`} />
                      {STATUS_LABELS[status]}: <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">No units recorded yet.</p>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Low Stock Alerts */}
            <div className="card">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">🔴 Low Stock Alerts</h2>
                <button
                  className="text-xs text-indigo-600 hover:underline"
                  onClick={() => navigate('/items')}
                >
                  View all items →
                </button>
              </div>
              {stats?.lowStockItems.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400">All items are above minimum stock.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {stats?.lowStockItems.map(item => (
                    <li key={item.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.sku} · {item.category ?? 'No category'}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {item.inStockCount} / {item.minStock}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recent Activity */}
            <div className="card">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">📋 Recent Activity</h2>
              </div>
              {stats?.recentMovements.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400">No movements recorded yet.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {stats?.recentMovements.map(m => (
                    <li key={m.id} className="px-5 py-3 flex items-start justify-between gap-2 hover:bg-gray-50">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              MOVEMENT_TYPE_COLORS[m.type] ?? 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                          </span>
                          <span className="text-xs text-gray-500">
                            {m.linesCount} unit{m.linesCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          by {m.createdBy.username} · {ROLE_LABELS[m.createdBy.role] ?? m.createdBy.role}
                        </p>
                        {m.note && <p className="text-xs text-gray-400 truncate">{m.note}</p>}
                      </div>
                      <time className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                        {new Date(m.createdAt).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Quick action shortcuts */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Receive Stock', emoji: '↩', to: '/movements/receive', color: 'hover:border-emerald-400' },
                { label: 'Transfer', emoji: '⇄', to: '/movements/transfer', color: 'hover:border-blue-400' },
                { label: 'Issue Items', emoji: '↗', to: '/movements/issue', color: 'hover:border-amber-400' },
                { label: 'Return Items', emoji: '↙', to: '/movements/return', color: 'hover:border-purple-400' },
              ].map(q => (
                <button
                  key={q.to}
                  className={`card p-4 text-center hover:shadow-md transition-all cursor-pointer ${q.color}`}
                  onClick={() => navigate(q.to)}
                >
                  <div className="text-2xl mb-1">{q.emoji}</div>
                  <div className="text-xs font-medium text-gray-700">{q.label}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}


import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../contexts/WebSocketContext'

interface CardInventorySummary {
  blackDecks: number
  redDecks: number
  blackCards: number
  redCards: number
  totalDecks: number
  totalCards: number
  shoesInWarehouse: number
  shoesSentToStudio: number
  totalShoes: number
}

interface DeckColorStatus {
  available: number
  threshold: number
  isLow: boolean
  cards: number
}

interface DeckLowStockResponse {
  black: DeckColorStatus
  red: DeckColorStatus
  hasAlerts: boolean
  alertCount: number
}

interface DeckEntry {
  id: number
  color: 'BLACK' | 'RED'
  deckCount: number
  cardCount: number
  note: string | null
  createdAt: string
  createdBy: { id: number; username: string } | null
}

interface DashboardCardStats {
  inventory: CardInventorySummary
  recentEntries: DeckEntry[]
  lowStock: DeckLowStockResponse
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  accent,
  onClick,
  alert,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent: string
  onClick?: () => void
  alert?: boolean
}) {
  return (
    <div
      className={`card-hover p-5 flex items-start gap-4 ${onClick ? 'cursor-pointer' : ''} ${alert ? 'ring-2 ring-amber-400' : ''}`}
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

const deckIcon = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-.98.626-1.813 1.5-2.122" />
  </svg>
)

const shoeIcon = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
  </svg>
)

const alertIcon = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
  </svg>
)

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { subscribe } = useWebSocket()

  const { data: cardStats, isLoading } = useQuery<DashboardCardStats>({
    queryKey: ['dashboard-card-stats'],
    queryFn: () => api.get('/dashboard/card-stats').then(r => r.data),
    refetchInterval: 30_000,
  })

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.event === 'inventory_update' || msg.event === 'movement_created') {
        queryClient.invalidateQueries({ queryKey: ['dashboard-card-stats'] })
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

  const inventory = cardStats?.inventory
  const lowStock = cardStats?.lowStock

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
          {/* Primary KPI Cards — Deck Inventory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="In Stock — Black Decks"
              value={inventory?.blackDecks ?? 0}
              sub={`${(inventory?.blackCards ?? 0).toLocaleString()} cards`}
              accent="bg-gray-800 text-white"
              onClick={() => navigate('/decks?color=BLACK')}
              alert={lowStock?.black.isLow}
              icon={deckIcon}
            />
            <MetricCard
              label="In Stock — Red Decks"
              value={inventory?.redDecks ?? 0}
              sub={`${(inventory?.redCards ?? 0).toLocaleString()} cards`}
              accent="bg-red-50 text-red-600"
              onClick={() => navigate('/decks?color=RED')}
              alert={lowStock?.red.isLow}
              icon={deckIcon}
            />
            <MetricCard
              label="Low Stock Alerts"
              value={lowStock?.alertCount ?? 0}
              sub={lowStock?.hasAlerts ? 'colors below threshold' : 'all colors above threshold'}
              accent={lowStock?.hasAlerts ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}
              onClick={() => navigate('/decks?lowStock=true')}
              alert={lowStock?.hasAlerts}
              icon={alertIcon}
            />
            <MetricCard
              label="Shoes in Warehouse"
              value={inventory?.shoesInWarehouse ?? 0}
              sub="ready to send to studios"
              accent="bg-indigo-50 text-indigo-600"
              onClick={() => navigate('/shoes?status=IN_WAREHOUSE')}
              icon={shoeIcon}
            />
          </div>

          {/* Low Stock Detail + Recent Deck Entries */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Deck Low Stock Alerts */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Deck Low Stock Alerts
                </h2>
                <button
                  className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  onClick={() => navigate('/decks?lowStock=true')}
                >
                  View inventory →
                </button>
              </div>
              {!lowStock?.hasAlerts ? (
                <div className="px-6 py-8 text-center">
                  <svg className="w-8 h-8 text-emerald-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm text-gray-400">All deck colors above minimum threshold</p>
                  <p className="text-xs text-gray-300 mt-1">Threshold: {lowStock?.black.threshold ?? 16} decks per color</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {lowStock && (
                    <>
                      {lowStock.black.isLow && (
                        <li
                          className="px-6 py-4 flex items-center justify-between hover:bg-surface-secondary transition-colors cursor-pointer"
                          onClick={() => navigate('/decks?color=BLACK')}
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-white">
                              <span className="w-2 h-2 rounded-full inline-block bg-gray-300" /> Black
                            </span>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Black Decks Low</p>
                              <p className="text-xs text-gray-500">{lowStock.black.available.toLocaleString()} decks available</p>
                            </div>
                          </div>
                          <span className="badge status-destroyed shrink-0 ml-3">
                            {lowStock.black.available} / {lowStock.black.threshold}
                          </span>
                        </li>
                      )}
                      {lowStock.red.isLow && (
                        <li
                          className="px-6 py-4 flex items-center justify-between hover:bg-surface-secondary transition-colors cursor-pointer"
                          onClick={() => navigate('/decks?color=RED')}
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <span className="w-2 h-2 rounded-full inline-block bg-red-500" /> Red
                            </span>
                            <div>
                              <p className="text-sm font-medium text-gray-900">Red Decks Low</p>
                              <p className="text-xs text-gray-500">{lowStock.red.available.toLocaleString()} decks available</p>
                            </div>
                          </div>
                          <span className="badge status-destroyed shrink-0 ml-3">
                            {lowStock.red.available} / {lowStock.red.threshold}
                          </span>
                        </li>
                      )}
                    </>
                  )}
                </ul>
              )}
            </div>

            {/* Recent Deck Inventory Activity */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Recent Deck Additions
                </h2>
                <button
                  className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  onClick={() => navigate('/decks')}
                >
                  View all →
                </button>
              </div>
              {!cardStats?.recentEntries.length ? (
                <div className="px-6 py-8 text-center">
                  <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm text-gray-400">No deck entries recorded yet</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {cardStats?.recentEntries.map(entry => (
                    <li key={entry.id} className="px-6 py-3 flex items-start justify-between gap-3 hover:bg-surface-secondary transition-colors">
                      <div className="min-w-0 flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                          entry.color === 'BLACK' ? 'bg-gray-800 text-white' : 'bg-red-100 text-red-700'
                        }`}>
                          <span className={`w-2 h-2 rounded-full inline-block ${entry.color === 'BLACK' ? 'bg-gray-300' : 'bg-red-500'}`} />
                          {entry.color === 'BLACK' ? 'Black' : 'Red'}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">+{entry.deckCount} decks</p>
                          <p className="text-xs text-gray-500">
                            {entry.cardCount.toLocaleString()} cards · by {entry.createdBy?.username ?? '—'}
                          </p>
                        </div>
                      </div>
                      <time className="text-2xs text-gray-400 whitespace-nowrap shrink-0 pt-0.5">
                        {new Date(entry.createdAt).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Inventory Totals */}
          <div>
            <h2 className="section-title mb-3">Inventory Totals</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard
                label="Total Decks Available"
                value={inventory?.totalDecks ?? 0}
                sub={`${(inventory?.totalCards ?? 0).toLocaleString()} cards total`}
                accent="bg-primary-50 text-primary-600"
                onClick={() => navigate('/decks')}
                icon={deckIcon}
              />
              <MetricCard
                label="Shoes in Studios"
                value={inventory?.shoesSentToStudio ?? 0}
                sub="deployed to studios"
                accent="bg-emerald-50 text-emerald-600"
                onClick={() => navigate('/shoes?status=SENT_TO_STUDIO')}
                icon={shoeIcon}
              />
              <MetricCard
                label="Total Shoes"
                value={inventory?.totalShoes ?? 0}
                sub="warehouse + studios"
                accent="bg-indigo-50 text-indigo-600"
                onClick={() => navigate('/shoes')}
                icon={shoeIcon}
              />
              <MetricCard
                label="Shoes Possible"
                value={inventory ? Math.floor(inventory.totalDecks / 8) : 0}
                sub="from available decks"
                accent="bg-purple-50 text-purple-600"
                onClick={() => navigate('/shoes')}
                icon={shoeIcon}
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="section-title mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Deck Inventory',
                  to: '/decks',
                  color: 'hover:border-gray-400 hover:bg-gray-50/50',
                  iconColor: 'bg-gray-100 text-gray-700',
                  icon: deckIcon,
                },
                {
                  label: 'Manage Shoes',
                  to: '/shoes',
                  color: 'hover:border-indigo-300 hover:bg-indigo-50/50',
                  iconColor: 'bg-indigo-50 text-indigo-600',
                  icon: shoeIcon,
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

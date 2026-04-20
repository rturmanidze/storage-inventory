import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface SummaryData {
  totalUnits: number
  statusBreakdown: Record<string, number>
  dailyMovements: { day: string; count: number }[]
}

interface DeckConsumptionDay {
  day: string
  decksConsumed: number
  shoesCreated: number
  shoesReturned: number
}

interface CardReportSummary {
  totalBlackDecks: number
  totalRedDecks: number
  totalDecks: number
  totalBlackCards: number
  totalRedCards: number
  totalCards: number
  totalPlasticDecks: number
  totalPaperDecks: number
  totalPlasticCards: number
  totalPaperCards: number
  shoesCreated: number
  shoesInWarehouse: number
  shoesSentToStudio: number
  shoesReturned: number
  shoesDestroyed: number
  totalShoes: number
  plasticShoesCreated: number
  paperShoesCreated: number
  dailyConsumption: DeckConsumptionDay[]
}

const STATUS_DOT: Record<string, string> = {
  IN_STOCK: 'bg-emerald-500',
  ISSUED: 'bg-blue-500',
  QUARANTINED: 'bg-amber-500',
  SCRAPPED: 'bg-gray-400',
  DAMAGED: 'bg-orange-500',
  EXPIRED: 'bg-purple-400',
  DESTROYED: 'bg-red-600',
}

function downloadCSV(url: string, filename: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : ''
  const token = localStorage.getItem('token') ?? ''
  fetch(`/api${url}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => r.blob())
    .then((blob) => {
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      a.click()
      URL.revokeObjectURL(href)
    })
}

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const { data: summary, isLoading } = useQuery<SummaryData>({
    queryKey: ['reports-summary'],
    queryFn: async () => {
      const res = await api.get<SummaryData>('/reports/summary')
      return res.data
    },
  })

  const { data: cardSummary, isLoading: cardLoading } = useQuery<CardReportSummary>({
    queryKey: ['reports-cards-summary'],
    queryFn: async () => {
      const res = await api.get<CardReportSummary>('/reports/cards/summary')
      return res.data
    },
  })

  function getExportParams(): Record<string, string> {
    const p: Record<string, string> = {}
    if (fromDate) p.from = new Date(fromDate).toISOString()
    if (toDate) p.to = new Date(toDate).toISOString()
    return p
  }

  const maxMovements = Math.max(...(summary?.dailyMovements.map((d) => d.count) ?? [1]), 1)
  const maxConsumption = Math.max(...(cardSummary?.dailyConsumption.map((d) => Math.abs(d.decksConsumed)) ?? [1]), 1)

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="page-title">Reports & Analytics</h1>
        <p className="page-subtitle">Overview of inventory metrics and data exports</p>
      </div>

      {/* Casino Card Inventory Summary */}
      <div>
        <h2 className="section-title mb-3">Casino Card Inventory</h2>
        {cardLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Loading…</div>
        ) : cardSummary ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
              <div className="card-hover p-5">
                <p className="section-title mb-1">Black Decks</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.totalBlackDecks}</p>
                <p className="text-xs text-gray-400 mt-0.5">{cardSummary.totalBlackCards.toLocaleString()} cards</p>
              </div>
              <div className="card-hover p-5">
                <p className="section-title mb-1 text-red-500">Red Decks</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.totalRedDecks}</p>
                <p className="text-xs text-gray-400 mt-0.5">{cardSummary.totalRedCards.toLocaleString()} cards</p>
              </div>
              <div className="card-hover p-5">
                <p className="section-title mb-1">Total Decks</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.totalDecks}</p>
                <p className="text-xs text-gray-400 mt-0.5">{cardSummary.totalCards.toLocaleString()} cards</p>
              </div>
              <div className="card-hover p-5">
                <p className="section-title mb-1 text-indigo-500">In Warehouse</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.shoesInWarehouse}</p>
                <p className="text-xs text-gray-400 mt-0.5">shoes</p>
              </div>
              <div className="card-hover p-5">
                <p className="section-title mb-1 text-emerald-500">In Studios</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.shoesSentToStudio}</p>
                <p className="text-xs text-gray-400 mt-0.5">shoes</p>
              </div>
              <div className="card-hover p-5">
                <p className="section-title mb-1 text-rose-500">Destroyed</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.shoesDestroyed}</p>
                <p className="text-xs text-gray-400 mt-0.5">shoes</p>
              </div>
            </div>

            {/* Material Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="card-hover p-5 border-l-4 border-blue-400">
                <p className="section-title mb-1 text-blue-600">🔷 Plastic Decks</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.totalPlasticDecks ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(cardSummary.totalPlasticCards ?? 0).toLocaleString()} cards</p>
              </div>
              <div className="card-hover p-5 border-l-4 border-amber-400">
                <p className="section-title mb-1 text-amber-600">📄 Paper Decks</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.totalPaperDecks ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(cardSummary.totalPaperCards ?? 0).toLocaleString()} cards</p>
              </div>
              <div className="card-hover p-5 border-l-4 border-blue-400">
                <p className="section-title mb-1 text-blue-600">🔷 Plastic Shoes</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.plasticShoesCreated ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">total shoes</p>
              </div>
              <div className="card-hover p-5 border-l-4 border-amber-400">
                <p className="section-title mb-1 text-amber-600">📄 Paper Shoes</p>
                <p className="text-2xl font-bold text-gray-900">{cardSummary.paperShoesCreated ?? 0}</p>
                <p className="text-xs text-gray-400 mt-0.5">total shoes</p>
              </div>
            </div>

            {/* Shoe Lifecycle Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="card p-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Created</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{cardSummary.shoesCreated}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-teal-500 font-medium uppercase tracking-wide">Returned</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{cardSummary.shoesReturned}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-rose-500 font-medium uppercase tracking-wide">Destroyed</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{cardSummary.shoesDestroyed}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Active (Total)</p>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {cardSummary.shoesInWarehouse + cardSummary.shoesSentToStudio}
                </p>
              </div>
            </div>

            {/* Deck Consumption Trend */}
            {cardSummary.dailyConsumption.length > 0 && (
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                  </svg>
                  Deck Consumption Trend (last 30 days)
                </h3>
                <div className="flex items-end gap-[3px] h-36">
                  {cardSummary.dailyConsumption.map((d) => {
                    const net = d.decksConsumed
                    const heightPct = Math.max(4, (Math.abs(net) / maxConsumption) * 100)
                    return (
                      <div key={d.day} className="flex flex-col items-center flex-1 min-w-0 group">
                        <div className="relative flex-1 flex items-end w-full">
                          <div
                            className={`w-full rounded-t-sm transition-all duration-150 ${
                              net > 0 ? 'bg-rose-400 group-hover:bg-rose-500' : net < 0 ? 'bg-emerald-400 group-hover:bg-emerald-500' : 'bg-gray-200'
                            }`}
                            style={{ height: `${heightPct}%` }}
                            title={`${d.day}: ${net > 0 ? '+' : ''}${net} decks net (${d.shoesCreated} created, ${d.shoesReturned} returned)`}
                          />
                        </div>
                        <span className="text-2xs text-gray-400 mt-1.5 hidden sm:block truncate w-full text-center">
                          {d.day.slice(5)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-400 inline-block" />Decks consumed</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-400 inline-block" />Net returned</span>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* General WMS Summary */}
      {!isLoading && summary && (summary.totalUnits > 0 || Object.values(summary.statusBreakdown).some(v => v > 0)) && (
        <div>
          <h2 className="section-title mb-3">General WMS Units</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card-hover p-5 col-span-2 sm:col-span-1">
              <p className="section-title mb-1">Total Units</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalUnits}</p>
            </div>
            {Object.entries(summary.statusBreakdown ?? {}).map(([s, count]) => (
              <div key={s} className="card-hover p-5">
                <p className="section-title mb-1">{s.replace(/_/g, ' ')}</p>
                <div className="flex items-center gap-2">
                  <span className={`badge-dot ${STATUS_DOT[s] ?? 'bg-gray-300'}`} />
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement trend chart */}
      {summary && summary.dailyMovements.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            Movements (last 30 days)
          </h2>
          <div className="flex items-end gap-[3px] h-36">
            {summary.dailyMovements.map((d) => (
              <div key={d.day} className="flex flex-col items-center flex-1 min-w-0 group">
                <div className="relative flex-1 flex items-end w-full">
                  <div
                    className="w-full bg-primary-400 rounded-t-sm group-hover:bg-primary-500 transition-all duration-150"
                    style={{ height: `${Math.max(4, (d.count / maxMovements) * 100)}%` }}
                    title={`${d.day}: ${d.count}`}
                  />
                </div>
                <span className="text-2xs text-gray-400 mt-1.5 hidden sm:block truncate w-full text-center">
                  {d.day.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export section */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export Data
        </h2>

        <div className="flex flex-wrap gap-4 mb-5">
          <div>
            <label className="label">From date</label>
            <input
              type="datetime-local"
              className="input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">To date</label>
            <input
              type="datetime-local"
              className="input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            onClick={() => downloadCSV('/reports/inventory/csv', 'inventory_export.csv')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
            Export Inventory
          </button>
          <button
            className="btn-secondary"
            onClick={() =>
              downloadCSV('/reports/movements/csv', 'movements_export.csv', getExportParams())
            }
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Export Movements
          </button>
          <button
            className="btn-secondary"
            onClick={() =>
              downloadCSV('/reports/activity/csv', 'user_activity_export.csv', getExportParams())
            }
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            Export User Activity
          </button>
          <button
            className="btn-secondary"
            onClick={() => downloadCSV('/reports/cards/shoes/csv', 'destroyed_shoes_export.csv', { status: 'DESTROYED' })}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
            </svg>
            Export Destroyed Shoes
          </button>
        </div>
      </div>
    </div>
  )
}

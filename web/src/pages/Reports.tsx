import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface SummaryData {
  totalUnits: number
  statusBreakdown: Record<string, number>
  dailyMovements: { day: string; count: number }[]
}

const STATUS_COLOR: Record<string, string> = {
  IN_STOCK: 'bg-green-500',
  ISSUED: 'bg-blue-500',
  QUARANTINED: 'bg-yellow-500',
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

  function getExportParams(): Record<string, string> {
    const p: Record<string, string> = {}
    if (fromDate) p.from = new Date(fromDate).toISOString()
    if (toDate) p.to = new Date(toDate).toISOString()
    return p
  }

  const maxMovements = Math.max(...(summary?.dailyMovements.map((d) => d.count) ?? [1]), 1)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports & Analytics</h1>

      {/* Summary cards */}
      {isLoading ? (
        <p className="text-gray-400 mb-6">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="card col-span-2 sm:col-span-1">
            <p className="text-sm text-gray-500 mb-1">Total Units</p>
            <p className="text-3xl font-bold text-gray-900">{summary?.totalUnits ?? 0}</p>
          </div>
          {Object.entries(summary?.statusBreakdown ?? {}).map(([s, count]) => (
            <div key={s} className="card">
              <p className="text-xs text-gray-500 mb-1">{s}</p>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-3 w-3 rounded-full ${STATUS_COLOR[s] ?? 'bg-gray-300'}`} />
                <p className="text-2xl font-bold text-gray-900">{count}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Movement trend chart */}
      {summary && summary.dailyMovements.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-4">Movements (last 30 days)</h2>
          <div className="flex items-end gap-1 h-32">
            {summary.dailyMovements.map((d) => (
              <div key={d.day} className="flex flex-col items-center flex-1 min-w-0 group">
                <div className="relative flex-1 flex items-end w-full">
                  <div
                    className="w-full bg-amber-400 rounded-t group-hover:bg-amber-500 transition-all"
                    style={{ height: `${Math.max(4, (d.count / maxMovements) * 100)}%` }}
                    title={`${d.day}: ${d.count}`}
                  />
                </div>
                <span className="text-xs text-gray-400 mt-1 hidden sm:block truncate w-full text-center">
                  {d.day.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export section */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Export Data</h2>

        <div className="flex flex-wrap gap-4 mb-4">
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
            📦 Export Inventory (CSV)
          </button>
          <button
            className="btn-secondary"
            onClick={() =>
              downloadCSV('/reports/movements/csv', 'movements_export.csv', getExportParams())
            }
          >
            🔄 Export Movements (CSV)
          </button>
          <button
            className="btn-secondary"
            onClick={() =>
              downloadCSV('/reports/activity/csv', 'user_activity_export.csv', getExportParams())
            }
          >
            📋 Export User Activity (CSV)
          </button>
        </div>
      </div>
    </div>
  )
}

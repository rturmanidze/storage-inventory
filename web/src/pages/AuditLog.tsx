import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface AuditEntry {
  id: number
  userId: number | null
  action: string
  resourceType: string | null
  resourceId: string | null
  detail: string | null
  ipAddress: string | null
  createdAt: string
  user: { id: number; username: string; role: string } | null
}

const ACTION_BADGE: Record<string, string> = {
  LOGIN: 'bg-green-100 text-green-700',
  LOGIN_FAILED: 'bg-red-100 text-red-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  CREATE_USER: 'bg-blue-100 text-blue-700',
  UPDATE_USER: 'bg-yellow-100 text-yellow-700',
  DELETE_USER: 'bg-red-100 text-red-700',
  CREATE_UNIT: 'bg-blue-100 text-blue-700',
  UPDATE_UNIT_STATUS: 'bg-yellow-100 text-yellow-700',
  DESTROY_UNIT: 'bg-red-100 text-red-700',
  RECEIVE: 'bg-green-100 text-green-700',
  TRANSFER: 'bg-purple-100 text-purple-700',
  ISSUE: 'bg-amber-100 text-amber-700',
  RETURN: 'bg-teal-100 text-teal-700',
}

function parseDetail(detail: string | null): string {
  if (!detail) return ''
  try {
    return JSON.stringify(JSON.parse(detail), null, 0)
  } catch {
    return detail
  }
}

export default function AuditLogPage() {
  const [action, setAction] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', action, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (action) params.set('action', action)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      params.set('limit', '200')
      const res = await api.get<AuditEntry[]>(`/audit?${params}`)
      return res.data
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <button onClick={() => refetch()} className="btn-secondary btn-sm">
          ↻ Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Action contains</label>
            <input
              className="input"
              placeholder="e.g. LOGIN, DESTROY"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
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
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-center text-gray-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">User</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Resource</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">IP</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      No audit entries found
                    </td>
                  </tr>
                )}
                {(data ?? []).map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-700">
                      {entry.user?.username ?? (entry.userId ? `#${entry.userId}` : '—')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          ACTION_BADGE[entry.action] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {entry.resourceType ? `${entry.resourceType} #${entry.resourceId}` : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">
                      {entry.ipAddress ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {parseDetail(entry.detail)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

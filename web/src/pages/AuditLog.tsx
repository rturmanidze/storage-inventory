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
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">Track all system activity and changes</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary btn-sm">
          <svg className="w-4 h-4 mr-1.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-5">
        <h2 className="section-title mb-3">Filters</h2>
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
                <tr>
                  <th className="table-header">Time</th>
                  <th className="table-header">User</th>
                  <th className="table-header">Action</th>
                  <th className="table-header">Resource</th>
                  <th className="table-header">IP</th>
                  <th className="table-header">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-cell text-center text-gray-400 py-8">
                      No audit entries found
                    </td>
                  </tr>
                )}
                {(data ?? []).map((entry) => (
                  <tr key={entry.id} className="hover:bg-surface-secondary transition-colors">
                    <td className="table-cell whitespace-nowrap text-gray-500">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="table-cell whitespace-nowrap font-medium text-gray-700">
                      {entry.user?.username ?? (entry.userId ? `#${entry.userId}` : '—')}
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      <span
                        className={`badge ${
                          ACTION_BADGE[entry.action] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="table-cell whitespace-nowrap text-gray-500">
                      {entry.resourceType ? `${entry.resourceType} #${entry.resourceId}` : '—'}
                    </td>
                    <td className="table-cell whitespace-nowrap text-gray-400 text-2xs">
                      {entry.ipAddress ?? '—'}
                    </td>
                    <td className="table-cell text-gray-500 text-xs max-w-xs truncate">
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

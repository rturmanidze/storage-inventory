import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Unit {
  id: number
  serial: string
  status: string
  item: { id: number; sku: string; name: string } | null
  currentLocation: { code: string; warehouse: { name: string } | null } | null
}

const statusColors: Record<string, string> = {
  IN_STOCK: 'bg-green-100 text-green-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  QUARANTINED: 'bg-yellow-100 text-yellow-800',
  SCRAPPED: 'bg-gray-100 text-gray-800',
  DAMAGED: 'bg-orange-100 text-orange-800',
  EXPIRED: 'bg-purple-100 text-purple-800',
  DESTROYED: 'bg-red-100 text-red-800',
}

const CHANGEABLE_STATUSES = ['IN_STOCK', 'QUARANTINED', 'DAMAGED', 'EXPIRED']

export default function Units() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [serial, setSerial] = useState(searchParams.get('serial') ?? '')
  const [sku, setSku] = useState('')
  const [results, setResults] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [statusTarget, setStatusTarget] = useState<{ unit: Unit; newStatus: string } | null>(null)
  const [destroyTarget, setDestroyTarget] = useState<Unit | null>(null)
  const [destroyReason, setDestroyReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  useEffect(() => {
    const s = searchParams.get('serial')
    if (s) {
      setSerial(s)
      doSearch(s, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doSearch(serialVal: string, skuVal: string) {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (serialVal.trim()) params.serial = serialVal.trim()
      if (skuVal.trim()) params.sku = skuVal.trim()
      const res = await api.get<Unit[]>('/units', { params })
      setResults(res.data)
      if (res.data.length === 0) toast('No units found', { icon: 'ℹ️' })
    } catch {
      toast.error('Search failed')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params: Record<string, string> = {}
    if (serial.trim()) params.serial = serial.trim()
    if (sku.trim()) params.sku = sku.trim()
    setSearchParams(params)
    doSearch(serial, sku)
  }

  async function confirmStatusChange() {
    if (!statusTarget) return
    setActionLoading(true)
    try {
      await api.patch(`/units/${statusTarget.unit.id}/status`, { status: statusTarget.newStatus })
      toast.success(`Status updated to ${statusTarget.newStatus}`)
      setStatusTarget(null)
      doSearch(serial, sku)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  async function confirmDestroy() {
    if (!destroyTarget || !destroyReason.trim()) return
    setActionLoading(true)
    try {
      await api.post(`/units/${destroyTarget.id}/destroy`, { reason: destroyReason })
      toast.success('Unit marked as destroyed')
      setDestroyTarget(null)
      setDestroyReason('')
      doSearch(serial, sku)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? 'Failed to destroy unit')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Units Search</h1>

      <div className="card p-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="label">Serial Number</label>
            <input
              type="text"
              value={serial}
              onChange={e => setSerial(e.target.value)}
              className="input"
              placeholder="Search by serial…"
              autoFocus
            />
          </div>
          <div className="flex-1">
            <label className="label">SKU (optional)</label>
            <input
              type="text"
              value={sku}
              onChange={e => setSku(e.target.value)}
              className="input"
              placeholder="Filter by item SKU…"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {results.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="table-header">Serial</th>
                  <th className="table-header">Item</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden sm:table-cell">Location</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {results.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-sm">{u.serial}</td>
                    <td className="table-cell">
                      <div className="font-medium">{u.item?.name}</div>
                      <div className="text-xs text-gray-500">{u.item?.sku}</div>
                    </td>
                    <td className="table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          statusColors[u.status] ?? 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="table-cell hidden sm:table-cell text-gray-600">
                      {u.currentLocation
                        ? `${u.currentLocation.warehouse?.name ?? ''} › ${u.currentLocation.code}`
                        : '—'}
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-1">
                        <Link
                          to={`/units/${u.id}/history`}
                          className="btn-secondary btn-sm text-xs"
                        >
                          History
                        </Link>
                        {canManage && CHANGEABLE_STATUSES.includes(u.status) && (
                          <select
                            className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-600 cursor-pointer hover:border-gray-400"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                setStatusTarget({ unit: u, newStatus: e.target.value })
                                e.target.value = ''
                              }
                            }}
                          >
                            <option value="" disabled>Mark as…</option>
                            {['DAMAGED', 'EXPIRED', 'QUARANTINED', 'IN_STOCK']
                              .filter((s) => s !== u.status)
                              .map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                          </select>
                        )}
                        {canManage && u.status !== 'DESTROYED' && (
                          <button
                            className="text-xs text-red-600 hover:text-red-800 font-medium px-1"
                            onClick={() => setDestroyTarget(u)}
                          >
                            Destroy
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status change confirm modal */}
      {statusTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Status Change</h3>
            <p className="text-gray-600 text-sm mb-4">
              Change unit <span className="font-mono font-bold">{statusTarget.unit.serial}</span> to{' '}
              <strong>{statusTarget.newStatus}</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary btn-sm" onClick={() => setStatusTarget(null)}>
                Cancel
              </button>
              <button
                className="btn-primary btn-sm"
                onClick={confirmStatusChange}
                disabled={actionLoading}
              >
                {actionLoading ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destroy confirm modal */}
      {destroyTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-red-700 mb-2">⚠️ Destroy Unit</h3>
            <p className="text-gray-600 text-sm mb-3">
              Permanently destroy unit{' '}
              <span className="font-mono font-bold">{destroyTarget.serial}</span>? This cannot be undone.
            </p>
            <div className="mb-4">
              <label className="label">Reason (required)</label>
              <textarea
                className="input resize-none h-20"
                placeholder="Reason for destruction…"
                value={destroyReason}
                onChange={(e) => setDestroyReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                className="btn-secondary btn-sm"
                onClick={() => { setDestroyTarget(null); setDestroyReason('') }}
              >
                Cancel
              </button>
              <button
                className="bg-red-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                onClick={confirmDestroy}
                disabled={actionLoading || !destroyReason.trim()}
              >
                {actionLoading ? 'Processing…' : 'Destroy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


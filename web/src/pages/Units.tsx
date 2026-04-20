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

const STATUS_BADGE: Record<string, string> = {
  IN_STOCK: 'status-in-stock',
  ISSUED: 'status-issued',
  QUARANTINED: 'status-quarantined',
  SCRAPPED: 'status-scrapped',
  DAMAGED: 'status-damaged',
  EXPIRED: 'status-expired',
  DESTROYED: 'status-destroyed',
}

const CHANGEABLE_STATUSES = ['IN_STOCK', 'QUARANTINED', 'DAMAGED', 'EXPIRED']

export default function Units() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [serial, setSerial] = useState(searchParams.get('serial') ?? '')
  const [sku, setSku] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '')
  const [results, setResults] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [statusTarget, setStatusTarget] = useState<{ unit: Unit; newStatus: string } | null>(null)
  const [destroyTarget, setDestroyTarget] = useState<Unit | null>(null)
  const [destroyReason, setDestroyReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  useEffect(() => {
    const s = searchParams.get('serial')
    const st = searchParams.get('status')
    if (s) setSerial(s)
    if (st) setStatusFilter(st)
    if (s || st) {
      doSearch(s ?? '', '', st ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doSearch(serialVal: string, skuVal: string, statusVal?: string) {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (serialVal.trim()) params.serial = serialVal.trim()
      if (skuVal.trim()) params.sku = skuVal.trim()
      const sv = statusVal !== undefined ? statusVal : statusFilter
      if (sv.trim()) params.status = sv.trim()
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
    if (statusFilter.trim()) params.status = statusFilter.trim()
    setSearchParams(params)
    doSearch(serial, sku, statusFilter)
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
    <div className="space-y-5 max-w-7xl">
      <div>
        <h1 className="page-title">Unit Search</h1>
        <p className="page-subtitle">Search and manage individual serialized units</p>
      </div>

      {/* Search form */}
      <div className="card p-5">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="label">Serial Number</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={serial}
                onChange={e => setSerial(e.target.value)}
                className="input pl-9"
                placeholder="Search by serial…"
                autoFocus
              />
            </div>
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
          <div className="flex-1">
            <label className="label">Status (optional)</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="input"
            >
              <option value="">All statuses</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="DAMAGED">Damaged</option>
              <option value="EXPIRED">Expired</option>
              <option value="DESTROYED">Destroyed</option>
              <option value="QUARANTINED">Quarantined</option>
              <option value="SCRAPPED">Scrapped</option>
              <option value="ISSUED">Issued</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr>
                  <th className="table-header">Serial</th>
                  <th className="table-header">Item</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden sm:table-cell">Location</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {results.map(u => (
                  <tr key={u.id} className="hover:bg-surface-secondary transition-colors">
                    <td className="table-cell font-mono text-xs text-gray-600">{u.serial}</td>
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">{u.item?.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{u.item?.sku}</div>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${STATUS_BADGE[u.status] ?? 'status-scrapped'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="table-cell hidden sm:table-cell text-gray-500 text-sm">
                      {u.currentLocation
                        ? `${u.currentLocation.warehouse?.name ?? ''} › ${u.currentLocation.code}`
                        : '—'}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        <Link
                          to={`/units/${u.id}/history`}
                          className="btn-secondary btn-sm"
                        >
                          History
                        </Link>
                        {canManage && CHANGEABLE_STATUSES.includes(u.status) && (
                          <select
                            className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 cursor-pointer hover:border-gray-300 focus:border-primary-400 focus:ring-1 focus:ring-primary-100 transition-colors"
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
                            className="btn-ghost btn-sm text-red-600 hover:text-red-700 hover:bg-red-50"
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

      {/* Status change modal */}
      {statusTarget && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Status Change</h3>
            <p className="text-sm text-gray-600 mb-5">
              Change unit <code className="font-mono font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">{statusTarget.unit.serial}</code> to{' '}
              <span className={`badge ${STATUS_BADGE[statusTarget.newStatus] ?? 'status-scrapped'}`}>{statusTarget.newStatus}</span>?
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setStatusTarget(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={confirmStatusChange}
                disabled={actionLoading}
              >
                {actionLoading ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destroy modal */}
      {destroyTarget && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 text-red-600 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Destroy Unit</h3>
                <p className="text-xs text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Permanently destroy unit{' '}
              <code className="font-mono font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">{destroyTarget.serial}</code>?
            </p>
            <div className="mb-5">
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
                className="btn-secondary"
                onClick={() => { setDestroyTarget(null); setDestroyReason('') }}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={confirmDestroy}
                disabled={actionLoading || !destroyReason.trim()}
              >
                {actionLoading ? 'Processing…' : 'Destroy Unit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

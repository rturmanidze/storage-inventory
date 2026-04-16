import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface HistoryEvent {
  eventType: string
  timestamp: string
  performedBy: string | null
  detail: string
  movementId: number | null
  fromLocation: string | null
  toLocation: string | null
  issuedTo: string | null
}

interface UnitDetail {
  id: number
  serial: string
  status: string
  item: { sku: string; name: string } | null
  currentLocation: { code: string; warehouse: { name: string } | null } | null
  destructionRecord: {
    reason: string
    destroyedAt: string
    destroyedBy: { username: string } | null
  } | null
}

const EVENT_STYLES: Record<string, { bg: string; icon: string }> = {
  CREATED: { bg: 'bg-green-100 text-green-700', icon: '✅' },
  RECEIVE: { bg: 'bg-green-50 text-green-600', icon: '📥' },
  TRANSFER: { bg: 'bg-blue-50 text-blue-600', icon: '🔄' },
  ISSUE: { bg: 'bg-amber-50 text-amber-700', icon: '↗️' },
  RETURN: { bg: 'bg-teal-50 text-teal-700', icon: '↩️' },
  ADJUST: { bg: 'bg-gray-50 text-gray-600', icon: '✏️' },
  DESTROYED: { bg: 'bg-red-100 text-red-700', icon: '🗑️' },
}

const STATUS_BADGE: Record<string, string> = {
  IN_STOCK: 'bg-green-100 text-green-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  QUARANTINED: 'bg-yellow-100 text-yellow-700',
  SCRAPPED: 'bg-gray-100 text-gray-600',
  DAMAGED: 'bg-orange-100 text-orange-700',
  EXPIRED: 'bg-purple-100 text-purple-700',
  DESTROYED: 'bg-red-100 text-red-700',
}

export default function UnitHistoryPage() {
  const { unitId } = useParams<{ unitId: string }>()

  const { data: unit } = useQuery<UnitDetail>({
    queryKey: ['unit', unitId],
    queryFn: async () => {
      const res = await api.get<UnitDetail>(`/units/${unitId}`)
      return res.data
    },
    enabled: !!unitId,
  })

  const { data: history, isLoading } = useQuery<HistoryEvent[]>({
    queryKey: ['unit-history', unitId],
    queryFn: async () => {
      const res = await api.get<HistoryEvent[]>(`/units/${unitId}/history`)
      return res.data
    },
    enabled: !!unitId,
  })

  if (!unitId) return <p className="text-red-500">Invalid unit ID</p>

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link to="/units" className="text-amber-600 hover:text-amber-800 text-sm">
          ← Unit Search
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">
          Item History — {unit?.serial ?? `Unit #${unitId}`}
        </h1>
      </div>

      {/* Unit summary */}
      {unit && (
        <div className="card mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Serial</p>
              <p className="font-semibold text-gray-900 font-mono">{unit.serial}</p>
            </div>
            <div>
              <p className="text-gray-500">Item</p>
              <p className="font-semibold text-gray-900">
                {unit.item ? `${unit.item.name} (${unit.item.sku})` : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Current Status</p>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  STATUS_BADGE[unit.status] ?? 'bg-gray-100 text-gray-600'
                }`}
              >
                {unit.status}
              </span>
            </div>
            <div>
              <p className="text-gray-500">Location</p>
              <p className="font-semibold text-gray-900">
                {unit.currentLocation
                  ? `${unit.currentLocation.warehouse?.name ?? ''} / ${unit.currentLocation.code}`
                  : '—'}
              </p>
            </div>
          </div>

          {unit.destructionRecord && (
            <div className="mt-4 p-3 bg-red-50 rounded-md border border-red-100">
              <p className="text-sm font-semibold text-red-700 mb-1">⚠️ This unit has been destroyed</p>
              <p className="text-xs text-red-600">
                Destroyed on {new Date(unit.destructionRecord.destroyedAt).toLocaleString()} by{' '}
                {unit.destructionRecord.destroyedBy?.username ?? 'unknown'} — Reason:{' '}
                {unit.destructionRecord.reason}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Lifecycle Timeline</h2>

        {isLoading ? (
          <p className="text-gray-400 text-center py-8">Loading history…</p>
        ) : (history ?? []).length === 0 ? (
          <p className="text-gray-400 text-center py-8">No history found</p>
        ) : (
          <ol className="relative border-l-2 border-gray-200 ml-4 space-y-6">
            {(history ?? []).map((event, i) => {
              const style = EVENT_STYLES[event.eventType] ?? { bg: 'bg-gray-100 text-gray-600', icon: '📌' }
              return (
                <li key={i} className="ml-6">
                  <span
                    className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full text-sm ring-4 ring-white ${style.bg}`}
                  >
                    {style.icon}
                  </span>
                  <div className="bg-gray-50 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${style.bg}`}>
                        {event.eventType}
                      </span>
                      <time className="text-xs text-gray-400">
                        {new Date(event.timestamp).toLocaleString()}
                      </time>
                    </div>
                    <p className="text-sm text-gray-700">{event.detail}</p>
                    {event.performedBy && (
                      <p className="text-xs text-gray-400 mt-1">By: {event.performedBy}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

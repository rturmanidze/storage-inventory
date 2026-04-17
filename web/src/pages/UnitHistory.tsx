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

const EVENT_STYLES: Record<string, { bg: string; dot: string; icon: React.ReactNode }> = {
  CREATED: {
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>,
  },
  RECEIVE: {
    bg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    dot: 'bg-emerald-400',
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M12 3v8.25m0 0-3-3m3 3 3-3" /></svg>,
  },
  TRANSFER: {
    bg: 'bg-blue-50 text-blue-600 border-blue-200',
    dot: 'bg-blue-500',
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>,
  },
  ISSUE: {
    bg: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>,
  },
  RETURN: {
    bg: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>,
  },
  ADJUST: {
    bg: 'bg-gray-50 text-gray-600 border-gray-200',
    dot: 'bg-gray-400',
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>,
  },
  DESTROYED: {
    bg: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
    icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>,
  },
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

const defaultStyle = {
  bg: 'bg-gray-50 text-gray-600 border-gray-200',
  dot: 'bg-gray-400',
  icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3" /></svg>,
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
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link to="/units" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
          ← Unit Search
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="font-bold text-gray-900">
          Item History — {unit?.serial ?? `Unit #${unitId}`}
        </h1>
      </div>

      {/* Unit summary card */}
      {unit && (
        <div className="card p-6 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <div>
              <p className="section-title mb-1">Serial</p>
              <p className="font-semibold text-gray-900 font-mono text-sm">{unit.serial}</p>
            </div>
            <div>
              <p className="section-title mb-1">Item</p>
              <p className="font-semibold text-gray-900 text-sm">
                {unit.item ? `${unit.item.name} (${unit.item.sku})` : '—'}
              </p>
            </div>
            <div>
              <p className="section-title mb-1">Status</p>
              <span className={`badge ${STATUS_BADGE[unit.status] ?? 'status-scrapped'}`}>
                {unit.status}
              </span>
            </div>
            <div>
              <p className="section-title mb-1">Location</p>
              <p className="font-semibold text-gray-900 text-sm">
                {unit.currentLocation
                  ? `${unit.currentLocation.warehouse?.name ?? ''} / ${unit.currentLocation.code}`
                  : '—'}
              </p>
            </div>
          </div>

          {unit.destructionRecord && (
            <div className="mt-5 p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 text-red-600 shrink-0 mt-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-red-700 mb-0.5">This unit has been destroyed</p>
                <p className="text-xs text-red-600">
                  On {new Date(unit.destructionRecord.destroyedAt).toLocaleString()} by{' '}
                  {unit.destructionRecord.destroyedBy?.username ?? 'unknown'} — {unit.destructionRecord.reason}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-5 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          Lifecycle Timeline
        </h2>

        {isLoading ? (
          <p className="text-gray-400 text-center py-8 text-sm">Loading history…</p>
        ) : (history ?? []).length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-sm text-gray-400">No history found</p>
          </div>
        ) : (
          <ol className="relative border-l-2 border-gray-100 ml-3 space-y-5">
            {(history ?? []).map((event, i) => {
              const style = EVENT_STYLES[event.eventType] ?? defaultStyle
              return (
                <li key={i} className="ml-6 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                  <span
                    className={`absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full ${style.dot} ring-4 ring-white`}
                  >
                    <span className="text-white">{style.icon}</span>
                  </span>
                  <div className={`rounded-xl px-4 py-3 border ${style.bg}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                      <span className="text-xs font-bold">
                        {event.eventType}
                      </span>
                      <time className="text-2xs text-gray-400">
                        {new Date(event.timestamp).toLocaleString()}
                      </time>
                    </div>
                    <p className="text-sm text-gray-700">{event.detail}</p>
                    {event.performedBy && (
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                        </svg>
                        {event.performedBy}
                      </p>
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

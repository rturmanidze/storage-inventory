import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContainerEvent {
  id: number
  containerId: number
  eventType: 'CREATED' | 'LOCKED' | 'UNLOCKED' | 'DECK_CONSUMED' | 'ARCHIVED'
  decksConsumed: number | null
  shoeId: number | null
  note: string | null
  createdAt: string
  user: { id: number; username: string } | null
}

interface ContainerInfo {
  id: number
  code: string
  color: 'BLACK' | 'RED'
  material: 'PLASTIC' | 'PAPER'
  decksRemaining: number
  isLocked: boolean
  createdAt: string
  lockedAt: string | null
  unlockedAt: string | null
  archivedAt: string | null
  createdBy: { id: number; username: string } | null
  events: ContainerEvent[]
}

const CAPACITY = 200

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function pct(remaining: number) {
  return Math.round((remaining / CAPACITY) * 100)
}

function ColorBadge({ color }: { color: 'BLACK' | 'RED' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      color === 'BLACK' ? 'bg-gray-800 text-white' : 'bg-red-100 text-red-700'
    }`}>
      <span className={`w-2 h-2 rounded-full ${color === 'BLACK' ? 'bg-gray-300' : 'bg-red-500'}`} />
      {color === 'BLACK' ? 'Black' : 'Red'}
    </span>
  )
}

function MaterialBadge({ material }: { material: 'PLASTIC' | 'PAPER' }) {
  return (
    <span className={`badge text-xs ${material === 'PLASTIC' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
      {material === 'PLASTIC' ? '🧪 Plastic' : '📄 Paper'}
    </span>
  )
}

function StatusBadge({ c }: { c: ContainerInfo }) {
  if (c.archivedAt) return <span className="badge bg-gray-100 text-gray-500">Archived</span>
  if (c.isLocked)   return <span className="badge bg-blue-100 text-blue-700">🔒 Locked</span>
  return <span className="badge bg-emerald-100 text-emerald-700">✓ Active</span>
}

function EventTypeBadge({ type }: { type: ContainerEvent['eventType'] }) {
  const map: Record<ContainerEvent['eventType'], string> = {
    CREATED:       'bg-indigo-100 text-indigo-700',
    LOCKED:        'bg-blue-100 text-blue-700',
    UNLOCKED:      'bg-emerald-100 text-emerald-700',
    DECK_CONSUMED: 'bg-amber-100 text-amber-700',
    ARCHIVED:      'bg-gray-100 text-gray-500',
  }
  return <span className={`badge text-xs ${map[type]}`}>{type.replace('_', ' ')}</span>
}

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  code: z.string().min(1, 'Code is required').max(64),
  color: z.enum(['BLACK', 'RED']),
  material: z.enum(['PLASTIC', 'PAPER']),
})

type ContainerForm = z.infer<typeof schema>

// ── Component ─────────────────────────────────────────────────────────────────

export default function Containers() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const isAdmin = user?.role === 'ADMIN'

  const [createOpen, setCreateOpen] = useState(false)
  const [detailContainer, setDetailContainer] = useState<ContainerInfo | null>(null)
  const [renameContainer, setRenameContainer] = useState<ContainerInfo | null>(null)
  const [renameCode, setRenameCode] = useState('')
  const [colorFilter, setColorFilter] = useState<'ALL' | 'BLACK' | 'RED'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LOCKED' | 'ARCHIVED'>('ALL')

  // ── Data fetching ──────────────────────────────────────────────────────────

  const archivedParam =
    statusFilter === 'ARCHIVED' ? true :
    statusFilter === 'ALL' ? undefined : false

  const lockedParam =
    statusFilter === 'LOCKED' ? true : undefined

  const { data: containers = [], isLoading } = useQuery<ContainerInfo[]>({
    queryKey: ['containers', colorFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (colorFilter !== 'ALL') params.set('color', colorFilter)
      if (archivedParam !== undefined) params.set('archived', String(archivedParam))
      if (lockedParam !== undefined) params.set('locked', String(lockedParam))
      return api.get(`/containers?${params}`).then(r => r.data)
    },
    refetchInterval: 15_000,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<ContainerForm>({
    resolver: zodResolver(schema),
    defaultValues: { color: 'RED', material: 'PLASTIC' },
  })

  const createMutation = useMutation({
    mutationFn: (data: ContainerForm) => api.post('/containers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers'] })
      qc.invalidateQueries({ queryKey: ['deck-entries'] })
      qc.invalidateQueries({ queryKey: ['card-inventory'] })
      toast.success('Container created')
      setCreateOpen(false)
      reset()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to create container'),
  })

  const lockMutation = useMutation({
    mutationFn: (id: number) => api.post(`/containers/${id}/lock`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['containers'] })
      toast.success('Container locked')
      // refresh detail if open
      if (detailContainer?.id === id) {
        api.get(`/containers/${id}`).then(r => setDetailContainer(r.data))
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Lock failed'),
  })

  const unlockMutation = useMutation({
    mutationFn: (id: number) => api.post(`/containers/${id}/unlock`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['containers'] })
      toast.success('Container unlocked')
      if (detailContainer?.id === id) {
        api.get(`/containers/${id}`).then(r => setDetailContainer(r.data))
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Unlock failed'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, code }: { id: number; code: string }) =>
      api.patch(`/containers/${id}/rename`, { code }),
    onSuccess: (res, { id }) => {
      qc.invalidateQueries({ queryKey: ['containers'] })
      toast.success('Container renamed')
      setRenameContainer(null)
      setRenameCode('')
      if (detailContainer?.id === id) {
        api.get(`/containers/${id}`).then(r => setDetailContainer(r.data))
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Rename failed'),
  })

  function openDetail(c: ContainerInfo) {
    // Fetch fresh detail with events
    api.get(`/containers/${c.id}`).then(r => setDetailContainer(r.data))
  }

  // ── Summary stats ──────────────────────────────────────────────────────────

  const allActive = containers.filter(c => !c.archivedAt)
  const totalRemaining = allActive.reduce((s, c) => s + c.decksRemaining, 0)
  const activeCount = allActive.filter(c => !c.isLocked).length
  const lockedCount = allActive.filter(c => c.isLocked).length
  const archivedCount = containers.filter(c => c.archivedAt).length

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Containers</h1>
          <p className="page-subtitle">
            FIFO deck container management — each container holds {CAPACITY} decks
          </p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => { reset(); setCreateOpen(true) }}>
            + New Container
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Active</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{activeCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">containers</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-blue-500 uppercase font-semibold tracking-wide">Locked</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{lockedCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">in use</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Archived</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{archivedCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">depleted</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-indigo-500 uppercase font-semibold tracking-wide">Decks Available</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalRemaining}</p>
          <p className="text-xs text-gray-400 mt-0.5">across active containers</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 font-medium">Color:</span>
        {(['ALL', 'BLACK', 'RED'] as const).map(c => (
          <button
            key={c}
            onClick={() => setColorFilter(c)}
            className={`btn-sm ${colorFilter === c ? 'btn-primary' : 'btn-ghost'}`}
          >
            {c}
          </button>
        ))}
        <span className="ml-4 text-xs text-gray-500 font-medium">Status:</span>
        {(['ALL', 'ACTIVE', 'LOCKED', 'ARCHIVED'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Container list */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : containers.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No containers found.
            {canManage && (
              <div className="mt-3">
                <button className="btn-primary btn-sm" onClick={() => { reset(); setCreateOpen(true) }}>
                  Create First Container
                </button>
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Material</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Remaining</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {containers.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => openDetail(c)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{c.code}</td>
                  <td className="px-4 py-3"><ColorBadge color={c.color} /></td>
                  <td className="px-4 py-3"><MaterialBadge material={c.material} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            c.archivedAt ? 'bg-gray-400' : pct(c.decksRemaining) > 50 ? 'bg-emerald-500' : pct(c.decksRemaining) > 20 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${pct(c.decksRemaining)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-700 whitespace-nowrap">
                        {c.decksRemaining}/{CAPACITY}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge c={c} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      {canManage && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => { setRenameContainer(c); setRenameCode(c.code) }}
                        >
                          ✏️ Rename
                        </button>
                      )}
                      {isAdmin && !c.archivedAt && !c.isLocked && (
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => lockMutation.mutate(c.id)}
                          disabled={lockMutation.isPending}
                        >
                          Lock
                        </button>
                      )}
                      {isAdmin && !c.archivedAt && c.isLocked && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => unlockMutation.mutate(c.id)}
                          disabled={unlockMutation.isPending}
                        >
                          Unlock
                        </button>
                      )}
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => openDetail(c)}
                      >
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Container Modal */}
      {createOpen && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) { setCreateOpen(false); reset() } }}
        >
          <div className="modal-content w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">New Container</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setCreateOpen(false); reset() }}>✕</button>
            </div>
            <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Container Code</label>
                <input
                  {...register('code')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                  placeholder="e.g. CONTAINER-R01"
                />
                {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Card Color</label>
                <div className="flex gap-3">
                  {(['BLACK', 'RED'] as const).map(c => (
                    <label key={c} className="flex-1 cursor-pointer">
                      <input type="radio" {...register('color')} value={c} className="sr-only" />
                      <div className={`px-4 py-3 rounded-lg border-2 text-center text-sm font-medium transition-all ${
                        watch('color') === c
                          ? c === 'BLACK' ? 'border-gray-800 bg-gray-800 text-white' : 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                        {c === 'BLACK' ? '⬛ Black' : '🔴 Red'}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Card Material</label>
                <div className="flex gap-3">
                  {(['PLASTIC', 'PAPER'] as const).map(m => (
                    <label key={m} className="flex-1 cursor-pointer">
                      <input type="radio" {...register('material')} value={m} className="sr-only" />
                      <div className={`px-4 py-3 rounded-lg border-2 text-center text-sm font-medium transition-all ${
                        watch('material') === m
                          ? m === 'PLASTIC' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                        {m === 'PLASTIC' ? '🧪 Plastic' : '📄 Paper'}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                <strong>Capacity:</strong> {CAPACITY} decks &nbsp;·&nbsp;
                <strong>Cards:</strong> {(CAPACITY * 52).toLocaleString()} cards total
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" className="btn-ghost flex-1" onClick={() => { setCreateOpen(false); reset() }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isSubmitting || createMutation.isPending}>
                  Create Container
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Container Detail / History Modal */}
      {detailContainer && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setDetailContainer(null) }}
        >
          <div className="modal-content w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 font-mono">{detailContainer.code}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <ColorBadge color={detailContainer.color} />
                  <MaterialBadge material={detailContainer.material} />
                  <StatusBadge c={detailContainer} />
                </div>
              </div>
              <button className="btn-ghost btn-sm" onClick={() => setDetailContainer(null)}>✕</button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4 shrink-0">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 font-medium">Remaining</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{detailContainer.decksRemaining}</p>
                <p className="text-xs text-gray-400">/ {CAPACITY} decks</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 font-medium">Consumed</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{CAPACITY - detailContainer.decksRemaining}</p>
                <p className="text-xs text-gray-400">decks used</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 font-medium">Shoes Filled</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">
                  {detailContainer.events.filter(e => e.eventType === 'DECK_CONSUMED').length}
                </p>
                <p className="text-xs text-gray-400">from this container</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4 shrink-0">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Deck usage</span>
                <span>{pct(detailContainer.decksRemaining)}% remaining</span>
              </div>
              <div className="bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    detailContainer.archivedAt ? 'bg-gray-400' :
                    pct(detailContainer.decksRemaining) > 50 ? 'bg-emerald-500' :
                    pct(detailContainer.decksRemaining) > 20 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${pct(detailContainer.decksRemaining)}%` }}
                />
              </div>
            </div>

            {/* Admin actions */}
            {isAdmin && !detailContainer.archivedAt && (
              <div className="flex gap-2 mb-4 shrink-0">
                {!detailContainer.isLocked ? (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => lockMutation.mutate(detailContainer.id)}
                    disabled={lockMutation.isPending}
                  >
                    🔒 Lock Container
                  </button>
                ) : (
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => unlockMutation.mutate(detailContainer.id)}
                    disabled={unlockMutation.isPending}
                  >
                    🔓 Unlock Container
                  </button>
                )}
              </div>
            )}
            {canManage && (
              <div className="flex gap-2 mb-4 shrink-0">
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => { setRenameContainer(detailContainer); setRenameCode(detailContainer.code) }}
                >
                  ✏️ Rename Container
                </button>
              </div>
            )}

            {/* Event history */}
            <div className="flex-1 overflow-y-auto">
              <h3 className="section-title mb-3">Event History</h3>
              {detailContainer.events.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No events recorded</p>
              ) : (
                <div className="space-y-2">
                  {[...detailContainer.events].reverse().map(evt => (
                    <div key={evt.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 text-sm">
                      <EventTypeBadge type={evt.eventType} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500">{formatDate(evt.createdAt)}</span>
                          {evt.user && <span className="text-xs text-gray-500">{evt.user.username}</span>}
                        </div>
                        {evt.note && <p className="text-xs text-gray-600 mt-0.5 truncate">{evt.note}</p>}
                        {evt.decksConsumed != null && (
                          <p className="text-xs text-gray-700 mt-0.5">
                            -{evt.decksConsumed} decks
                            {evt.shoeId ? ` · Shoe #${evt.shoeId}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Metadata footer */}
            <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400 shrink-0 flex gap-4 flex-wrap">
              <span>Created: {formatDate(detailContainer.createdAt)}</span>
              {detailContainer.lockedAt && <span>Locked: {formatDate(detailContainer.lockedAt)}</span>}
              {detailContainer.archivedAt && <span>Archived: {formatDate(detailContainer.archivedAt)}</span>}
              {detailContainer.createdBy && <span>By: {detailContainer.createdBy.username}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Rename Container Modal */}
      {renameContainer && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) { setRenameContainer(null); setRenameCode('') } }}
        >
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Rename Container</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setRenameContainer(null); setRenameCode('') }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
                Current name: <span className="font-mono font-semibold text-gray-700">{renameContainer.code}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Name</label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                  placeholder="e.g. BLACK-PLASTIC-01"
                  value={renameCode}
                  onChange={e => setRenameCode(e.target.value)}
                  maxLength={64}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Renaming does not affect internal ID or history.</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  className="btn-ghost flex-1"
                  onClick={() => { setRenameContainer(null); setRenameCode('') }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary flex-1"
                  disabled={!renameCode.trim() || renameCode.trim() === renameContainer.code || renameMutation.isPending}
                  onClick={() => renameMutation.mutate({ id: renameContainer.id, code: renameCode.trim() })}
                >
                  {renameMutation.isPending ? 'Saving…' : 'Save Name'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

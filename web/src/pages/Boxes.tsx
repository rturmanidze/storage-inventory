import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardColor = 'BLACK' | 'RED'
type CardMaterial = 'PLASTIC' | 'PAPER'
type BoxType = 'STANDARD' | 'SPARE'
type DeckNumber = 'DECK1' | 'DECK2' | 'DECK3' | 'DECK4' | 'DECK5' | 'DECK6' | 'DECK7' | 'DECK8'

interface BoxInfo {
  id: number
  color: CardColor
  material: CardMaterial
  boxType: BoxType
  spareDeckNumber: DeckNumber | null
  containerId: number | null
  isConsumed: boolean
  consumedAt: string | null
  consumedByShoeId: number | null
  createdAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DECK_NUMBERS: DeckNumber[] = ['DECK1', 'DECK2', 'DECK3', 'DECK4', 'DECK5', 'DECK6', 'DECK7', 'DECK8']

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function ColorBadge({ color }: { color: CardColor }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      color === 'BLACK' ? 'bg-gray-800 text-white' : 'bg-red-100 text-red-700'
    }`}>
      <span className={`w-2 h-2 rounded-full ${color === 'BLACK' ? 'bg-gray-300' : 'bg-red-500'}`} />
      {color === 'BLACK' ? 'Black' : 'Red'}
    </span>
  )
}

function MaterialBadge({ material }: { material: CardMaterial }) {
  return (
    <span className={`badge text-xs ${material === 'PLASTIC' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
      {material === 'PLASTIC' ? '🧪 Plastic' : '📄 Paper'}
    </span>
  )
}

function BoxTypeBadge({ type, spare }: { type: BoxType; spare: DeckNumber | null }) {
  if (type === 'SPARE') {
    return (
      <span className="badge bg-orange-100 text-orange-700 text-xs">
        🎴 Spare ({spare ?? '?'})
      </span>
    )
  }
  return <span className="badge bg-emerald-100 text-emerald-700 text-xs">📦 Standard</span>
}

function StatusBadge({ box }: { box: BoxInfo }) {
  if (box.isConsumed) return <span className="badge bg-gray-100 text-gray-500 text-xs">Used (shoe #{box.consumedByShoeId})</span>
  return <span className="badge bg-green-100 text-green-700 text-xs">Available</span>
}

// ── Schema ────────────────────────────────────────────────────────────────────

const spareSchema = z.object({
  color: z.enum(['BLACK', 'RED']),
  material: z.enum(['PLASTIC', 'PAPER']),
  spareDeckNumber: z.enum(['DECK1', 'DECK2', 'DECK3', 'DECK4', 'DECK5', 'DECK6', 'DECK7', 'DECK8']),
  note: z.string().optional(),
})

type SpareForm = z.infer<typeof spareSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export default function Boxes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const canCreateSpare = ['ADMIN', 'MANAGER', 'OPERATIONS_MANAGER'].includes(user?.role ?? '')

  const [tab, setTab] = useState<'standard' | 'spare'>('standard')
  const [createSpareOpen, setCreateSpareOpen] = useState(false)
  const [colorFilter, setColorFilter] = useState<'ALL' | CardColor>('ALL')
  const [consumedFilter, setConsumedFilter] = useState<'ALL' | 'available' | 'used'>('available')

  // ── Data fetching ──────────────────────────────────────────────────────────

  const standardParams = new URLSearchParams({ boxType: 'STANDARD' })
  if (colorFilter !== 'ALL') standardParams.set('color', colorFilter)
  if (consumedFilter === 'available') standardParams.set('isConsumed', 'false')
  if (consumedFilter === 'used') standardParams.set('isConsumed', 'true')

  const spareParams = new URLSearchParams({ boxType: 'SPARE' })
  if (colorFilter !== 'ALL') spareParams.set('color', colorFilter)

  const { data: standardBoxes = [], isLoading: stdLoading } = useQuery<BoxInfo[]>({
    queryKey: ['boxes', 'standard', colorFilter, consumedFilter],
    queryFn: () => api.get(`/boxes?${standardParams}`).then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: spareBoxes = [], isLoading: spareLoading } = useQuery<BoxInfo[]>({
    queryKey: ['boxes', 'spare', colorFilter],
    queryFn: () => api.get(`/boxes/spare?${spareParams}`).then(r => r.data),
    refetchInterval: 30_000,
  })

  // ── Form ───────────────────────────────────────────────────────────────────

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<SpareForm>({
    resolver: zodResolver(spareSchema),
    defaultValues: { color: 'RED', material: 'PLASTIC', spareDeckNumber: 'DECK1' },
  })

  const createSpareMutation = useMutation({
    mutationFn: (data: SpareForm) => api.post('/boxes/spare', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boxes'] })
      toast.success('Spare box created')
      setCreateSpareOpen(false)
      reset()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to create spare box'),
  })

  // ── Stats ──────────────────────────────────────────────────────────────────

  const availableStd = standardBoxes.filter(b => !b.isConsumed).length
  const usedStd = standardBoxes.filter(b => b.isConsumed).length

  const boxes = tab === 'standard' ? standardBoxes : spareBoxes
  const isLoading = tab === 'standard' ? stdLoading : spareLoading

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Boxes</h1>
          <p className="page-subtitle">
            Box packaging layer — 1 box = 8 decks (Deck1–Deck8) · Standard boxes go into containers · Spare boxes stored separately
          </p>
        </div>
        {canCreateSpare && (
          <button className="btn-primary" onClick={() => setCreateSpareOpen(true)}>
            + New Spare Box
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-xs text-emerald-600 uppercase font-semibold tracking-wide">Available Std</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{availableStd}</p>
          <p className="text-xs text-gray-400 mt-0.5">standard boxes</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Used Std</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{usedStd}</p>
          <p className="text-xs text-gray-400 mt-0.5">consumed by shoes</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-orange-500 uppercase font-semibold tracking-wide">Spare Boxes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{spareBoxes.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">single-type boxes</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-indigo-500 uppercase font-semibold tracking-wide">Decks in Std Boxes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{availableStd * 8}</p>
          <p className="text-xs text-gray-400 mt-0.5">available decks</p>
        </div>
      </div>

      {/* Hierarchy info */}
      <div className="card p-4 bg-indigo-50 border border-indigo-100">
        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">📦 Box Contents</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-indigo-600 mb-1">Standard Box</p>
            <div className="flex flex-wrap gap-1">
              {DECK_NUMBERS.map(d => (
                <span key={d} className="bg-white border border-indigo-200 rounded px-1.5 py-0.5 text-2xs font-mono text-indigo-800">{d}</span>
              ))}
            </div>
            <p className="text-2xs text-indigo-500 mt-1">1 deck of each type = 8 decks total</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-orange-600 mb-1">Spare Box</p>
            <div className="flex flex-wrap gap-1">
              <span className="bg-white border border-orange-200 rounded px-1.5 py-0.5 text-2xs font-mono text-orange-800">DECK7 × 8</span>
            </div>
            <p className="text-2xs text-orange-500 mt-1">8 decks of a single type · not used for shoes</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'standard' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('standard')}
        >
          Standard Boxes ({standardBoxes.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'spare' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('spare')}
        >
          Spare Boxes ({spareBoxes.length})
        </button>
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
        {tab === 'standard' && (
          <>
            <span className="ml-4 text-xs text-gray-500 font-medium">Status:</span>
            {(['ALL', 'available', 'used'] as const).map(s => (
              <button
                key={s}
                onClick={() => setConsumedFilter(s)}
                className={`btn-sm ${consumedFilter === s ? 'btn-primary' : 'btn-ghost'}`}
              >
                {s === 'ALL' ? 'All' : s === 'available' ? '✓ Available' : '✗ Used'}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Box list */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : boxes.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No {tab} boxes found.
            {tab === 'spare' && canCreateSpare && (
              <div className="mt-3">
                <button className="btn-primary btn-sm" onClick={() => setCreateSpareOpen(true)}>
                  Create First Spare Box
                </button>
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Material</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Container</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {boxes.map(b => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">#{b.id}</td>
                  <td className="px-4 py-3"><ColorBadge color={b.color} /></td>
                  <td className="px-4 py-3"><MaterialBadge material={b.material} /></td>
                  <td className="px-4 py-3"><BoxTypeBadge type={b.boxType} spare={b.spareDeckNumber} /></td>
                  <td className="px-4 py-3"><StatusBadge box={b} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {b.containerId ? `Container #${b.containerId}` : <span className="text-orange-500">Spare storage</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Spare Box Modal */}
      {createSpareOpen && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) { setCreateSpareOpen(false); reset() } }}
        >
          <div className="modal-content w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">New Spare Box</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setCreateSpareOpen(false); reset() }}>✕</button>
            </div>
            <form onSubmit={handleSubmit(d => createSpareMutation.mutate(d))} className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-700">
                <strong>Spare Box:</strong> Contains 8 decks of a single deck number. Stored separately and not used for shoe creation.
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deck Number</label>
                <select {...register('spareDeckNumber')} className="input">
                  {DECK_NUMBERS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {errors.spareDeckNumber && <p className="text-xs text-red-500 mt-1">{errors.spareDeckNumber.message}</p>}
                <p className="text-2xs text-gray-400 mt-1">This box will contain 8 decks of this deck number only.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" className="btn-ghost flex-1" onClick={() => { setCreateSpareOpen(false); reset() }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isSubmitting || createSpareMutation.isPending}>
                  Create Spare Box
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

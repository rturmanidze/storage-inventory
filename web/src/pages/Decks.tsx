import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface DeckEntry {
  id: number
  color: 'BLACK' | 'RED'
  material: 'PLASTIC' | 'PAPER' | null
  deckCount: number
  cardCount: number
  note: string | null
  createdAt: string
  createdBy: { id: number; username: string } | null
}

interface AddDecksResponse {
  entries: DeckEntry[]
  containersCreated: number
  totalDecks: number
  color: 'BLACK' | 'RED'
  material: 'PLASTIC' | 'PAPER'
}

interface CardInventory {
  blackDecks: number
  redDecks: number
  blackCards: number
  redCards: number
  totalDecks: number
  totalCards: number
  plasticDecks: number
  paperDecks: number
  shoesInWarehouse: number
  shoesSentToStudio: number
  totalShoes: number
  totalStockDecks: number
  totalStockCards: number
  lockedDecks: number
}

interface DeckColorStatus {
  available: number
  threshold: number
  isLow: boolean
  cards: number
}

interface DeckLowStockResponse {
  black: DeckColorStatus
  red: DeckColorStatus
  hasAlerts: boolean
  alertCount: number
}

const schema = z.object({
  color: z.enum(['BLACK', 'RED']),
  material: z.enum(['PLASTIC', 'PAPER']),
  deckCount: z.coerce.number().int().min(1, 'Must add at least 1 deck'),
  note: z.string().optional(),
})

type DeckForm = z.infer<typeof schema>

function ColorBadge({ color }: { color: 'BLACK' | 'RED' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      color === 'BLACK' ? 'bg-gray-800 text-white' : 'bg-red-100 text-red-700'
    }`}>
      <span className={`w-2 h-2 rounded-full inline-block ${color === 'BLACK' ? 'bg-gray-300' : 'bg-red-500'}`} />
      {color === 'BLACK' ? 'Black' : 'Red'}
    </span>
  )
}

function MaterialBadge({ material }: { material: 'PLASTIC' | 'PAPER' | null }) {
  if (!material) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      material === 'PLASTIC' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {material === 'PLASTIC' ? '🔷 Plastic' : '📄 Paper'}
    </span>
  )
}

export default function Decks() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const canAdd = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const [searchParams] = useSearchParams()
  const colorParam = searchParams.get('color') as 'BLACK' | 'RED' | null
  const lowStockParam = searchParams.get('lowStock') === 'true'

  const { data: inventory } = useQuery<CardInventory>({
    queryKey: ['card-inventory'],
    queryFn: () => api.get('/cards/inventory').then(r => r.data),
    refetchInterval: 15_000,
  })

  const { data: lowStockData } = useQuery<DeckLowStockResponse>({
    queryKey: ['deck-low-stock'],
    queryFn: () => api.get('/deck-inventory/low-stock').then(r => r.data),
    refetchInterval: 15_000,
  })

  const { data: allEntries = [], isLoading } = useQuery<DeckEntry[]>({
    queryKey: ['deck-entries'],
    queryFn: () => api.get('/cards/decks').then(r => r.data),
  })

  // Apply client-side filters based on URL params
  const entries = (() => {
    let list = allEntries
    if (colorParam) list = list.filter(e => e.color === colorParam)
    if (lowStockParam && lowStockData) {
      const lowColors = new Set<string>()
      if (lowStockData.black.isLow) lowColors.add('BLACK')
      if (lowStockData.red.isLow) lowColors.add('RED')
      list = list.filter(e => lowColors.has(e.color))
    }
    return list
  })()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DeckForm>({
    resolver: zodResolver(schema),
    defaultValues: { color: colorParam ?? 'BLACK', material: 'PLASTIC', deckCount: 1 },
  })

  // Sync form default color when URL param changes
  useEffect(() => {
    if (colorParam) reset({ color: colorParam, material: 'PLASTIC', deckCount: 1 })
  }, [colorParam, reset])

  const deckCount = watch('deckCount') || 0
  const containersNeeded = deckCount > 0 ? Math.ceil(deckCount / 200) : 0

  const addMutation = useMutation({
    mutationFn: (data: DeckForm) => api.post('/deck-inventory', data).then(r => r.data as AddDecksResponse),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['deck-entries'] })
      qc.invalidateQueries({ queryKey: ['card-inventory'] })
      qc.invalidateQueries({ queryKey: ['deck-low-stock'] })
      qc.invalidateQueries({ queryKey: ['dashboard-card-stats'] })
      const msg = data.containersCreated === 1
        ? `${data.totalDecks} decks added (1 container created)`
        : `${data.totalDecks} decks added (${data.containersCreated} containers created)`
      toast.success(msg)
      setModalOpen(false)
      reset()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to add decks'),
  })

  const isBlackLow = lowStockData?.black.isLow
  const isRedLow = lowStockData?.red.isLow

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Deck Inventory</h1>
          <p className="page-subtitle">
            {lowStockParam ? 'Showing low-stock colors only' : colorParam ? `Filtered by ${colorParam} decks` : 'Track card decks received into the warehouse'}
          </p>
        </div>
        {canAdd && (
          <button className="btn-primary" onClick={() => { reset({ color: colorParam ?? 'BLACK', material: 'PLASTIC', deckCount: 1 }); setModalOpen(true) }}>
            + Add Decks
          </button>
        )}
      </div>

      {/* Low stock warning banner */}
      {(isBlackLow || isRedLow) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-0.5">Low Stock Alert</p>
            <p>
              {[
                isBlackLow && `Black decks (${lowStockData?.black.available} available, threshold: ${lowStockData?.black.threshold})`,
                isRedLow && `Red decks (${lowStockData?.red.available} available, threshold: ${lowStockData?.red.threshold})`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {inventory && (
        <div className="space-y-3">
          {/* Total Stock vs Available callout — shown when decks are locked */}
          {inventory.lockedDecks > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-0.5">Some containers are locked</p>
                <p>
                  <span className="font-medium">{inventory.lockedDecks} decks</span> are in locked containers and not available for use.
                  Total physical stock: <span className="font-medium">{inventory.totalStockDecks} decks</span>.
                  Unlock containers to make them available.
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className={`card p-4 text-center ${isBlackLow ? 'ring-2 ring-amber-400' : ''}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Black Decks</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.blackDecks}</p>
              <p className="text-xs text-gray-400 mt-0.5">{inventory.blackCards.toLocaleString()} cards</p>
              {isBlackLow && <p className="text-xs text-amber-600 font-semibold mt-1">⚠ Low stock</p>}
            </div>
            <div className={`card p-4 text-center ${isRedLow ? 'ring-2 ring-amber-400' : ''}`}>
              <p className="text-xs text-red-500 uppercase tracking-wide font-semibold">Red Decks</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.redDecks}</p>
              <p className="text-xs text-gray-400 mt-0.5">{inventory.redCards.toLocaleString()} cards</p>
              {isRedLow && <p className="text-xs text-amber-600 font-semibold mt-1">⚠ Low stock</p>}
            </div>
            <div className="card p-4 text-center">
              <p className="text-xs text-blue-500 uppercase tracking-wide font-semibold">Plastic</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.plasticDecks ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">decks</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-xs text-amber-500 uppercase tracking-wide font-semibold">Paper</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.paperDecks ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">decks</p>
            </div>
            <div className="card p-4 text-center" title="Decks available for use (from unlocked containers only)">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Available for Use</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.totalDecks}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {inventory.totalDecks >= 8 ? `${Math.floor(inventory.totalDecks / 8)} shoes possible` : 'Need 8 decks/shoe'}
              </p>
            </div>
            <div className="card p-4 text-center" title="Total physical stock in ALL containers (including locked)">
              <p className="text-xs text-emerald-600 uppercase tracking-wide font-semibold">Total Stock</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.totalStockDecks}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {inventory.lockedDecks > 0 ? `${inventory.lockedDecks} locked` : 'all unlocked'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Entries table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            Deck Receiving History
            {(colorParam || lowStockParam) && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({entries.length} of {allEntries.length} entries)
              </span>
            )}
          </h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            {lowStockParam ? 'No entries for low-stock colors' : 'No deck entries yet'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Material</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Decks</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cards</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Note</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Added By</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-400 text-xs">{entry.id}</td>
                  <td className="px-5 py-3"><ColorBadge color={entry.color} /></td>
                  <td className="px-5 py-3"><MaterialBadge material={entry.material} /></td>
                  <td className="px-5 py-3 font-medium text-gray-800">+{entry.deckCount}</td>
                  <td className="px-5 py-3 text-gray-600">+{entry.cardCount.toLocaleString()}</td>
                  <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{entry.note ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{entry.createdBy?.username ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Decks Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setModalOpen(false); reset() } }}>
          <div className="modal-content w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Add Decks to Inventory</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setModalOpen(false); reset() }}>✕</button>
            </div>
            <form onSubmit={handleSubmit(d => addMutation.mutate(d))} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Card Color</label>
                <div className="flex gap-3">
                  {(['BLACK', 'RED'] as const).map(c => (
                    <label key={c} className="flex items-center gap-2 cursor-pointer flex-1">
                      <input type="radio" {...register('color')} value={c} className="sr-only" />
                      <div className={`flex-1 px-4 py-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                        watch('color') === c
                          ? c === 'BLACK' ? 'border-gray-800 bg-gray-800 text-white' : 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      onClick={() => reset({ ...watch(), color: c })}>
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
                    <label key={m} className="flex items-center gap-2 cursor-pointer flex-1">
                      <input type="radio" {...register('material')} value={m} className="sr-only" />
                      <div className={`flex-1 px-4 py-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                        watch('material') === m
                          ? m === 'PLASTIC' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      onClick={() => reset({ ...watch(), material: m })}>
                        {m === 'PLASTIC' ? '🔷 Plastic Cards' : '📄 Paper Cards'}
                      </div>
                    </label>
                  ))}
                </div>
                {errors.material && <p className="text-xs text-red-500 mt-1">{errors.material.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Decks</label>
                <input
                  type="number"
                  {...register('deckCount', { valueAsNumber: true })}
                  min={1}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. 450"
                />
                {errors.deckCount && <p className="text-xs text-red-500 mt-1">{errors.deckCount.message}</p>}
                {deckCount > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    = {(deckCount * 52).toLocaleString()} cards &nbsp;|&nbsp;
                    {containersNeeded} container{containersNeeded !== 1 ? 's' : ''} will be created
                    {deckCount % 200 !== 0 && ` (last one: ${deckCount % 200} decks)`}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <input
                  {...register('note')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. Shipment #1234"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-ghost flex-1" onClick={() => { setModalOpen(false); reset() }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isSubmitting || addMutation.isPending}>
                  Add Decks
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

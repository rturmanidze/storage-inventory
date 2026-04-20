import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface DeckEntry {
  id: number
  color: 'BLACK' | 'RED'
  deckCount: number
  cardCount: number
  note: string | null
  createdAt: string
  createdBy: { id: number; username: string } | null
}

interface CardInventory {
  blackDecks: number
  redDecks: number
  blackCards: number
  redCards: number
  totalDecks: number
  totalCards: number
  shoesInWarehouse: number
  shoesSentToStudio: number
  totalShoes: number
}

const schema = z.object({
  color: z.enum(['BLACK', 'RED']),
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

export default function Decks() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const canAdd = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const { data: inventory } = useQuery<CardInventory>({
    queryKey: ['card-inventory'],
    queryFn: () => api.get('/cards/inventory').then(r => r.data),
    refetchInterval: 15_000,
  })

  const { data: entries = [], isLoading } = useQuery<DeckEntry[]>({
    queryKey: ['deck-entries'],
    queryFn: () => api.get('/cards/decks').then(r => r.data),
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DeckForm>({
    resolver: zodResolver(schema),
    defaultValues: { color: 'BLACK', deckCount: 1 },
  })

  const deckCount = watch('deckCount') || 0

  const addMutation = useMutation({
    mutationFn: (data: DeckForm) => api.post('/cards/decks', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deck-entries'] })
      qc.invalidateQueries({ queryKey: ['card-inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard-card-stats'] })
      toast.success('Decks added to inventory')
      setModalOpen(false)
      reset()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to add decks'),
  })

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Deck Inventory</h1>
          <p className="page-subtitle">Track card decks received into the warehouse</p>
        </div>
        {canAdd && (
          <button className="btn-primary" onClick={() => { reset(); setModalOpen(true) }}>
            + Add Decks
          </button>
        )}
      </div>

      {/* Summary cards */}
      {inventory && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Black Decks</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.blackDecks}</p>
            <p className="text-xs text-gray-400 mt-0.5">{inventory.blackCards.toLocaleString()} cards</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-red-500 uppercase tracking-wide font-semibold">Red Decks</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.redDecks}</p>
            <p className="text-xs text-gray-400 mt-0.5">{inventory.redCards.toLocaleString()} cards</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Decks</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.totalDecks}</p>
            <p className="text-xs text-gray-400 mt-0.5">{inventory.totalDecks >= 8 ? `${Math.floor(inventory.totalDecks / 8)} shoes possible` : 'Need 8 decks/shoe'}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Cards</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.totalCards.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">52 per deck</p>
          </div>
        </div>
      )}

      {/* Entries table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Deck Receiving History</h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No deck entries yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Decks</label>
                <input
                  type="number"
                  {...register('deckCount', { valueAsNumber: true })}
                  min={1}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. 10"
                />
                {errors.deckCount && <p className="text-xs text-red-500 mt-1">{errors.deckCount.message}</p>}
                {deckCount > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    = {(deckCount * 52).toLocaleString()} cards &nbsp;|&nbsp; {Math.floor(deckCount / 8)} complete shoes possible
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

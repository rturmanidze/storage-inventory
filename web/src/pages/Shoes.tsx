import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Studio {
  id: number
  name: string
}

interface Shoe {
  id: number
  color: 'BLACK' | 'RED'
  status: 'IN_WAREHOUSE' | 'SENT_TO_STUDIO' | 'RETURNED' | 'DESTROYED'
  studioId: number | null
  studio: Studio | null
  createdAt: string
  sentAt: string | null
  returnedAt: string | null
  destroyedAt: string | null
  destroyReason: string | null
  createdBy: { id: number; username: string } | null
  sentBy: { id: number; username: string } | null
  returnedBy: { id: number; username: string } | null
  destroyedBy: { id: number; username: string } | null
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
  shoesReturned: number
  shoesDestroyed: number
  totalShoes: number
}

function ColorBadge({ color }: { color: 'BLACK' | 'RED' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      color === 'BLACK' ? 'bg-gray-800 text-white' : 'bg-red-100 text-red-700'
    }`}>
      {color === 'BLACK' ? 'Black' : 'Red'}
    </span>
  )
}

function StatusBadge({ status }: { status: Shoe['status'] }) {
  const map: Record<Shoe['status'], { label: string; cls: string }> = {
    IN_WAREHOUSE: { label: 'In Warehouse', cls: 'status-in-stock' },
    SENT_TO_STUDIO: { label: 'Sent to Studio', cls: 'status-issued' },
    RETURNED: { label: 'Returned', cls: 'status-quarantined' },
    DESTROYED: { label: 'Destroyed', cls: 'status-destroyed' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: '' }
  return <span className={`badge text-xs ${cls}`}>{label}</span>
}

export default function Shoes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [sendModalShoe, setSendModalShoe] = useState<Shoe | null>(null)
  const [returnModalShoe, setReturnModalShoe] = useState<Shoe | null>(null)
  const [destroyModalShoe, setDestroyModalShoe] = useState<Shoe | null>(null)
  const [destroyReason, setDestroyReason] = useState('')
  const [selectedColor, setSelectedColor] = useState<'BLACK' | 'RED'>('BLACK')
  const [selectedStudioId, setSelectedStudioId] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_WAREHOUSE' | 'SENT_TO_STUDIO' | 'RETURNED' | 'DESTROYED'>('ALL')
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const { data: inventory } = useQuery<CardInventory>({
    queryKey: ['card-inventory'],
    queryFn: () => api.get('/cards/inventory').then(r => r.data),
    refetchInterval: 15_000,
  })

  const { data: shoes = [], isLoading } = useQuery<Shoe[]>({
    queryKey: ['shoes', statusFilter],
    queryFn: () => {
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''
      return api.get(`/cards/shoes${params}`).then(r => r.data)
    },
  })

  const { data: studios = [] } = useQuery<Studio[]>({
    queryKey: ['studios'],
    queryFn: () => api.get('/studios').then(r => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['shoes'] })
    qc.invalidateQueries({ queryKey: ['card-inventory'] })
    qc.invalidateQueries({ queryKey: ['dashboard-card-stats'] })
  }

  const createMutation = useMutation({
    mutationFn: (color: 'BLACK' | 'RED') =>
      api.post('/cards/shoes', { color }),
    onSuccess: () => {
      invalidate()
      toast.success('Shoe created successfully')
      setCreateModalOpen(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to create shoe'),
  })

  const sendMutation = useMutation({
    mutationFn: ({ shoeId, studioId }: { shoeId: number; studioId: number }) =>
      api.post(`/cards/shoes/${shoeId}/send-to-studio`, { studioId }),
    onSuccess: () => {
      invalidate()
      toast.success('Shoe sent to studio')
      setSendModalShoe(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to send shoe'),
  })

  const returnMutation = useMutation({
    mutationFn: (shoeId: number) =>
      api.post(`/cards/shoes/${shoeId}/return-from-studio`),
    onSuccess: () => {
      invalidate()
      toast.success('Shoe returned — 8 decks restored to inventory')
      setReturnModalShoe(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to return shoe'),
  })

  const destroyMutation = useMutation({
    mutationFn: ({ shoeId, reason }: { shoeId: number; reason: string }) =>
      api.post(`/cards/shoes/${shoeId}/destroy`, { reason }),
    onSuccess: () => {
      invalidate()
      toast.success('Shoe marked as destroyed')
      setDestroyModalShoe(null)
      setDestroyReason('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to destroy shoe'),
  })

  function handleSend() {
    if (!sendModalShoe || !selectedStudioId) return
    sendMutation.mutate({ shoeId: sendModalShoe.id, studioId: Number(selectedStudioId) })
  }

  function handleReturn() {
    if (!returnModalShoe) return
    returnMutation.mutate(returnModalShoe.id)
  }

  function handleDestroy() {
    if (!destroyModalShoe || !destroyReason.trim()) return
    destroyMutation.mutate({ shoeId: destroyModalShoe.id, reason: destroyReason.trim() })
  }

  const availableBlack = inventory?.blackDecks ?? 0
  const availableRed = inventory?.redDecks ?? 0

  const filterOptions: { value: typeof statusFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'IN_WAREHOUSE', label: 'In Warehouse' },
    { value: 'SENT_TO_STUDIO', label: 'Sent to Studio' },
    { value: 'RETURNED', label: 'Returned' },
    { value: 'DESTROYED', label: 'Destroyed' },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Shoes (שׂוּ)</h1>
          <p className="page-subtitle">Assemble and manage card shoes — each shoe uses 8 decks (416 cards)</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setCreateModalOpen(true)}>
            + Create Shoe
          </button>
        )}
      </div>

      {/* Inventory Summary */}
      {inventory && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Available Black</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.blackDecks}</p>
            <p className="text-xs text-gray-400 mt-0.5">decks</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-red-500 uppercase tracking-wide font-semibold">Available Red</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.redDecks}</p>
            <p className="text-xs text-gray-400 mt-0.5">decks</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-indigo-500 uppercase tracking-wide font-semibold">In Warehouse</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.shoesInWarehouse}</p>
            <p className="text-xs text-gray-400 mt-0.5">shoes</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-emerald-500 uppercase tracking-wide font-semibold">In Studios</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.shoesSentToStudio}</p>
            <p className="text-xs text-gray-400 mt-0.5">shoes</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-teal-500 uppercase tracking-wide font-semibold">Returned</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.shoesReturned}</p>
            <p className="text-xs text-gray-400 mt-0.5">shoes</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-rose-500 uppercase tracking-wide font-semibold">Destroyed</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.shoesDestroyed}</p>
            <p className="text-xs text-gray-400 mt-0.5">shoes</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Shoes table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : shoes.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No shoes found
            {canEdit && statusFilter === 'ALL' && (
              <div className="mt-3">
                <button className="btn-primary btn-sm" onClick={() => setCreateModalOpen(true)}>
                  Create First Shoe
                </button>
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Studio</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created At</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Event</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shoes.map(shoe => {
                const lastEventLabel =
                  shoe.status === 'DESTROYED' ? `Destroyed ${shoe.destroyedAt ? new Date(shoe.destroyedAt).toLocaleString() : ''}` :
                  shoe.status === 'RETURNED' ? `Returned ${shoe.returnedAt ? new Date(shoe.returnedAt).toLocaleString() : ''}` :
                  shoe.status === 'SENT_TO_STUDIO' ? `Sent ${shoe.sentAt ? new Date(shoe.sentAt).toLocaleString() : ''}` :
                  `Created ${new Date(shoe.createdAt).toLocaleString()}`
                return (
                  <tr key={shoe.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">#{shoe.id}</td>
                    <td className="px-4 py-3"><ColorBadge color={shoe.color} /></td>
                    <td className="px-4 py-3">
                      <div>
                        <StatusBadge status={shoe.status} />
                        {shoe.status === 'DESTROYED' && shoe.destroyReason && (
                          <p className="text-2xs text-gray-400 mt-0.5 max-w-[160px] truncate" title={shoe.destroyReason}>
                            {shoe.destroyReason}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{shoe.studio?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{shoe.createdBy?.username ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(shoe.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">{lastEventLabel}</td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(shoe.status === 'IN_WAREHOUSE' || shoe.status === 'RETURNED') && (
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => { setSendModalShoe(shoe); setSelectedStudioId('') }}
                            >
                              Send
                            </button>
                          )}
                          {shoe.status === 'SENT_TO_STUDIO' && (
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => setReturnModalShoe(shoe)}
                            >
                              Return
                            </button>
                          )}
                          {(shoe.status === 'IN_WAREHOUSE' || shoe.status === 'RETURNED') && (
                            <button
                              className="btn-danger btn-sm"
                              onClick={() => { setDestroyModalShoe(shoe); setDestroyReason('') }}
                            >
                              Destroy
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Shoe Modal */}
      {createModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCreateModalOpen(false) }}>
          <div className="modal-content w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Create New Shoe</h2>
              <button className="btn-ghost btn-sm" onClick={() => setCreateModalOpen(false)}>✕</button>
            </div>
            <div className="space-y-5">
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <p className="font-medium text-gray-700 mb-2">Creation Requirements</p>
                <ul className="space-y-1 text-xs">
                  <li>• 1 shoe = 8 decks = 416 cards</li>
                  <li>• Black available: <strong>{availableBlack} decks</strong></li>
                  <li>• Red available: <strong>{availableRed} decks</strong></li>
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Color</label>
                <div className="flex gap-3">
                  {(['BLACK', 'RED'] as const).map(c => {
                    const available = c === 'BLACK' ? availableBlack : availableRed
                    const canCreate = available >= 8
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={!canCreate}
                        onClick={() => setSelectedColor(c)}
                        className={`flex-1 px-4 py-4 rounded-xl border-2 text-sm font-medium transition-all ${
                          selectedColor === c
                            ? c === 'BLACK' ? 'border-gray-800 bg-gray-800 text-white' : 'border-red-500 bg-red-50 text-red-700'
                            : canCreate ? 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white' : 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="text-2xl mb-1">{c === 'BLACK' ? '⬛' : '🔴'}</div>
                        <div>{c === 'BLACK' ? 'Black' : 'Red'}</div>
                        <div className={`text-xs mt-1 ${canCreate ? 'text-gray-400' : 'text-red-400'}`}>
                          {available} decks available
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-700">
                Creating a <strong>{selectedColor === 'BLACK' ? 'Black' : 'Red'}</strong> shoe will consume{' '}
                <strong>8 decks</strong> ({(8 * 52).toLocaleString()} cards)
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                <button
                  className="btn-primary flex-1"
                  disabled={createMutation.isPending || (selectedColor === 'BLACK' ? availableBlack < 8 : availableRed < 8)}
                  onClick={() => createMutation.mutate(selectedColor)}
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Shoe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send to Studio Modal */}
      {sendModalShoe && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSendModalShoe(null) }}>
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Send Shoe to Studio</h2>
              <button className="btn-ghost btn-sm" onClick={() => setSendModalShoe(null)}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                Shoe <strong>#{sendModalShoe.id}</strong> — <ColorBadge color={sendModalShoe.color} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Studio</label>
                <select
                  value={selectedStudioId}
                  onChange={e => setSelectedStudioId(Number(e.target.value) || '')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— Choose studio —</option>
                  {studios.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => setSendModalShoe(null)}>Cancel</button>
                <button
                  className="btn-primary flex-1"
                  disabled={!selectedStudioId || sendMutation.isPending}
                  onClick={handleSend}
                >
                  {sendMutation.isPending ? 'Sending…' : 'Send to Studio'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return from Studio Modal */}
      {returnModalShoe && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setReturnModalShoe(null) }}>
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Return Shoe from Studio</h2>
              <button className="btn-ghost btn-sm" onClick={() => setReturnModalShoe(null)}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <p>Shoe <strong>#{returnModalShoe.id}</strong> — <ColorBadge color={returnModalShoe.color} /></p>
                {returnModalShoe.studio && (
                  <p className="mt-1 text-xs text-gray-500">Returning from: <strong>{returnModalShoe.studio.name}</strong></p>
                )}
              </div>
              <div className="bg-teal-50 rounded-lg p-3 text-xs text-teal-700">
                Returning this shoe will restore <strong>8 decks</strong> ({(8 * 52).toLocaleString()} cards) to the available inventory.
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => setReturnModalShoe(null)}>Cancel</button>
                <button
                  className="btn-primary flex-1"
                  disabled={returnMutation.isPending}
                  onClick={handleReturn}
                >
                  {returnMutation.isPending ? 'Returning…' : 'Return Shoe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Destroy Shoe Modal */}
      {destroyModalShoe && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDestroyModalShoe(null); setDestroyReason('') } }}>
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Destroy Shoe</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setDestroyModalShoe(null); setDestroyReason('') }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                Shoe <strong>#{destroyModalShoe.id}</strong> — <ColorBadge color={destroyModalShoe.color} />
              </div>
              <div className="bg-rose-50 rounded-lg p-3 text-xs text-rose-700">
                ⚠️ This action is <strong>permanent</strong>. The shoe will be marked as destroyed and its decks will be permanently removed from inventory.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Destruction <span className="text-red-500">*</span></label>
                <textarea
                  value={destroyReason}
                  onChange={e => setDestroyReason(e.target.value)}
                  placeholder="e.g. Damaged cards, expired, contaminated…"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => { setDestroyModalShoe(null); setDestroyReason('') }}>Cancel</button>
                <button
                  className="btn-danger flex-1"
                  disabled={!destroyReason.trim() || destroyMutation.isPending}
                  onClick={handleDestroy}
                >
                  {destroyMutation.isPending ? 'Destroying…' : 'Destroy Shoe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

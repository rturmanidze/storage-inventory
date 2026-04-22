import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Studio {
  id: number
  name: string
}

interface ContainerInfo {
  id: number
  code: string
  color: 'BLACK' | 'RED'
  material: 'PLASTIC' | 'PAPER'
  decksRemaining: number
  isLocked: boolean
  archivedAt: string | null
}

type ShoeStatus =
  | 'IN_WAREHOUSE'
  | 'SENT_TO_STUDIO'
  | 'RETURNED'
  | 'CARDS_DESTROYED'
  | 'DESTROYED'           // legacy alias for CARDS_DESTROYED
  | 'EMPTY_SHOE_IN_WAREHOUSE'
  | 'REFILLED'
  | 'PHYSICALLY_DAMAGED'
  | 'PHYSICALLY_DESTROYED'

interface Shoe {
  id: number
  shoeNumber: string
  color: 'BLACK' | 'RED'
  material: 'PLASTIC' | 'PAPER' | null
  status: ShoeStatus
  studioId: number | null
  studio: Studio | null
  createdAt: string
  sentAt: string | null
  returnedAt: string | null
  destroyedAt: string | null
  destroyReason: string | null
  recoveredAt: string | null
  refilledAt: string | null
  physicalDamageAt: string | null
  physicalDamageReason: string | null
  physicallyDestroyedAt: string | null
  createdBy: { id: number; username: string } | null
  sentBy: { id: number; username: string } | null
  returnedBy: { id: number; username: string } | null
  destroyedBy: { id: number; username: string } | null
  recoveredBy: { id: number; username: string } | null
  refilledBy: { id: number; username: string } | null
  physicalDamageBy: { id: number; username: string } | null
  physicallyDestroyedBy: { id: number; username: string } | null
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
  shoesCardsDestroyed: number
  shoesEmpty: number
  shoesRefilled: number
  shoesPhysicallyDamaged: number
  shoesPhysicallyDestroyed: number
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

function StatusBadge({ status }: { status: ShoeStatus }) {
  const map: Partial<Record<ShoeStatus, { label: string; cls: string }>> = {
    IN_WAREHOUSE: { label: 'In Warehouse', cls: 'status-in-stock' },
    SENT_TO_STUDIO: { label: 'Sent to Studio', cls: 'status-issued' },
    RETURNED: { label: 'Returned', cls: 'status-quarantined' },
    CARDS_DESTROYED: { label: 'Shredded', cls: 'status-destroyed' },
    DESTROYED: { label: 'Shredded', cls: 'status-destroyed' },
    EMPTY_SHOE_IN_WAREHOUSE: { label: 'Empty Shoe', cls: 'status-damaged' },
    REFILLED: { label: 'Refilled', cls: 'status-in-stock' },
    PHYSICALLY_DAMAGED: { label: 'Physically Damaged', cls: 'status-damaged' },
    PHYSICALLY_DESTROYED: { label: 'Physically Destroyed', cls: 'status-destroyed' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: '' }
  return <span className={`badge text-xs ${cls}`}>{label}</span>
}

type StatusFilter = 'ALL' | ShoeStatus

export default function Shoes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [sendModalShoe, setSendModalShoe] = useState<Shoe | null>(null)
  const [returnModalShoe, setReturnModalShoe] = useState<Shoe | null>(null)
  const [destroyCardsModalShoe, setDestroyCardsModalShoe] = useState<Shoe | null>(null)
  const [destroyCardsReason, setDestroyCardsReason] = useState('')
  const [recoverModalShoe, setRecoverModalShoe] = useState<Shoe | null>(null)
  const [refillModalShoe, setRefillModalShoe] = useState<Shoe | null>(null)
  const [refillColor, setRefillColor] = useState<'BLACK' | 'RED'>('BLACK')
  const [refillStudioId, setRefillStudioId] = useState<number | ''>('')
  const [physicalDamageModalShoe, setPhysicalDamageModalShoe] = useState<Shoe | null>(null)
  const [physicalDamageReason, setPhysicalDamageReason] = useState('')
  const [confirmDestroyModalShoe, setConfirmDestroyModalShoe] = useState<Shoe | null>(null)
  const [selectedColor, setSelectedColor] = useState<'BLACK' | 'RED'>('BLACK')
  const [selectedMaterial, setSelectedMaterial] = useState<'PLASTIC' | 'PAPER'>('PLASTIC')
  const [shoeNumberInput, setShoeNumberInput] = useState('')
  const [selectedStudioId, setSelectedStudioId] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
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

  const { data: containers = [] } = useQuery<ContainerInfo[]>({
    queryKey: ['containers-active'],
    queryFn: () => api.get('/containers?archived=false').then(r => r.data),
    refetchInterval: 15_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['shoes'] })
    qc.invalidateQueries({ queryKey: ['card-inventory'] })
    qc.invalidateQueries({ queryKey: ['dashboard-card-stats'] })
    qc.invalidateQueries({ queryKey: ['containers-active'] })
  }

  const createMutation = useMutation({
    mutationFn: ({ color, material, shoeNumber }: { color: 'BLACK' | 'RED'; material: 'PLASTIC' | 'PAPER'; shoeNumber: string }) =>
      api.post('/cards/shoes', { color, material, shoeNumber }),
    onSuccess: () => {
      invalidate()
      toast.success('Shoe created successfully')
      setCreateModalOpen(false)
      setShoeNumberInput('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to create shoe'),
  })

  const sendMutation = useMutation({
    mutationFn: ({ shoeId, studioId }: { shoeId: number; studioId: number }) =>
      api.post(`/cards/shoes/${shoeId}/send-to-studio`, { studioId }),
    onSuccess: () => { invalidate(); toast.success('Shoe sent to studio'); setSendModalShoe(null) },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to send shoe'),
  })

  const returnMutation = useMutation({
    mutationFn: (shoeId: number) => api.post(`/cards/shoes/${shoeId}/return-from-studio`),
    onSuccess: () => { invalidate(); toast.success('Shoe returned to warehouse'); setReturnModalShoe(null) },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to return shoe'),
  })

  const destroyCardsMutation = useMutation({
    mutationFn: ({ shoeId, reason }: { shoeId: number; reason: string }) =>
      api.post(`/cards/shoes/${shoeId}/shred`, { reason }),
    onSuccess: () => {
      invalidate()
      toast.success('Cards shredded — shoe container remains in warehouse')
      setDestroyCardsModalShoe(null)
      setDestroyCardsReason('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to shred cards'),
  })

  const recoverMutation = useMutation({
    mutationFn: (shoeId: number) => api.post(`/cards/shoes/${shoeId}/recover-shoe`),
    onSuccess: () => { invalidate(); toast.success('Shoe recovered — empty container now in warehouse'); setRecoverModalShoe(null) },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to recover shoe'),
  })

  const refillMutation = useMutation({
    mutationFn: ({ shoeId, color, studioId }: { shoeId: number; color: string; studioId?: number }) =>
      api.post(`/cards/shoes/${shoeId}/refill`, { color, studioId: studioId ?? null }),
    onSuccess: (_data, vars) => {
      invalidate()
      toast.success(vars.studioId ? 'Shoe refilled and sent to studio' : 'Shoe refilled — ready for studio deployment')
      setRefillModalShoe(null)
      setRefillStudioId('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to refill shoe'),
  })

  const physicalDamageMutation = useMutation({
    mutationFn: ({ shoeId, reason }: { shoeId: number; reason: string }) =>
      api.post(`/cards/shoes/${shoeId}/report-physical-damage`, { reason }),
    onSuccess: () => {
      invalidate()
      toast.success('Physical damage reported — awaiting destruction confirmation')
      setPhysicalDamageModalShoe(null)
      setPhysicalDamageReason('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to report physical damage'),
  })

  const confirmDestroyMutation = useMutation({
    mutationFn: (shoeId: number) => api.post(`/cards/shoes/${shoeId}/confirm-physical-destroy`),
    onSuccess: () => { invalidate(); toast.success('Shoe physically destroyed and removed from service'); setConfirmDestroyModalShoe(null) },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to confirm physical destruction'),
  })

  function handleSend() {
    if (!sendModalShoe || !selectedStudioId) return
    sendMutation.mutate({ shoeId: sendModalShoe.id, studioId: Number(selectedStudioId) })
  }

  const availableBlack = inventory?.blackDecks ?? 0
  const availableRed = inventory?.redDecks ?? 0

  // Per-color unlocked container summary for UI feedback
  const unlockedBlack = containers.filter(c => c.color === 'BLACK' && !c.isLocked && c.decksRemaining > 0)
  const unlockedRed = containers.filter(c => c.color === 'RED' && !c.isLocked && c.decksRemaining > 0)
  const lockedBlack = containers.filter(c => c.color === 'BLACK' && c.isLocked && c.decksRemaining > 0)
  const lockedRed = containers.filter(c => c.color === 'RED' && c.isLocked && c.decksRemaining > 0)
  const allBlackLocked = containers.some(c => c.color === 'BLACK' && c.decksRemaining > 0) && unlockedBlack.length === 0
  const allRedLocked = containers.some(c => c.color === 'RED' && c.decksRemaining > 0) && unlockedRed.length === 0
  const unlockedBlackDecks = unlockedBlack.reduce((s, c) => s + c.decksRemaining, 0)
  const unlockedRedDecks = unlockedRed.reduce((s, c) => s + c.decksRemaining, 0)

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'IN_WAREHOUSE', label: 'In Warehouse' },
    { value: 'SENT_TO_STUDIO', label: 'Sent to Studio' },
    { value: 'RETURNED', label: 'Returned' },
    { value: 'CARDS_DESTROYED', label: 'Shredded' },
    { value: 'EMPTY_SHOE_IN_WAREHOUSE', label: 'Empty Shoe' },
    { value: 'REFILLED', label: 'Refilled' },
    { value: 'PHYSICALLY_DAMAGED', label: 'Physically Damaged' },
    { value: 'PHYSICALLY_DESTROYED', label: 'Physically Destroyed' },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Shoes</h1>
          <p className="page-subtitle">Manage card shoes — each shoe uses 8 decks (416 cards)</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setCreateModalOpen(true)}>
            + Create Shoe
          </button>
        )}
      </div>

      {/* Inventory Summary */}
      {inventory && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
          <div className="card p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Black Decks</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.blackDecks}</p>
            <p className="text-xs text-gray-400 mt-0.5">available</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-red-500 uppercase tracking-wide font-semibold">Red Decks</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.redDecks}</p>
            <p className="text-xs text-gray-400 mt-0.5">available</p>
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
            <p className="text-xs text-orange-500 uppercase tracking-wide font-semibold">Empty Shoes</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.shoesEmpty}</p>
            <p className="text-xs text-gray-400 mt-0.5">containers</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-green-600 uppercase tracking-wide font-semibold">Refilled</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.shoesRefilled}</p>
            <p className="text-xs text-gray-400 mt-0.5">ready</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-amber-500 uppercase tracking-wide font-semibold">Phys. Damaged</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.shoesPhysicallyDamaged}</p>
            <p className="text-xs text-gray-400 mt-0.5">shoes</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-rose-500 uppercase tracking-wide font-semibold">Shredded</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{inventory.shoesCardsDestroyed}</p>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Shoe #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Material</th>
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
                  shoe.status === 'PHYSICALLY_DESTROYED' ? `Phys. Destroyed ${shoe.physicallyDestroyedAt ? new Date(shoe.physicallyDestroyedAt).toLocaleString() : ''}` :
                  shoe.status === 'PHYSICALLY_DAMAGED' ? `Damage Reported ${shoe.physicalDamageAt ? new Date(shoe.physicalDamageAt).toLocaleString() : ''}` :
                  shoe.status === 'REFILLED' ? `Refilled ${shoe.refilledAt ? new Date(shoe.refilledAt).toLocaleString() : ''}` :
                  shoe.status === 'EMPTY_SHOE_IN_WAREHOUSE' ? `Recovered ${shoe.recoveredAt ? new Date(shoe.recoveredAt).toLocaleString() : ''}` :
                  (shoe.status === 'CARDS_DESTROYED' || shoe.status === 'DESTROYED') ? `Shredded ${shoe.destroyedAt ? new Date(shoe.destroyedAt).toLocaleString() : ''}` :
                  shoe.status === 'RETURNED' ? `Returned ${shoe.returnedAt ? new Date(shoe.returnedAt).toLocaleString() : ''}` :
                  shoe.status === 'SENT_TO_STUDIO' ? `Sent ${shoe.sentAt ? new Date(shoe.sentAt).toLocaleString() : ''}` :
                  `Created ${new Date(shoe.createdAt).toLocaleString()}`
                const isCardsDestroyed = shoe.status === 'CARDS_DESTROYED' || shoe.status === 'DESTROYED'
                return (
                  <tr key={shoe.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">
                      Shoe #{shoe.shoeNumber}
                    </td>
                    <td className="px-4 py-3"><ColorBadge color={shoe.color} /></td>
                    <td className="px-4 py-3"><MaterialBadge material={shoe.material} /></td>
                    <td className="px-4 py-3">
                      <div>
                        <StatusBadge status={shoe.status} />
                        {isCardsDestroyed && shoe.destroyReason && (
                          <p className="text-2xs text-gray-400 mt-0.5 max-w-[160px] truncate" title={shoe.destroyReason}>
                            {shoe.destroyReason}
                          </p>
                        )}
                        {shoe.status === 'PHYSICALLY_DAMAGED' && shoe.physicalDamageReason && (
                          <p className="text-2xs text-orange-400 mt-0.5 max-w-[160px] truncate" title={shoe.physicalDamageReason}>
                            {shoe.physicalDamageReason}
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* IN_WAREHOUSE / RETURNED: send to studio + shred cards */}
                          {(shoe.status === 'IN_WAREHOUSE' || shoe.status === 'RETURNED') && (
                            <>
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => { setSendModalShoe(shoe); setSelectedStudioId('') }}
                              >
                                Send
                              </button>
                              <button
                                className="btn-danger btn-sm"
                                onClick={() => { setDestroyCardsModalShoe(shoe); setDestroyCardsReason('') }}
                              >
                                Shred Cards
                              </button>
                            </>
                          )}
                          {/* SENT_TO_STUDIO: return to warehouse */}
                          {shoe.status === 'SENT_TO_STUDIO' && (
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => setReturnModalShoe(shoe)}
                            >
                              Return
                            </button>
                          )}
                          {/* CARDS_DESTROYED: recover empty shoe (one-time) */}
                          {isCardsDestroyed && (
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => setRecoverModalShoe(shoe)}
                            >
                              Recover Shoe
                            </button>
                          )}
                          {/* EMPTY_SHOE_IN_WAREHOUSE: refill + report physical damage */}
                          {shoe.status === 'EMPTY_SHOE_IN_WAREHOUSE' && (
                            <>
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => { setRefillModalShoe(shoe); setRefillColor(shoe.color); setRefillStudioId('') }}
                              >
                                Refill Shoe
                              </button>
                              <button
                                className="btn-danger btn-sm"
                                onClick={() => { setPhysicalDamageModalShoe(shoe); setPhysicalDamageReason('') }}
                              >
                                Report Damage
                              </button>
                            </>
                          )}
                          {/* REFILLED: send to studio + shred cards */}
                          {shoe.status === 'REFILLED' && (
                            <>
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => { setSendModalShoe(shoe); setSelectedStudioId('') }}
                              >
                                Send
                              </button>
                              <button
                                className="btn-danger btn-sm"
                                onClick={() => { setDestroyCardsModalShoe(shoe); setDestroyCardsReason('') }}
                              >
                                Shred Cards
                              </button>
                            </>
                          )}
                          {/* RETURNED: also allow reporting physical damage */}
                          {shoe.status === 'RETURNED' && (
                            <button
                              className="btn-ghost btn-sm text-orange-600 border-orange-200 hover:bg-orange-50"
                              onClick={() => { setPhysicalDamageModalShoe(shoe); setPhysicalDamageReason('') }}
                            >
                              Report Damage
                            </button>
                          )}
                          {/* PHYSICALLY_DAMAGED: confirm physical destruction */}
                          {shoe.status === 'PHYSICALLY_DAMAGED' && (
                            <button
                              className="btn-danger btn-sm"
                              onClick={() => setConfirmDestroyModalShoe(shoe)}
                            >
                              Confirm Destroy
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
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setCreateModalOpen(false); setShoeNumberInput('') } }}>
          <div className="modal-content w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Create New Shoe</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setCreateModalOpen(false); setShoeNumberInput('') }}>✕</button>
            </div>
            <div className="space-y-5">
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <p className="font-medium text-gray-700 mb-2">Creation Requirements</p>
                <ul className="space-y-1 text-xs">
                  <li>• 1 shoe = 8 decks = 416 cards</li>
                  <li>• Black available: <strong>{availableBlack} decks</strong>
                    {allBlackLocked
                      ? <span className="text-red-500 ml-1">(🔒 all containers locked)</span>
                      : unlockedBlack.length > 0
                        ? <span className="text-green-600 ml-1">({unlockedBlack.length} unlocked container{unlockedBlack.length !== 1 ? 's' : ''}, {unlockedBlackDecks} decks)</span>
                        : null}
                  </li>
                  <li>• Red available: <strong>{availableRed} decks</strong>
                    {allRedLocked
                      ? <span className="text-red-500 ml-1">(🔒 all containers locked)</span>
                      : unlockedRed.length > 0
                        ? <span className="text-green-600 ml-1">({unlockedRed.length} unlocked container{unlockedRed.length !== 1 ? 's' : ''}, {unlockedRedDecks} decks)</span>
                        : null}
                  </li>
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Color</label>
                <div className="flex gap-3">
                  {(['BLACK', 'RED'] as const).map(c => {
                    const available = c === 'BLACK' ? availableBlack : availableRed
                    const allLocked = c === 'BLACK' ? allBlackLocked : allRedLocked
                    const unlockedDecks = c === 'BLACK' ? unlockedBlackDecks : unlockedRedDecks
                    const canCreate = available >= 8 && !allLocked && unlockedDecks >= 8
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
                          {allLocked ? '🔒 All containers locked' : `${available} decks available`}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Material</label>
                <div className="flex gap-3">
                  {(['PLASTIC', 'PAPER'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMaterial(m)}
                      className={`flex-1 px-4 py-4 rounded-xl border-2 text-sm font-medium transition-all ${
                        selectedMaterial === m
                          ? m === 'PLASTIC' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="text-2xl mb-1">{m === 'PLASTIC' ? '🔷' : '📄'}</div>
                      <div>{m === 'PLASTIC' ? 'Plastic Cards' : 'Paper Cards'}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-700">
                Creating a <strong>{selectedColor === 'BLACK' ? 'Black' : 'Red'}</strong>{' '}
                <strong>{selectedMaterial === 'PLASTIC' ? 'Plastic' : 'Paper'}</strong> shoe will consume{' '}
                <strong>8 decks</strong> ({(8 * 52).toLocaleString()} cards)
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shoe Number</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder='e.g. 1, A1, SHOE-05'
                  value={shoeNumberInput}
                  onChange={e => setShoeNumberInput(e.target.value)}
                  maxLength={32}
                />
                <p className="text-xs text-gray-400 mt-1">This will be the displayed shoe identifier (e.g. Shoe #A1).</p>
              </div>
              {(selectedColor === 'BLACK' ? allBlackLocked : allRedLocked) && (
                <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700 font-medium">
                  🔒 All {selectedColor.toLowerCase()} containers are locked. Please unlock a container to continue.
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                <button
                  className="btn-primary flex-1"
                  disabled={
                    createMutation.isPending ||
                    !shoeNumberInput.trim() ||
                    (selectedColor === 'BLACK' ? allBlackLocked || unlockedBlackDecks < 8 : allRedLocked || unlockedRedDecks < 8) ||
                    (selectedColor === 'BLACK' ? availableBlack < 8 : availableRed < 8)
                  }
                  onClick={() => createMutation.mutate({ color: selectedColor, material: selectedMaterial, shoeNumber: shoeNumberInput.trim() })}
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
                Shoe <strong>#{sendModalShoe.shoeNumber}</strong> — <ColorBadge color={sendModalShoe.color} />
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
                <p>Shoe <strong>#{returnModalShoe.shoeNumber}</strong> — <ColorBadge color={returnModalShoe.color} /></p>
                {returnModalShoe.studio && (
                  <p className="mt-1 text-xs text-gray-500">Returning from: <strong>{returnModalShoe.studio.name}</strong></p>
                )}
              </div>
              <div className="bg-teal-50 rounded-lg p-3 text-xs text-teal-700">
                Returning this shoe will change its status to <strong>Returned</strong>.
                The shoe's used cards remain held and will need to be destroyed.
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => setReturnModalShoe(null)}>Cancel</button>
                <button
                  className="btn-primary flex-1"
                  disabled={returnMutation.isPending}
                  onClick={() => returnMutation.mutate(returnModalShoe.id)}
                >
                  {returnMutation.isPending ? 'Returning…' : 'Return to Warehouse'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Destroy Cards Modal */}
      {destroyCardsModalShoe && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDestroyCardsModalShoe(null); setDestroyCardsReason('') } }}>
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Shred Cards</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setDestroyCardsModalShoe(null); setDestroyCardsReason('') }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                Shoe <strong>#{destroyCardsModalShoe.shoeNumber}</strong> — <ColorBadge color={destroyCardsModalShoe.color} />
              </div>
              <div className="bg-rose-50 rounded-lg p-3 text-xs text-rose-700">
                ✂️ This permanently shreds the <strong>cards</strong> inside the shoe. The shoe container
                will remain in the warehouse and can be recovered later.
                <br /><br />8 decks ({(8 * 52).toLocaleString()} cards) will be permanently removed from inventory.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Shredding <span className="text-red-500">*</span></label>
                <textarea
                  value={destroyCardsReason}
                  onChange={e => setDestroyCardsReason(e.target.value)}
                  placeholder="e.g. Damaged cards, expired, contaminated…"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => { setDestroyCardsModalShoe(null); setDestroyCardsReason('') }}>Cancel</button>
                <button
                  className="btn-danger flex-1"
                  disabled={!destroyCardsReason.trim() || destroyCardsMutation.isPending}
                  onClick={() => destroyCardsMutation.mutate({ shoeId: destroyCardsModalShoe.id, reason: destroyCardsReason.trim() })}
                >
                  {destroyCardsMutation.isPending ? 'Shredding…' : 'Shred Cards'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recover Shoe Modal */}
      {recoverModalShoe && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRecoverModalShoe(null) }}>
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Recover Empty Shoe</h2>
              <button className="btn-ghost btn-sm" onClick={() => setRecoverModalShoe(null)}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                Shoe <strong>#{recoverModalShoe.shoeNumber}</strong> — <ColorBadge color={recoverModalShoe.color} />
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-700">
                The physical shoe container will be recovered and marked as <strong>Empty Shoe in Warehouse</strong>.
                <br /><br />Cards remain destroyed — no deck inventory increase.
                This action can only be performed <strong>once</strong> per destroyed-cards event.
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => setRecoverModalShoe(null)}>Cancel</button>
                <button
                  className="btn-secondary flex-1"
                  disabled={recoverMutation.isPending}
                  onClick={() => recoverMutation.mutate(recoverModalShoe.id)}
                >
                  {recoverMutation.isPending ? 'Recovering…' : 'Recover Shoe (Empty)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refill Shoe Modal */}
      {refillModalShoe && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setRefillModalShoe(null); setRefillStudioId('') } }}>
          <div className="modal-content w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Refill Empty Shoe</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setRefillModalShoe(null); setRefillStudioId('') }}>✕</button>
            </div>
            <div className="space-y-5">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                Shoe <strong>#{refillModalShoe.shoeNumber}</strong> — empty container ready for new cards
              </div>
              <div className="bg-indigo-50 rounded-lg p-4 text-sm text-indigo-700">
                <p className="font-medium mb-2">Refill Requirements</p>
                <ul className="space-y-1 text-xs">
                  <li>• Exactly 8 decks (416 cards) will be loaded</li>
                  <li>• Black available: <strong>{availableBlack} decks</strong>
                    {allBlackLocked
                      ? <span className="text-red-500 ml-1">(🔒 all containers locked)</span>
                      : unlockedBlack.length > 0
                        ? <span className="text-green-600 ml-1">({unlockedBlack.length} unlocked, {unlockedBlackDecks} decks)</span>
                        : null}
                  </li>
                  <li>• Red available: <strong>{availableRed} decks</strong>
                    {allRedLocked
                      ? <span className="text-red-500 ml-1">(🔒 all containers locked)</span>
                      : unlockedRed.length > 0
                        ? <span className="text-green-600 ml-1">({unlockedRed.length} unlocked, {unlockedRedDecks} decks)</span>
                        : null}
                  </li>
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Card Color</label>
                <div className="flex gap-3">
                  {(['BLACK', 'RED'] as const).map(c => {
                    const available = c === 'BLACK' ? availableBlack : availableRed
                    const allLocked = c === 'BLACK' ? allBlackLocked : allRedLocked
                    const unlockedDecks = c === 'BLACK' ? unlockedBlackDecks : unlockedRedDecks
                    const canRefill = available >= 8 && !allLocked && unlockedDecks >= 8
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={!canRefill}
                        onClick={() => setRefillColor(c)}
                        className={`flex-1 px-4 py-4 rounded-xl border-2 text-sm font-medium transition-all ${
                          refillColor === c
                            ? c === 'BLACK' ? 'border-gray-800 bg-gray-800 text-white' : 'border-red-500 bg-red-50 text-red-700'
                            : canRefill ? 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white' : 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="text-2xl mb-1">{c === 'BLACK' ? '⬛' : '🔴'}</div>
                        <div>{c === 'BLACK' ? 'Black' : 'Red'}</div>
                        <div className={`text-xs mt-1 ${canRefill ? 'text-gray-400' : 'text-red-400'}`}>
                          {allLocked ? '🔒 All containers locked' : `${available} decks available`}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send to Studio (optional)</label>
                <select
                  value={refillStudioId}
                  onChange={e => setRefillStudioId(Number(e.target.value) || '')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— Keep in warehouse —</option>
                  {studios.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-xs text-emerald-700">
                Refilling with <strong>{refillColor === 'BLACK' ? 'Black' : 'Red'}</strong> cards will consume{' '}
                <strong>8 decks</strong> ({(8 * 52).toLocaleString()} cards) from inventory.
              </div>
              {(refillColor === 'BLACK' ? allBlackLocked : allRedLocked) && (
                <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700 font-medium">
                  🔒 All {refillColor.toLowerCase()} containers are locked. Please unlock a container to continue.
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => { setRefillModalShoe(null); setRefillStudioId('') }}>Cancel</button>
                <button
                  className="btn-primary flex-1"
                  disabled={
                    refillMutation.isPending ||
                    (refillColor === 'BLACK' ? allBlackLocked || unlockedBlackDecks < 8 : allRedLocked || unlockedRedDecks < 8) ||
                    (refillColor === 'BLACK' ? availableBlack < 8 : availableRed < 8)
                  }
                  onClick={() => refillMutation.mutate({
                    shoeId: refillModalShoe.id,
                    color: refillColor,
                    studioId: refillStudioId ? Number(refillStudioId) : undefined,
                  })}
                >
                  {refillMutation.isPending ? 'Refilling…' : refillStudioId ? 'Refill & Send to Studio' : 'Refill Shoe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Physical Damage Modal */}
      {physicalDamageModalShoe && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setPhysicalDamageModalShoe(null); setPhysicalDamageReason('') } }}>
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Report Physical Damage</h2>
              <button className="btn-ghost btn-sm" onClick={() => { setPhysicalDamageModalShoe(null); setPhysicalDamageReason('') }}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                Shoe <strong>#{physicalDamageModalShoe.shoeNumber}</strong> — <ColorBadge color={physicalDamageModalShoe.color} />
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                ⚠️ Report <strong>physical damage only</strong> — broken, cracked, or structurally unusable shoe container.
                <br /><br />Do NOT use this for card depletion or routine usage. Use "Destroy Cards" for that.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Damage Description <span className="text-red-500">*</span></label>
                <textarea
                  value={physicalDamageReason}
                  onChange={e => setPhysicalDamageReason(e.target.value)}
                  placeholder="e.g. Cracked housing, broken mechanism, structural damage…"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => { setPhysicalDamageModalShoe(null); setPhysicalDamageReason('') }}>Cancel</button>
                <button
                  className="btn-danger flex-1"
                  disabled={!physicalDamageReason.trim() || physicalDamageMutation.isPending}
                  onClick={() => physicalDamageMutation.mutate({ shoeId: physicalDamageModalShoe.id, reason: physicalDamageReason.trim() })}
                >
                  {physicalDamageMutation.isPending ? 'Reporting…' : 'Report Damage'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Physical Destruction Modal */}
      {confirmDestroyModalShoe && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDestroyModalShoe(null) }}>
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Confirm Physical Destruction</h2>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmDestroyModalShoe(null)}>✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                Shoe <strong>#{confirmDestroyModalShoe.shoeNumber}</strong> — <ColorBadge color={confirmDestroyModalShoe.color} />
                {confirmDestroyModalShoe.physicalDamageReason && (
                  <p className="mt-2 text-xs text-orange-600">Damage reported: {confirmDestroyModalShoe.physicalDamageReason}</p>
                )}
              </div>
              <div className="bg-rose-50 rounded-lg p-3 text-xs text-rose-700">
                ⚠️ <strong>This action is irreversible</strong> and applies only to physically damaged shoes.
                <br /><br />The shoe container will be permanently removed from service.
                A replacement shoe can be created afterwards (consuming 8 new decks).
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => setConfirmDestroyModalShoe(null)}>Cancel</button>
                <button
                  className="btn-danger flex-1"
                  disabled={confirmDestroyMutation.isPending}
                  onClick={() => confirmDestroyMutation.mutate(confirmDestroyModalShoe.id)}
                >
                  {confirmDestroyMutation.isPending ? 'Destroying…' : 'Confirm Destruction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

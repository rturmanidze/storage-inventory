import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Studio {
  id: number
  name: string
}

type ShoeStatus =
  | 'IN_WAREHOUSE'
  | 'SENT_TO_STUDIO'
  | 'RETURNED'
  | 'CARDS_DESTROYED'
  | 'DESTROYED'
  | 'EMPTY_SHOE_IN_WAREHOUSE'
  | 'PHYSICALLY_DAMAGED'
  | 'PHYSICALLY_DESTROYED'

interface Shoe {
  id: number
  shoeNumber: number
  color: 'BLACK' | 'RED'
  status: ShoeStatus
  studioId: number | null
  studio: Studio | null
  createdAt: string
  destroyedAt: string | null
  destroyReason: string | null
  recoveredAt: string | null
  physicalDamageReason: string | null
  physicalDamageAt: string | null
  physicallyDestroyedAt: string | null
  createdBy: { id: number; username: string } | null
  destroyedBy: { id: number; username: string } | null
  recoveredBy: { id: number; username: string } | null
  physicalDamageBy: { id: number; username: string } | null
  physicallyDestroyedBy: { id: number; username: string } | null
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

type ViewFilter = 'ALL' | 'CARDS_DESTROYED' | 'PHYSICALLY_DESTROYED'

export default function DestroyedShoes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [recoverShoe, setRecoverShoe] = useState<Shoe | null>(null)
  const [replaceShoe, setReplaceShoe] = useState<Shoe | null>(null)
  const [replaceStudioId, setReplaceStudioId] = useState<number | ''>('')
  const [viewFilter, setViewFilter] = useState<ViewFilter>('ALL')
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const { data: allShoes = [], isLoading } = useQuery<Shoe[]>({
    queryKey: ['shoes-destroyed'],
    queryFn: async () => {
      const [cardsDestroyed, physDestroyed] = await Promise.all([
        api.get('/cards/shoes?status=CARDS_DESTROYED').then(r => r.data),
        api.get('/cards/shoes?status=PHYSICALLY_DESTROYED').then(r => r.data),
      ])
      return [...cardsDestroyed, ...physDestroyed]
    },
    refetchInterval: 30_000,
  })

  const { data: studios = [] } = useQuery<Studio[]>({
    queryKey: ['studios'],
    queryFn: () => api.get('/studios').then(r => r.data),
  })

  const shoes = viewFilter === 'ALL'
    ? allShoes
    : viewFilter === 'CARDS_DESTROYED'
      ? allShoes.filter(s => s.status === 'CARDS_DESTROYED' || s.status === 'DESTROYED')
      : allShoes.filter(s => s.status === 'PHYSICALLY_DESTROYED')

  const recoverMutation = useMutation({
    mutationFn: (shoeId: number) => api.post(`/cards/shoes/${shoeId}/recover-shoe`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shoes-destroyed'] })
      qc.invalidateQueries({ queryKey: ['shoes'] })
      qc.invalidateQueries({ queryKey: ['card-inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard-card-stats'] })
      toast.success(`Shoe #${recoverShoe?.shoeNumber} recovered — empty container now in warehouse`)
      setRecoverShoe(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to recover shoe'),
  })

  const replaceMutation = useMutation({
    mutationFn: ({ shoeId, studioId }: { shoeId: number; studioId?: number }) =>
      api.post(`/cards/shoes/${shoeId}/replace`, studioId ? { studioId } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shoes-destroyed'] })
      qc.invalidateQueries({ queryKey: ['shoes'] })
      qc.invalidateQueries({ queryKey: ['card-inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard-card-stats'] })
      toast.success(`Shoe #${replaceShoe?.shoeNumber} replaced — 8 decks consumed`)
      setReplaceShoe(null)
      setReplaceStudioId('')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to replace shoe'),
  })

  function handleReplace() {
    if (!replaceShoe) return
    replaceMutation.mutate({
      shoeId: replaceShoe.id,
      studioId: replaceStudioId ? Number(replaceStudioId) : undefined,
    })
  }

  function downloadCSV() {
    const token = localStorage.getItem('token') ?? ''
    fetch('/api/reports/cards/shoes/csv', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const href = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = href
        a.download = 'shoes_export.csv'
        a.click()
        URL.revokeObjectURL(href)
      })
  }

  const filterOptions: { value: ViewFilter; label: string; count: number }[] = [
    { value: 'ALL', label: 'All', count: allShoes.length },
    {
      value: 'CARDS_DESTROYED',
      label: 'Cards Destroyed',
      count: allShoes.filter(s => s.status === 'CARDS_DESTROYED' || s.status === 'DESTROYED').length,
    },
    {
      value: 'PHYSICALLY_DESTROYED',
      label: 'Physically Destroyed',
      count: allShoes.filter(s => s.status === 'PHYSICALLY_DESTROYED').length,
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Destroyed Shoes</h1>
          <p className="page-subtitle">
            Full record of card destructions and physically destroyed shoes — {allShoes.length} total
          </p>
        </div>
        {canEdit && (
          <button className="btn-secondary" onClick={downloadCSV}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </button>
        )}
      </div>

      {/* Info banners */}
      <div className="space-y-3">
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div className="text-sm text-amber-700">
            <p className="font-semibold">Cards Destroyed — shoe container remains</p>
            <p className="mt-0.5 text-amber-600">
              Use <strong>Recover Shoe (Empty)</strong> to retrieve the physical shoe container.
              This can only be done <strong>once</strong> per destroyed-cards record. No deck inventory increase.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-5 py-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          <div className="text-sm text-rose-700">
            <p className="font-semibold">Physically Destroyed — shoe container is gone</p>
            <p className="mt-0.5 text-rose-600">
              Use <strong>Replace Shoe</strong> to create a brand-new shoe with the same display number.
              The replacement consumes 8 decks from inventory.
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {filterOptions.map(f => (
          <button
            key={f.value}
            onClick={() => setViewFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              viewFilter === f.value
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : shoes.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            No records found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Shoe #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Event Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created At</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shoes.map(shoe => {
                const isCardsDestroyed = shoe.status === 'CARDS_DESTROYED' || shoe.status === 'DESTROYED'
                const isPhysicallyDestroyed = shoe.status === 'PHYSICALLY_DESTROYED'
                const eventDate = isCardsDestroyed
                  ? (shoe.destroyedAt ? new Date(shoe.destroyedAt).toLocaleString() : '—')
                  : (shoe.physicallyDestroyedAt ? new Date(shoe.physicallyDestroyedAt).toLocaleString() : '—')
                const reason = isCardsDestroyed ? (shoe.destroyReason ?? '—') : (shoe.physicalDamageReason ?? '—')
                const byUser = isCardsDestroyed
                  ? (shoe.destroyedBy?.username ?? '—')
                  : (shoe.physicallyDestroyedBy?.username ?? '—')
                return (
                  <tr key={shoe.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">
                      Shoe #{shoe.shoeNumber}
                      <span className="ml-2 text-2xs text-gray-300">id:{shoe.id}</span>
                    </td>
                    <td className="px-4 py-3"><ColorBadge color={shoe.color} /></td>
                    <td className="px-4 py-3">
                      {isCardsDestroyed ? (
                        <span className="badge text-xs status-destroyed">Cards Destroyed</span>
                      ) : (
                        <span className="badge text-xs status-destroyed">Physically Destroyed</span>
                      )}
                      {isCardsDestroyed && shoe.recoveredAt && (
                        <p className="text-2xs text-emerald-600 mt-0.5">
                          Shoe recovered {new Date(shoe.recoveredAt).toLocaleDateString()}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{eventDate}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <span className="block truncate" title={reason}>{reason}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{byUser}</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                      {new Date(shoe.createdAt).toLocaleString()}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        {isCardsDestroyed && !shoe.recoveredAt && (
                          <button
                            className="btn-sm btn-secondary"
                            onClick={() => setRecoverShoe(shoe)}
                          >
                            Recover Shoe
                          </button>
                        )}
                        {isPhysicallyDestroyed && (
                          <button
                            className="btn-sm btn-primary"
                            onClick={() => { setReplaceShoe(shoe); setReplaceStudioId('') }}
                          >
                            Replace Shoe
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recover Shoe Modal */}
      {recoverShoe && (
        <div className="modal-overlay" onClick={() => setRecoverShoe(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Recover Empty Shoe #{recoverShoe.shoeNumber}
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              The physical <strong>{recoverShoe.color === 'BLACK' ? 'Black' : 'Red'}</strong> shoe container
              will be recovered and marked as <strong>Empty Shoe in Warehouse</strong>.
              Cards remain destroyed — <strong>no deck inventory increase</strong>.
              This action can only be performed <strong>once</strong>.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn-ghost" onClick={() => setRecoverShoe(null)}>Cancel</button>
              <button
                className="btn-secondary"
                onClick={() => recoverMutation.mutate(recoverShoe.id)}
                disabled={recoverMutation.isPending}
              >
                {recoverMutation.isPending ? 'Recovering…' : 'Recover Shoe (Empty)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replace Shoe Modal */}
      {replaceShoe && (
        <div className="modal-overlay" onClick={() => setReplaceShoe(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Replace Shoe #{replaceShoe.shoeNumber}
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              A new <strong>{replaceShoe.color === 'BLACK' ? 'Black' : 'Red'}</strong> shoe will be created
              with display number <strong>#{replaceShoe.shoeNumber}</strong>, consuming <strong>8 decks</strong> from inventory.
              The original physically destroyed shoe remains in the database for audit purposes.
            </p>

            <div className="mb-5">
              <label className="label">Send to studio immediately (optional)</label>
              <select
                className="input"
                value={replaceStudioId}
                onChange={e => setReplaceStudioId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">— Keep in warehouse —</option>
                {studios.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3">
              <button className="btn-ghost" onClick={() => setReplaceShoe(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleReplace}
                disabled={replaceMutation.isPending}
              >
                {replaceMutation.isPending ? 'Replacing…' : 'Create Replacement Shoe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


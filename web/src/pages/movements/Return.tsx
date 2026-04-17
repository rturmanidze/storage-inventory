import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../api/client'
import BarcodeScanner from '../../components/BarcodeScanner'

interface Warehouse {
  id: number
  name: string
  code: string
}

interface Location {
  id: number
  code: string
  description: string | null
}

export default function Return() {
  const [serials, setSerials] = useState<string[]>([''])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('')
  const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('')

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/warehouses').then(r => r.data),
  })

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['warehouses', selectedWarehouseId, 'locations'],
    queryFn: () =>
      api.get(`/warehouses/${selectedWarehouseId}/locations`).then(r => r.data),
    enabled: !!selectedWarehouseId,
  })

  const returnMutation = useMutation({
    mutationFn: (payload: { serials: string[]; toLocationId: number }) =>
      api.post('/movements/return', payload),
    onSuccess: () => {
      toast.success('Return completed')
      setSerials([''])
      setSelectedWarehouseId('')
      setSelectedLocationId('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(msg ?? 'Return failed')
    },
  })

  function addSerial() {
    setSerials(prev => [...prev, ''])
  }

  function updateSerial(idx: number, value: string) {
    setSerials(prev => prev.map((s, i) => (i === idx ? value : s)))
  }

  function removeSerial(idx: number) {
    setSerials(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validSerials = serials.map(s => s.trim()).filter(Boolean)
    if (validSerials.length === 0) return toast.error('Enter at least one serial')
    if (!selectedLocationId) return toast.error('Select a destination location')
    returnMutation.mutate({
      serials: validSerials,
      toLocationId: selectedLocationId as number,
    })
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <h1 className="page-title">Return Items</h1>
        <p className="page-subtitle">Return issued units back to a warehouse location</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Serials */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Serial Numbers</label>
            <div className="flex gap-2">
              <BarcodeScanner
                onScan={v => {
                  setSerials(prev => {
                    const empty = prev.findIndex(s => !s)
                    if (empty >= 0) return prev.map((s, i) => (i === empty ? v : s))
                    return [...prev, v]
                  })
                }}
              />
              <button type="button" className="btn-secondary btn-sm" onClick={addSerial}>
                + Add
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {serials.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={s}
                  onChange={e => updateSerial(i, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSerial()
                    }
                  }}
                  className="input flex-1"
                  placeholder={`Serial ${i + 1}`}
                  autoFocus={i === serials.length - 1 && i > 0}
                />
                {serials.length > 1 && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => removeSerial(i)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Destination */}
        <div>
          <label className="label">Return to Warehouse</label>
          <select
            className="input"
            value={selectedWarehouseId}
            onChange={e => {
              setSelectedWarehouseId(Number(e.target.value) || '')
              setSelectedLocationId('')
            }}
          >
            <option value="">Select warehouse…</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </div>

        {selectedWarehouseId && (
          <div>
            <label className="label">Return to Location</label>
            <select
              className="input"
              value={selectedLocationId}
              onChange={e => setSelectedLocationId(Number(e.target.value) || '')}
            >
              <option value="">Select location…</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.code}{l.description ? ` — ${l.description}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="btn-primary"
            disabled={returnMutation.isPending}
          >
            {returnMutation.isPending ? 'Processing…' : 'Return'}
          </button>
        </div>
      </form>
    </div>
  )
}

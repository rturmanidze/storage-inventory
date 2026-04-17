import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../api/client'
import BarcodeScanner from '../../components/BarcodeScanner'

interface Item {
  id: number
  sku: string
  name: string
}

interface BarcodeScanResult {
  items: Item[]
}

interface Warehouse {
  id: number
  name: string
  code: string
}

interface Location {
  id: number
  code: string
  description: string | null
  warehouseId: number
}

type Step = 1 | 2 | 3

export default function Receive() {
  const [step, setStep] = useState<Step>(1)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [barcodeCandidates, setBarcodeCandidates] = useState<Item[]>([])
  const [serials, setSerials] = useState<string[]>([''])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('')
  const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('')
  const [scanning, setScanning] = useState(false)

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

  const receiveMutation = useMutation({
    mutationFn: (payload: {
      itemId: number
      serials: string[]
      toLocationId: number
    }) => api.post('/movements/receive', payload),
    onSuccess: () => {
      toast.success('Received successfully')
      resetAll()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(msg ?? 'Receive failed')
    },
  })

  function resetAll() {
    setStep(1)
    setBarcodeInput('')
    setSelectedItem(null)
    setBarcodeCandidates([])
    setSerials([''])
    setSelectedWarehouseId('')
    setSelectedLocationId('')
  }

  async function handleBarcodeLookup() {
    if (!barcodeInput.trim()) return
    setScanning(true)
    try {
      const res = await api.get<BarcodeScanResult>(
        `/scan/barcode/${encodeURIComponent(barcodeInput.trim())}`,
      )
      const items = res.data.items ?? []
      if (items.length === 1) {
        setSelectedItem(items[0])
        setBarcodeCandidates([])
        setStep(2)
      } else if (items.length > 1) {
        setBarcodeCandidates(items)
      } else {
        toast.error('No item found for that barcode')
      }
    } catch {
      toast.error('Barcode lookup failed')
    } finally {
      setScanning(false)
    }
  }

  function addSerial() {
    setSerials(prev => [...prev, ''])
  }

  function updateSerial(idx: number, value: string) {
    setSerials(prev => prev.map((s, i) => (i === idx ? value : s)))
  }

  function removeSerial(idx: number) {
    setSerials(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSubmit() {
    if (!selectedItem) return toast.error('Select an item first')
    const validSerials = serials.map(s => s.trim()).filter(Boolean)
    if (validSerials.length === 0) return toast.error('Enter at least one serial')
    if (!selectedLocationId) return toast.error('Select a destination location')
    receiveMutation.mutate({
      itemId: selectedItem.id,
      serials: validSerials,
      toLocationId: selectedLocationId as number,
    })
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Receive Stock</h1>
        <p className="page-subtitle">Receive new inventory units into the warehouse</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3 text-sm">
        {([1, 2, 3] as Step[]).map(s => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${step >= s ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}
            >
              {step > s ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : (
                s
              )}
            </span>
            <span className={step >= s ? 'text-primary-700 font-medium' : 'text-gray-400'}>
              {s === 1 ? 'Identify Item' : s === 2 ? 'Enter Serials' : 'Confirm'}
            </span>
            {s < 3 && (
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Barcode scan / item selection */}
      {step === 1 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Step 1: Identify Item</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBarcodeLookup()}
              className="input flex-1"
              placeholder="Scan or enter barcode…"
              autoFocus
            />
            <button
              type="button"
              className="btn-primary"
              disabled={scanning}
              onClick={handleBarcodeLookup}
            >
              {scanning ? '…' : 'Look up'}
            </button>
          </div>
          <BarcodeScanner onScan={v => { setBarcodeInput(v); }} />

          {barcodeCandidates.length > 1 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Multiple items found — select one:</p>
              <div className="space-y-2">
                {barcodeCandidates.map(item => (
                  <button
                    key={item.id}
                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    onClick={() => {
                      setSelectedItem(item)
                      setBarcodeCandidates([])
                      setStep(2)
                    }}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="ml-2 text-xs text-gray-500 font-mono">{item.sku}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedItem && (
            <div className="p-3 bg-primary-50 rounded-xl text-sm flex items-center justify-between border border-primary-100">
              <span>
                Selected: <strong>{selectedItem.name}</strong>{' '}
                <span className="text-gray-500 font-mono text-xs">({selectedItem.sku})</span>
              </span>
              <button
                className="text-primary-600 hover:text-primary-700 text-xs font-medium transition-colors"
                onClick={() => { setSelectedItem(null); setStep(1) }}
              >
                Change
              </button>
            </div>
          )}

          {selectedItem && (
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setStep(2)}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Serials + Location */}
      {step === 2 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Step 2: Enter Serials &amp; Location</h2>

          {selectedItem && (
            <p className="text-sm text-gray-600">
              Item: <strong>{selectedItem.name}</strong>
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Serial Numbers</label>
              <button type="button" className="btn-secondary btn-sm" onClick={addSerial}>
                + Add Serial
              </button>
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
                    autoFocus={i === serials.length - 1}
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

          <div>
            <label className="label">Destination Warehouse</label>
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
              <label className="label">Destination Location</label>
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

          <div className="flex justify-between pt-3 border-t border-gray-100">
            <button className="btn-secondary" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button
              className="btn-primary"
              disabled={!selectedLocationId}
              onClick={() => setStep(3)}
            >
              Review →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Step 3: Confirm Receipt</h2>

          <div className="bg-surface-tertiary rounded-xl p-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Item</span>
              <span className="font-medium text-gray-900">{selectedItem?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Serials</span>
              <span className="font-medium text-gray-900">{serials.filter(Boolean).length} unit(s)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Location</span>
              <span className="font-medium text-gray-900">
                {warehouses.find(w => w.id === selectedWarehouseId)?.name} ›{' '}
                {locations.find(l => l.id === selectedLocationId)?.code}
              </span>
            </div>
          </div>

          <div>
            <p className="section-title mb-2">Serial Numbers</p>
            <div className="flex flex-wrap gap-1.5">
              {serials.filter(Boolean).map(s => (
                <span key={s} className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-3 border-t border-gray-100">
            <button className="btn-secondary" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button
              className="btn-primary"
              disabled={receiveMutation.isPending}
              onClick={handleSubmit}
            >
              {receiveMutation.isPending ? 'Receiving…' : 'Confirm & Receive'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

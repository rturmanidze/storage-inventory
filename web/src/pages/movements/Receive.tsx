import { useState, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../api/client'
import BarcodeScanner from '../../components/BarcodeScanner'

interface Item {
  id: number
  sku: string
  name: string
  category?: string | null
  supplier?: string | null
  batch?: string | null
}

interface BarcodeScanResult {
  items: Item[]
  found: boolean
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

interface NewItemForm {
  name: string
  sku: string
  category: string
  supplier: string
  batch: string
}

const BARCODE_MIN_LENGTH = 3
const BARCODE_MAX_LENGTH = 128

function isValidBarcode(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length >= BARCODE_MIN_LENGTH && trimmed.length <= BARCODE_MAX_LENGTH
}

export default function Receive() {
  const [step, setStep] = useState<Step>(1)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [barcodeCandidates, setBarcodeCandidates] = useState<Item[]>([])
  const [serials, setSerials] = useState<string[]>([''])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('')
  const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('')
  const [scanning, setScanning] = useState(false)

  // "Create New Item" state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [scannedBarcode, setScannedBarcode] = useState('')
  const [newItem, setNewItem] = useState<NewItemForm>({
    name: '',
    sku: '',
    category: '',
    supplier: '',
    batch: '',
  })
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})

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

  const createItemMutation = useMutation({
    mutationFn: (payload: {
      name: string
      sku: string
      category?: string
      supplier?: string
      batch?: string
      barcode: string
    }) => api.post('/items/with-barcode', payload),
    onSuccess: (res) => {
      const created: Item = res.data
      toast.success(`Item "${created.name}" created successfully`)
      setSelectedItem(created)
      setShowCreateForm(false)
      setNewItem({ name: '', sku: '', category: '', supplier: '', batch: '' })
      setCreateErrors({})
      setStep(2)
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      toast.error(detail ?? 'Failed to create item')
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
    setShowCreateForm(false)
    setScannedBarcode('')
    setNewItem({ name: '', sku: '', category: '', supplier: '', batch: '' })
    setCreateErrors({})
  }

  const handleBarcodeLookup = useCallback(async () => {
    const trimmed = barcodeInput.trim()
    if (!trimmed) return

    if (!isValidBarcode(trimmed)) {
      toast.error(`Barcode must be between ${BARCODE_MIN_LENGTH} and ${BARCODE_MAX_LENGTH} characters`)
      return
    }

    setScanning(true)
    setShowCreateForm(false)
    setBarcodeCandidates([])
    try {
      const res = await api.get<BarcodeScanResult>(
        `/scan/barcode/${encodeURIComponent(trimmed)}`,
      )
      const items = res.data.items ?? []

      if (items.length === 1) {
        setSelectedItem(items[0])
        setBarcodeCandidates([])
        setStep(2)
      } else if (items.length > 1) {
        setBarcodeCandidates(items)
      } else {
        // Barcode not found → offer to create a new item
        setScannedBarcode(trimmed)
        setShowCreateForm(true)
        setNewItem(prev => ({ ...prev, sku: trimmed })) // pre-fill SKU with barcode
      }
    } catch {
      toast.error('Barcode lookup failed')
    } finally {
      setScanning(false)
    }
  }, [barcodeInput])

  function addSerial() {
    setSerials(prev => [...prev, ''])
  }

  function updateSerial(idx: number, value: string) {
    setSerials(prev => prev.map((s, i) => (i === idx ? value : s)))
  }

  function removeSerial(idx: number) {
    setSerials(prev => prev.filter((_, i) => i !== idx))
  }

  function validateNewItem(): boolean {
    const errors: Record<string, string> = {}
    if (!newItem.name.trim()) errors.name = 'Item name is required'
    if (!newItem.sku.trim()) errors.sku = 'SKU is required'
    setCreateErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleCreateItem() {
    if (!validateNewItem()) return
    createItemMutation.mutate({
      name: newItem.name.trim(),
      sku: newItem.sku.trim(),
      category: newItem.category.trim() || undefined,
      supplier: newItem.supplier.trim() || undefined,
      batch: newItem.batch.trim() || undefined,
      barcode: scannedBarcode,
    })
  }

  function handleCancelCreate() {
    setShowCreateForm(false)
    setScannedBarcode('')
    setNewItem({ name: '', sku: '', category: '', supplier: '', batch: '' })
    setCreateErrors({})
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
              {scanning ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                'Look up'
              )}
            </button>
          </div>
          <BarcodeScanner onScan={v => { setBarcodeInput(v) }} />

          {/* Multiple matches */}
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

          {/* Barcode not found → Create New Item prompt */}
          {showCreateForm && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800">Barcode not found in the system</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Create a new item for barcode <span className="font-mono font-semibold">{scannedBarcode}</span>
                  </p>
                </div>
              </div>

              <div className="p-4 border border-gray-200 rounded-xl space-y-3 bg-white">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create New Item
                </h3>

                {/* Barcode (read-only) */}
                <div>
                  <label className="label">Barcode</label>
                  <input
                    type="text"
                    className="input bg-gray-50 text-gray-500 cursor-not-allowed"
                    value={scannedBarcode}
                    readOnly
                    tabIndex={-1}
                  />
                </div>

                {/* Item Name */}
                <div>
                  <label className="label">
                    Item Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`input ${createErrors.name ? 'border-red-400 focus:ring-red-300' : ''}`}
                    placeholder="e.g. Bicycle Playing Cards"
                    value={newItem.name}
                    onChange={e => {
                      setNewItem(prev => ({ ...prev, name: e.target.value }))
                      if (createErrors.name) setCreateErrors(prev => { const { name: _, ...rest } = prev; return rest })
                    }}
                    autoFocus
                  />
                  {createErrors.name && (
                    <p className="text-xs text-red-500 mt-1">{createErrors.name}</p>
                  )}
                </div>

                {/* SKU */}
                <div>
                  <label className="label">
                    SKU <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`input ${createErrors.sku ? 'border-red-400 focus:ring-red-300' : ''}`}
                    placeholder="e.g. CARDS-001"
                    value={newItem.sku}
                    onChange={e => {
                      setNewItem(prev => ({ ...prev, sku: e.target.value }))
                      if (createErrors.sku) setCreateErrors(prev => { const { sku: _, ...rest } = prev; return rest })
                    }}
                  />
                  {createErrors.sku && (
                    <p className="text-xs text-red-500 mt-1">{createErrors.sku}</p>
                  )}
                </div>

                {/* Category & Supplier side-by-side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Category</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Cards, Chips"
                      value={newItem.category}
                      onChange={e => setNewItem(prev => ({ ...prev, category: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">Supplier</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. USPCC"
                      value={newItem.supplier}
                      onChange={e => setNewItem(prev => ({ ...prev, supplier: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Batch */}
                <div>
                  <label className="label">Batch</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Optional batch identifier"
                    value={newItem.batch}
                    onChange={e => setNewItem(prev => ({ ...prev, batch: e.target.value }))}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCancelCreate}
                    disabled={createItemMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCreateItem}
                    disabled={createItemMutation.isPending}
                  >
                    {createItemMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Creating…
                      </span>
                    ) : (
                      'Create & Continue'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Already-selected item badge */}
          {selectedItem && !showCreateForm && (
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

          {selectedItem && !showCreateForm && (
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

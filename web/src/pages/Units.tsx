import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/client'

interface Unit {
  id: number
  serial: string
  status: string
  itemName: string
  sku: string
  locationCode: string | null
  warehouseName: string | null
  issuedTo: string | null
}

const statusColors: Record<string, string> = {
  IN_STOCK: 'bg-green-100 text-green-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  QUARANTINED: 'bg-yellow-100 text-yellow-800',
  SCRAPPED: 'bg-gray-100 text-gray-800',
}

export default function Units() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [serial, setSerial] = useState(searchParams.get('serial') ?? '')
  const [sku, setSku] = useState('')
  const [results, setResults] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const s = searchParams.get('serial')
    if (s) {
      setSerial(s)
      doSearch(s, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doSearch(serialVal: string, skuVal: string) {
    if (!serialVal.trim() && !skuVal.trim()) return
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (serialVal.trim()) params.serial = serialVal.trim()
      if (skuVal.trim()) params.sku = skuVal.trim()
      const res = await api.get<Unit[]>('/units/search', { params })
      setResults(res.data)
      if (res.data.length === 0) toast('No units found', { icon: 'ℹ️' })
    } catch {
      toast.error('Search failed')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params: Record<string, string> = {}
    if (serial.trim()) params.serial = serial.trim()
    if (sku.trim()) params.sku = sku.trim()
    setSearchParams(params)
    doSearch(serial, sku)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Units Search</h1>

      <div className="card p-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="label">Serial Number</label>
            <input
              type="text"
              value={serial}
              onChange={e => setSerial(e.target.value)}
              className="input"
              placeholder="Search by serial…"
              autoFocus
            />
          </div>
          <div className="flex-1">
            <label className="label">SKU (optional)</label>
            <input
              type="text"
              value={sku}
              onChange={e => setSku(e.target.value)}
              className="input"
              placeholder="Filter by item SKU…"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {results.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="table-header">Serial</th>
                  <th className="table-header">Item</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden sm:table-cell">Location</th>
                  <th className="table-header hidden md:table-cell">Issued To</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {results.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-sm">{u.serial}</td>
                    <td className="table-cell">
                      <div className="font-medium">{u.itemName}</div>
                      <div className="text-xs text-gray-500">{u.sku}</div>
                    </td>
                    <td className="table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          statusColors[u.status] ?? 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="table-cell hidden sm:table-cell text-gray-600">
                      {u.warehouseName && u.locationCode
                        ? `${u.warehouseName} › ${u.locationCode}`
                        : u.locationCode ?? '—'}
                    </td>
                    <td className="table-cell hidden md:table-cell text-gray-600">
                      {u.issuedTo ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

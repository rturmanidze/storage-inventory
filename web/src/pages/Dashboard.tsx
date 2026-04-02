import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface ScanResult {
  serial: string
  itemName: string
  sku: string
  status: string
  location: string | null
  warehouse: string | null
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [serial, setSerial] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [searching, setSearching] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!serial.trim()) return
    setSearching(true)
    setResult(null)
    try {
      const res = await api.get<ScanResult>(`/scan/serial/${encodeURIComponent(serial.trim())}`)
      setResult(res.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(msg ?? 'Serial not found')
    } finally {
      setSearching(false)
    }
  }

  const statusColors: Record<string, string> = {
    AVAILABLE: 'bg-green-100 text-green-800',
    ISSUED: 'bg-blue-100 text-blue-800',
    DAMAGED: 'bg-red-100 text-red-800',
    LOST: 'bg-gray-100 text-gray-800',
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.username} 👋
        </h1>
        <p className="text-gray-500 mt-1">Storage Inventory Management System</p>
      </div>

      {/* Quick search */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Serial Lookup</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={serial}
            onChange={e => setSerial(e.target.value)}
            className="input flex-1"
            placeholder="Enter or scan serial number…"
            autoFocus
          />
          <button
            type="submit"
            disabled={searching}
            className="btn-primary"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {result && (
          <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">{result.itemName}</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  statusColors[result.status] ?? 'bg-gray-100 text-gray-800'
                }`}
              >
                {result.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">SKU: {result.sku}</p>
            <p className="text-sm text-gray-600">Serial: {result.serial}</p>
            {result.location && (
              <p className="text-sm text-gray-600">
                Location: {result.warehouse} › {result.location}
              </p>
            )}
            <button
              className="btn-secondary btn-sm mt-2"
              onClick={() => navigate('/units?serial=' + encodeURIComponent(result.serial))}
            >
              View Details →
            </button>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Receive', emoji: '↩', to: '/movements/receive' },
          { label: 'Transfer', emoji: '⇄', to: '/movements/transfer' },
          { label: 'Issue', emoji: '↗', to: '/movements/issue' },
          { label: 'Return', emoji: '↙', to: '/movements/return' },
        ].map(q => (
          <button
            key={q.to}
            className="card p-4 text-center hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
            onClick={() => navigate(q.to)}
          >
            <div className="text-2xl mb-1">{q.emoji}</div>
            <div className="text-sm font-medium text-gray-700">{q.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

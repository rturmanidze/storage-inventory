import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../api/client'
import BarcodeScanner from '../../components/BarcodeScanner'
import type { IssuedToEntity } from '../IssuedTo'

export default function Issue() {
  const [serials, setSerials] = useState<string[]>([''])
  const [selectedIssuedToId, setSelectedIssuedToId] = useState<number | ''>('')

  const { data: issuedToList = [] } = useQuery<IssuedToEntity[]>({
    queryKey: ['issued-to'],
    queryFn: () => api.get('/issued-to').then(r => r.data),
  })

  const issueMutation = useMutation({
    mutationFn: (payload: { serials: string[]; issuedToId: number }) =>
      api.post('/movements/issue', payload),
    onSuccess: () => {
      toast.success('Issued successfully')
      setSerials([''])
      setSelectedIssuedToId('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(msg ?? 'Issue failed')
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
    if (!selectedIssuedToId) return toast.error('Select an issued-to entity')
    issueMutation.mutate({
      serials: validSerials,
      issuedToId: selectedIssuedToId as number,
    })
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Issue</h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
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
                    className="btn-danger btn-sm"
                    onClick={() => removeSerial(i)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Issued To */}
        <div>
          <label className="label">Issue To</label>
          <select
            className="input"
            value={selectedIssuedToId}
            onChange={e => setSelectedIssuedToId(Number(e.target.value) || '')}
          >
            <option value="">Select entity…</option>
            {issuedToList.map(entity => (
              <option key={entity.id} value={entity.id}>
                {entity.name} ({entity.type})
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="btn-primary"
            disabled={issueMutation.isPending}
          >
            {issueMutation.isPending ? 'Issuing…' : 'Issue'}
          </button>
        </div>
      </form>
    </div>
  )
}

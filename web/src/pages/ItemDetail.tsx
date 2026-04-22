import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import api from '../api/client'
import type { Item } from './Items'

interface Barcode {
  id: number
  value: string
  symbology: string | null
}

const itemSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  unit: z.string().optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  description: z.string().optional(),
})

type ItemForm = z.infer<typeof itemSchema>

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [newBarcode, setNewBarcode] = useState('')
  const [addingBarcode, setAddingBarcode] = useState(false)

  const { data: item, isLoading } = useQuery<Item>({
    queryKey: ['items', id],
    queryFn: () => api.get(`/items/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: barcodes = [] } = useQuery<Barcode[]>({
    queryKey: ['items', id, 'barcodes'],
    queryFn: () => api.get(`/items/${id}/barcodes`).then(r => r.data),
    enabled: !!id,
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    values: item
      ? {
          sku: item.sku,
          name: item.name,
          category: item.category ?? '',
          unit: item.unit ?? '',
          minStock: item.minStock ?? 0,
          description: item.description ?? '',
        }
      : undefined,
  })

  const updateMutation = useMutation({
    mutationFn: (data: ItemForm) => api.patch(`/items/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item updated')
    },
    onError: () => toast.error('Failed to update item'),
  })

  const addBarcodeMutation = useMutation({
    mutationFn: (value: string) =>
      api.post(`/items/${id}/barcodes`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', id, 'barcodes'] })
      setNewBarcode('')
      setAddingBarcode(false)
      toast.success('Barcode added')
    },
    onError: () => toast.error('Failed to add barcode'),
  })

  const deleteBarcodeMutation = useMutation({
    mutationFn: (barcodeId: number) =>
      api.delete(`/items/${id}/barcodes/${barcodeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', id, 'barcodes'] })
      toast.success('Barcode removed')
    },
    onError: () => toast.error('Failed to remove barcode'),
  })

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading…</div>
  }

  if (!item) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 mb-2">Item not found.</p>
        <button className="btn-secondary btn-sm" onClick={() => navigate('/items')}>
          ← Back to Items
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button className="btn-ghost btn-icon" onClick={() => navigate('/items')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="page-title">{item.name}</h1>
          <p className="page-subtitle">SKU: {item.sku}</p>
        </div>
      </div>

      {/* Edit form */}
      <div className="card p-6">
        <h2 className="section-title mb-4">Item Details</h2>
        <form onSubmit={handleSubmit(d => updateMutation.mutate(d))} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">SKU *</label>
              <input {...register('sku')} className="input" />
              {errors.sku && <p className="mt-1 text-xs text-red-600">{errors.sku.message}</p>}
            </div>
            <div>
              <label className="label">Name *</label>
              <input {...register('name')} className="input" />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Category</label>
              <input {...register('category')} className="input" />
            </div>
            <div>
              <label className="label">Unit</label>
              <input {...register('unit')} className="input" placeholder="pcs, kg…" />
            </div>
          </div>
          <div>
            <label className="label">Min Stock</label>
            <input {...register('minStock')} type="number" min="0" className="input" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea {...register('description')} rows={2} className="input" />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || updateMutation.isPending}
              className="btn-primary"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Barcodes */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Barcodes</h2>
          <button
            className="btn-secondary btn-sm"
            onClick={() => setAddingBarcode(true)}
          >
            + Add Barcode
          </button>
        </div>

        {addingBarcode && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newBarcode}
              onChange={e => setNewBarcode(e.target.value)}
              className="input flex-1"
              placeholder="Barcode value…"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (newBarcode.trim()) addBarcodeMutation.mutate(newBarcode.trim())
                }
              }}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={!newBarcode.trim() || addBarcodeMutation.isPending}
              onClick={() => {
                if (newBarcode.trim()) addBarcodeMutation.mutate(newBarcode.trim())
              }}
            >
              Add
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setAddingBarcode(false); setNewBarcode('') }}
            >
              Cancel
            </button>
          </div>
        )}

        {barcodes.length === 0 ? (
          <p className="text-sm text-gray-500">No barcodes assigned to this item.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr>
                <th className="table-header">Value</th>
                <th className="table-header hidden sm:table-cell">Symbology</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {barcodes.map(bc => (
                <tr key={bc.id} className="hover:bg-surface-secondary transition-colors">
                  <td className="table-cell font-mono text-sm">{bc.value}</td>
                  <td className="table-cell hidden sm:table-cell text-gray-500">
                    {bc.symbology ?? '—'}
                  </td>
                  <td className="table-cell">
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => {
                        if (confirm('Remove this barcode?')) {
                          deleteBarcodeMutation.mutate(bc.id)
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

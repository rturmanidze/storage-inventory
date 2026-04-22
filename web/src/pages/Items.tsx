import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/client'

export interface Item {
  id: number
  sku: string
  name: string
  category: string | null
  unit: string | null
  minStock: number | null
  description: string | null
  supplier: string | null
  batch: string | null
}

const itemSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  supplier: z.string().optional(),
  batch: z.string().optional(),
  unit: z.string().optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  description: z.string().optional(),
})

type ItemForm = z.infer<typeof itemSchema>

export default function Items() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [showLowStock, setShowLowStock] = useState(searchParams.get('lowStock') === 'true')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ['items', showLowStock],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (showLowStock) params.lowStock = 'true'
      return api.get('/items', { params }).then(r => r.data)
    },
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ItemForm>({ resolver: zodResolver(itemSchema) })

  const createMutation = useMutation({
    mutationFn: (data: ItemForm) => api.post('/items', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item created')
      closeModal()
    },
    onError: () => toast.error('Failed to create item'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ItemForm }) => api.patch(`/items/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item updated')
      closeModal()
    },
    onError: () => toast.error('Failed to update item'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      toast.success('Item deleted')
    },
    onError: () => toast.error('Failed to delete item'),
  })

  function openCreate() {
    setEditing(null)
    reset({ sku: '', name: '', category: '', supplier: '', batch: '', unit: '', minStock: 0, description: '' })
    setModalOpen(true)
  }

  function openEdit(item: Item) {
    setEditing(item)
    reset({
      sku: item.sku,
      name: item.name,
      category: item.category ?? '',
      supplier: item.supplier ?? '',
      batch: item.batch ?? '',
      unit: item.unit ?? '',
      minStock: item.minStock ?? 0,
      description: item.description ?? '',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    reset()
  }

  async function onSubmit(data: ItemForm) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const filtered = items.filter(
    i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Inventory Items</h1>
          <p className="page-subtitle">{items.length} items registered</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Item
        </button>
      </div>

      {/* Search & Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9"
              placeholder="Search by name or SKU…"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowLowStock(v => !v)}
            className={`btn-sm flex items-center gap-1.5 ${showLowStock ? 'btn-primary' : 'btn-secondary'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {showLowStock ? 'Showing Low Stock' : 'Low Stock Only'}
          </button>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading items…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
              <p className="text-sm text-gray-400">No items found</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr>
                  <th className="table-header">SKU</th>
                  <th className="table-header">Name</th>
                  <th className="table-header hidden sm:table-cell">Category</th>
                  <th className="table-header hidden md:table-cell">Supplier</th>
                  <th className="table-header hidden lg:table-cell">Batch</th>
                  <th className="table-header hidden sm:table-cell">Unit</th>
                  <th className="table-header hidden md:table-cell">Min Stock</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-surface-secondary transition-colors">
                    <td className="table-cell font-mono text-xs text-gray-500">{item.sku}</td>
                    <td className="table-cell">
                      <button
                        className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
                        onClick={() => navigate(`/items/${item.id}`)}
                      >
                        {item.name}
                      </button>
                    </td>
                    <td className="table-cell hidden sm:table-cell text-gray-500">{item.category ?? '—'}</td>
                    <td className="table-cell hidden md:table-cell text-gray-500">{item.supplier ?? '—'}</td>
                    <td className="table-cell hidden lg:table-cell text-gray-500">{item.batch ?? '—'}</td>
                    <td className="table-cell hidden sm:table-cell text-gray-500">{item.unit ?? '—'}</td>
                    <td className="table-cell hidden md:table-cell text-gray-500">{item.minStock ?? '—'}</td>
                    <td className="table-cell text-right">
                      <div className="flex gap-1.5 justify-end">
                        <button className="btn-secondary btn-sm" onClick={() => openEdit(item)}>
                          Edit
                        </button>
                        <button
                          className="btn-ghost btn-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (confirm(`Delete item "${item.name}"?`)) {
                              deleteMutation.mutate(item.id)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Item' : 'Add Item'}</h2>
              <button onClick={closeModal} className="btn-icon">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">SKU *</label>
                  <input {...register('sku')} className="input" disabled={!!editing} />
                  {errors.sku && <p className="mt-1 text-xs text-red-600">{errors.sku.message}</p>}
                </div>
                <div>
                  <label className="label">Name *</label>
                  <input {...register('name')} className="input" />
                  {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                </div>
              </div>
              <div>
                <label className="label">Category</label>
                <select {...register('category')} className="input">
                  <option value="">— select —</option>
                  {[
                    'Playing Cards',
                    'Casino Chips',
                    'Dice',
                    'Roulette Equipment',
                    'Slot Machine Parts',
                    'Table Felt',
                    'Shuffling Machines',
                    'Security Equipment',
                    'Other Equipment',
                  ].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Supplier</label>
                  <input {...register('supplier')} className="input" placeholder="Supplier name" />
                </div>
                <div>
                  <label className="label">Batch / Lot #</label>
                  <input {...register('batch')} className="input" placeholder="e.g. LOT-2024-01" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Unit</label>
                  <input {...register('unit')} className="input" placeholder="pcs, decks, sets…" />
                </div>
                <div>
                  <label className="label">Min Stock Alert</label>
                  <input {...register('minStock')} type="number" min="0" className="input" />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea {...register('description')} rows={2} className="input" placeholder="Optional notes about this item…" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
                  className="btn-primary"
                >
                  {editing ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

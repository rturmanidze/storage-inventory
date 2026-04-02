import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
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

export default function Items() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: () => api.get('/items').then(r => r.data),
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
    reset({ sku: '', name: '', category: '', unit: '', minStock: 0, description: '' })
    setModalOpen(true)
  }

  function openEdit(item: Item) {
    setEditing(item)
    reset({
      sku: item.sku,
      name: item.name,
      category: item.category ?? '',
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Items</h1>
        <button className="btn-primary" onClick={openCreate}>
          + Add Item
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input max-w-xs"
            placeholder="Search by name or SKU…"
          />
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No items found.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="table-header">SKU</th>
                  <th className="table-header">Name</th>
                  <th className="table-header hidden sm:table-cell">Category</th>
                  <th className="table-header hidden sm:table-cell">Unit</th>
                  <th className="table-header hidden md:table-cell">Min Stock</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-xs">{item.sku}</td>
                    <td className="table-cell">
                      <button
                        className="text-indigo-600 hover:underline font-medium"
                        onClick={() => navigate(`/items/${item.id}`)}
                      >
                        {item.name}
                      </button>
                    </td>
                    <td className="table-cell hidden sm:table-cell">{item.category ?? '—'}</td>
                    <td className="table-cell hidden sm:table-cell">{item.unit ?? '—'}</td>
                    <td className="table-cell hidden md:table-cell">{item.minStock ?? '—'}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openEdit(item)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger btn-sm"
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editing ? 'Edit Item' : 'Add Item'}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="flex justify-end gap-2 pt-2">
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

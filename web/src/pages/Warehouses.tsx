import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api/client'

export interface Warehouse {
  id: number
  code: string
  name: string
  address: string | null
}

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
})

type WarehouseForm = z.infer<typeof schema>

export default function Warehouses() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)

  const { data: warehouses = [], isLoading } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/warehouses').then(r => r.data),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseForm>({ resolver: zodResolver(schema) })

  const createMutation = useMutation({
    mutationFn: (data: WarehouseForm) => api.post('/warehouses', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success('Warehouse created')
      closeModal()
    },
    onError: () => toast.error('Failed to create warehouse'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: WarehouseForm }) =>
      api.patch(`/warehouses/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success('Warehouse updated')
      closeModal()
    },
    onError: () => toast.error('Failed to update warehouse'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/warehouses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success('Warehouse deleted')
    },
    onError: () => toast.error('Failed to delete warehouse'),
  })

  function openCreate() {
    setEditing(null)
    reset({ code: '', name: '', address: '' })
    setModalOpen(true)
  }

  function openEdit(w: Warehouse) {
    setEditing(w)
    reset({ code: w.code, name: w.name, address: w.address ?? '' })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    reset()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Warehouses</h1>
        <button className="btn-primary" onClick={openCreate}>
          + Add Warehouse
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : warehouses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No warehouses found.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="table-header">Code</th>
                  <th className="table-header">Name</th>
                  <th className="table-header hidden sm:table-cell">Address</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {warehouses.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-xs">{w.code}</td>
                    <td className="table-cell">
                      <button
                        className="text-indigo-600 hover:underline font-medium"
                        onClick={() => navigate(`/warehouses/${w.id}/locations`)}
                      >
                        {w.name}
                      </button>
                    </td>
                    <td className="table-cell hidden sm:table-cell text-gray-500">
                      {w.address ?? '—'}
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() =>
                            navigate(`/warehouses/${w.id}/locations`)
                          }
                        >
                          Locations
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openEdit(w)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => {
                            if (confirm(`Delete warehouse "${w.name}"?`)) {
                              deleteMutation.mutate(w.id)
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

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">
              {editing ? 'Edit Warehouse' : 'Add Warehouse'}
            </h2>
            <form onSubmit={handleSubmit(d => editing ? updateMutation.mutate({ id: editing.id, data: d }) : createMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="label">Code *</label>
                <input {...register('code')} className="input" />
                {errors.code && (
                  <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>
                )}
              </div>
              <div>
                <label className="label">Name *</label>
                <input {...register('name')} className="input" />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="label">Address</label>
                <input {...register('address')} className="input" />
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
                  {editing ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

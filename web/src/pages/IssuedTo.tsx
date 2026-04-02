import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import api from '../api/client'

export interface IssuedToEntity {
  id: number
  name: string
  type: 'PERSON' | 'DEPT' | 'CUSTOMER'
  reference: string | null
}

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['PERSON', 'DEPT', 'CUSTOMER']),
  reference: z.string().optional(),
})

type IssuedToForm = z.infer<typeof schema>

const typeColors: Record<string, string> = {
  PERSON: 'bg-blue-100 text-blue-800',
  DEPT: 'bg-purple-100 text-purple-800',
  CUSTOMER: 'bg-green-100 text-green-800',
}

export default function IssuedTo() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IssuedToEntity | null>(null)

  const { data: entities = [], isLoading } = useQuery<IssuedToEntity[]>({
    queryKey: ['issued-to'],
    queryFn: () => api.get('/issued-to').then(r => r.data),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IssuedToForm>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'PERSON' },
  })

  const createMutation = useMutation({
    mutationFn: (data: IssuedToForm) => api.post('/issued-to', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issued-to'] })
      toast.success('Created')
      closeModal()
    },
    onError: () => toast.error('Failed to create'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: IssuedToForm }) =>
      api.patch(`/issued-to/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issued-to'] })
      toast.success('Updated')
      closeModal()
    },
    onError: () => toast.error('Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/issued-to/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issued-to'] })
      toast.success('Deleted')
    },
    onError: () => toast.error('Failed to delete'),
  })

  function openCreate() {
    setEditing(null)
    reset({ name: '', type: 'PERSON', reference: '' })
    setModalOpen(true)
  }

  function openEdit(e: IssuedToEntity) {
    setEditing(e)
    reset({ name: e.name, type: e.type, reference: e.reference ?? '' })
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
        <h1 className="text-2xl font-bold text-gray-900">Issued To</h1>
        <button className="btn-primary" onClick={openCreate}>
          + Add
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : entities.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No entities found.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Type</th>
                  <th className="table-header hidden sm:table-cell">Reference</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {entities.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{e.name}</td>
                    <td className="table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          typeColors[e.type] ?? 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="table-cell hidden sm:table-cell text-gray-500">
                      {e.reference ?? '—'}
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button className="btn-secondary btn-sm" onClick={() => openEdit(e)}>
                          Edit
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => {
                            if (confirm(`Delete "${e.name}"?`)) deleteMutation.mutate(e.id)
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
          <div className="card p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">
              {editing ? 'Edit Entity' : 'Add Entity'}
            </h2>
            <form
              onSubmit={handleSubmit(d =>
                editing
                  ? updateMutation.mutate({ id: editing.id, data: d })
                  : createMutation.mutate(d),
              )}
              className="space-y-3"
            >
              <div>
                <label className="label">Name *</label>
                <input {...register('name')} className="input" />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="label">Type *</label>
                <select {...register('type')} className="input">
                  <option value="PERSON">Person</option>
                  <option value="DEPT">Department</option>
                  <option value="CUSTOMER">Customer</option>
                </select>
              </div>
              <div>
                <label className="label">Reference</label>
                <input {...register('reference')} className="input" placeholder="ID, code…" />
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

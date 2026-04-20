import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Studio {
  id: number
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

type StudioForm = z.infer<typeof schema>

export default function Studios() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Studio | null>(null)
  const canEdit = user?.role === 'ADMIN' || user?.role === 'MANAGER'
  const canDelete = user?.role === 'ADMIN'

  const { data: studios = [], isLoading } = useQuery<Studio[]>({
    queryKey: ['studios'],
    queryFn: () => api.get('/studios').then(r => r.data),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StudioForm>({ resolver: zodResolver(schema) })

  const createMutation = useMutation({
    mutationFn: (data: StudioForm) => api.post('/studios', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studios'] })
      toast.success('Studio created')
      closeModal()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to create studio'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: StudioForm }) =>
      api.put(`/studios/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studios'] })
      toast.success('Studio updated')
      closeModal()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to update studio'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/studios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studios'] })
      toast.success('Studio deleted')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Failed to delete studio'),
  })

  function openCreate() {
    setEditing(null)
    reset({ name: '', description: '' })
    setModalOpen(true)
  }

  function openEdit(s: Studio) {
    setEditing(s)
    reset({ name: s.name, description: s.description ?? '' })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    reset()
  }

  function onSubmit(data: StudioForm) {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  function handleDelete(s: Studio) {
    if (!confirm(`Delete studio "${s.name}"? Shoes sent to this studio will be unlinked.`)) return
    deleteMutation.mutate(s.id)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Studios</h1>
          <p className="page-subtitle">Manage casino studio destinations for card shoes</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openCreate}>
            + New Studio
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-gray-400">
          <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : studios.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
          <p className="text-sm font-medium text-gray-500">No studios yet</p>
          {canEdit && (
            <button className="mt-3 btn-primary btn-sm" onClick={openCreate}>Create First Studio</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {studios.map(studio => (
            <div key={studio.id} className="card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{studio.name}</h3>
                  {studio.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{studio.description}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {canEdit && (
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => openEdit(studio)}
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                      </svg>
                    </button>
                  )}
                  {canDelete && (
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDelete(studio)}
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Created {new Date(studio.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="modal-content w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">
                {editing ? 'Edit Studio' : 'New Studio'}
              </h2>
              <button className="btn-ghost btn-sm" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Studio Name</label>
                <input
                  {...register('name')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. Studio 1"
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  {...register('description')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Brief description…"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-ghost flex-1" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={isSubmitting}>
                  {editing ? 'Save Changes' : 'Create Studio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

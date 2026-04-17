import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import api from '../api/client'
import type { Warehouse } from './Warehouses'

export interface Location {
  id: number
  code: string
  description: string | null
  warehouseId: number
}

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  description: z.string().optional(),
})

type LocationForm = z.infer<typeof schema>

export default function Locations() {
  const { id: warehouseId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)

  const { data: warehouse } = useQuery<Warehouse>({
    queryKey: ['warehouses', warehouseId],
    queryFn: () => api.get(`/warehouses/${warehouseId}`).then(r => r.data),
    enabled: !!warehouseId,
  })

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['warehouses', warehouseId, 'locations'],
    queryFn: () =>
      api.get(`/warehouses/${warehouseId}/locations`).then(r => r.data),
    enabled: !!warehouseId,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LocationForm>({ resolver: zodResolver(schema) })

  const createMutation = useMutation({
    mutationFn: (data: LocationForm) =>
      api.post(`/warehouses/${warehouseId}/locations`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses', warehouseId, 'locations'] })
      toast.success('Location created')
      closeModal()
    },
    onError: () => toast.error('Failed to create location'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: LocationForm }) =>
      api.patch(`/warehouses/${warehouseId}/locations/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses', warehouseId, 'locations'] })
      toast.success('Location updated')
      closeModal()
    },
    onError: () => toast.error('Failed to update location'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/warehouses/${warehouseId}/locations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses', warehouseId, 'locations'] })
      toast.success('Location deleted')
    },
    onError: () => toast.error('Failed to delete location'),
  })

  function openCreate() {
    setEditing(null)
    reset({ code: '', description: '' })
    setModalOpen(true)
  }

  function openEdit(loc: Location) {
    setEditing(loc)
    reset({ code: loc.code, description: loc.description ?? '' })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    reset()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost btn-icon" onClick={() => navigate('/warehouses')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="page-title">
            {warehouse?.name ?? 'Warehouse'} — Locations
          </h1>
          <p className="page-subtitle">Code: {warehouse?.code}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={openCreate}>
          <svg className="w-4 h-4 mr-1.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Location
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : locations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No locations yet.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr>
                  <th className="table-header">Code</th>
                  <th className="table-header">Description</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {locations.map(loc => (
                  <tr key={loc.id} className="hover:bg-surface-secondary transition-colors">
                    <td className="table-cell font-mono text-sm">{loc.code}</td>
                    <td className="table-cell text-gray-600">{loc.description ?? '—'}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openEdit(loc)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => {
                            if (confirm(`Delete location "${loc.code}"?`)) {
                              deleteMutation.mutate(loc.id)
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
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">
              {editing ? 'Edit Location' : 'Add Location'}
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
                <label className="label">Code *</label>
                <input {...register('code')} className="input" placeholder="e.g. A-01-01" />
                {errors.code && (
                  <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>
                )}
              </div>
              <div>
                <label className="label">Description</label>
                <input {...register('description')} className="input" />
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

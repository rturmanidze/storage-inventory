import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const ROLES = ['ADMIN', 'MANAGER', 'VIEWER'] as const
type Role = (typeof ROLES)[number]

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Shift Manager',
  VIEWER: 'Operations Manager',
}

interface UserRecord {
  id: number
  username: string
  email: string
  role: Role
  createdAt: string
  updatedAt: string
}

const createSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(ROLES),
})

const editSchema = z.object({
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  role: z.enum(ROLES),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
})

const changePwSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine(d => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type CreateForm = z.infer<typeof createSchema>
type EditForm = z.infer<typeof editSchema>
type ChangePwForm = z.infer<typeof changePwSchema>

export default function Users() {
  const qc = useQueryClient()
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'ADMIN'

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)

  const { data: users = [], isLoading } = useQuery<UserRecord[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  })

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { username: '', email: '', password: '', role: 'VIEWER' },
  })

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  })

  const changePwForm = useForm<ChangePwForm>({
    resolver: zodResolver(changePwSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created')
      closeModal()
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? 'Failed to create user'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditForm }) =>
      api.patch(`/users/${id}`, {
        role: data.role,
        email: data.email || undefined,
        password: data.password || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated')
      closeModal()
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? 'Failed to update user'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted')
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? 'Failed to delete user'),
  })

  const changeOwnPasswordMutation = useMutation({
    mutationFn: (data: ChangePwForm) =>
      api.patch('/users/me', {
        current_password: data.currentPassword,
        new_password: data.newPassword,
      }),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setChangePasswordOpen(false)
      changePwForm.reset()
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail ?? 'Failed to change password'),
  })

  function openCreate() {
    setEditing(null)
    createForm.reset({ username: '', email: '', password: '', role: 'VIEWER' })
    setModalOpen(true)
  }

  function openEdit(u: UserRecord) {
    setEditing(u)
    editForm.reset({ email: u.email, role: u.role, password: '' })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    createForm.reset()
    editForm.reset()
  }

  function openChangePassword() {
    changePwForm.reset()
    setChangePasswordOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        {isAdmin && (
          <button className="btn-primary" onClick={openCreate}>
            + Add User
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No users found.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="table-header">Username</th>
                  <th className="table-header hidden sm:table-cell">Email</th>
                  <th className="table-header">Role</th>
                  <th className="table-header hidden md:table-cell">Created</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{u.username}</td>
                    <td className="table-cell hidden sm:table-cell text-gray-500">{u.email}</td>
                    <td className="table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.role === 'ADMIN'
                            ? 'bg-red-100 text-red-800'
                            : u.role === 'MANAGER'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="table-cell hidden md:table-cell text-gray-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2 flex-wrap">
                        {u.id === currentUser?.id && (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={openChangePassword}
                          >
                            Change Password
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => openEdit(u)}
                          >
                            Edit
                          </button>
                        )}
                        {isAdmin && u.id !== currentUser?.id && (
                          <button
                            className="btn-danger btn-sm"
                            onClick={() => {
                              if (confirm(`Delete user "${u.username}"?`)) {
                                deleteMutation.mutate(u.id)
                              }
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">
              {editing ? `Edit "${editing.username}"` : 'Add User'}
            </h2>

            {editing ? (
              <form
                onSubmit={editForm.handleSubmit(d =>
                  updateMutation.mutate({ id: editing.id, data: d }),
                )}
                className="space-y-3"
              >
                <div>
                  <label className="label">Email</label>
                  <input {...editForm.register('email')} className="input" />
                  {editForm.formState.errors.email && (
                    <p className="mt-1 text-xs text-red-600">
                      {editForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Role</label>
                  <select {...editForm.register('role')} className="input">
                    {ROLES.map(r => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">
                    New Password{' '}
                    <span className="text-gray-400">(leave blank to keep)</span>
                  </label>
                  <input
                    {...editForm.register('password')}
                    type="password"
                    className="input"
                    placeholder="••••••••"
                  />
                  {editForm.formState.errors.password && (
                    <p className="mt-1 text-xs text-red-600">
                      {editForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="btn-primary"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={createForm.handleSubmit(d => createMutation.mutate(d))}
                className="space-y-3"
              >
                <div>
                  <label className="label">Username *</label>
                  <input {...createForm.register('username')} className="input" />
                  {createForm.formState.errors.username && (
                    <p className="mt-1 text-xs text-red-600">
                      {createForm.formState.errors.username.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input {...createForm.register('email')} type="email" className="input" />
                  {createForm.formState.errors.email && (
                    <p className="mt-1 text-xs text-red-600">
                      {createForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Password *</label>
                  <input
                    {...createForm.register('password')}
                    type="password"
                    className="input"
                    placeholder="••••••••"
                  />
                  {createForm.formState.errors.password && (
                    <p className="mt-1 text-xs text-red-600">
                      {createForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label">Role</label>
                  <select {...createForm.register('role')} className="input">
                    {ROLES.map(r => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="btn-primary"
                  >
                    Create User
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Change Password modal (own account) */}
      {changePasswordOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Change Password</h2>
            <form
              onSubmit={changePwForm.handleSubmit(d =>
                changeOwnPasswordMutation.mutate(d),
              )}
              className="space-y-3"
            >
              <div>
                <label className="label">Current Password</label>
                <input
                  {...changePwForm.register('currentPassword')}
                  type="password"
                  className="input"
                  placeholder="••••••••"
                />
                {changePwForm.formState.errors.currentPassword && (
                  <p className="mt-1 text-xs text-red-600">
                    {changePwForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>
              <div>
                <label className="label">New Password</label>
                <input
                  {...changePwForm.register('newPassword')}
                  type="password"
                  className="input"
                  placeholder="••••••••"
                />
                {changePwForm.formState.errors.newPassword && (
                  <p className="mt-1 text-xs text-red-600">
                    {changePwForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input
                  {...changePwForm.register('confirmPassword')}
                  type="password"
                  className="input"
                  placeholder="••••••••"
                />
                {changePwForm.formState.errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-600">
                    {changePwForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setChangePasswordOpen(false)
                    changePwForm.reset()
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changeOwnPasswordMutation.isPending}
                  className="btn-primary"
                >
                  Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

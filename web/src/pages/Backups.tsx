import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../api/client'

interface BackupInfo {
  filename: string
  date_dir: string
  path: string
  size_bytes: number
  created_at: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(iso: string): string {
  return new Date(iso + 'Z').toLocaleString()
}

export default function Backups() {
  const qc = useQueryClient()
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BackupInfo | null>(null)
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)

  const { data: backups = [], isLoading, isError } = useQuery<BackupInfo[]>({
    queryKey: ['backups'],
    queryFn: () => api.get('/backups').then(r => r.data),
    refetchInterval: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/backups'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      toast.success('Backup created successfully')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Backup failed'),
  })

  const restoreMutation = useMutation({
    mutationFn: ({ date_dir, filename }: { date_dir: string; filename: string }) =>
      api.post(`/backups/restore/${date_dir}/${filename}`, { confirmed: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      toast.success('Database restored successfully')
      setRestoreTarget(null)
      setRestoreConfirmed(false)
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.detail ?? 'Restore failed')
      setRestoreTarget(null)
      setRestoreConfirmed(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ date_dir, filename }: { date_dir: string; filename: string }) =>
      api.delete(`/backups/${date_dir}/${filename}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      toast.success('Backup deleted')
      setDeleteTarget(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'Delete failed'),
  })

  function handleDownload(backup: BackupInfo) {
    window.open(`/api/backups/download/${backup.date_dir}/${backup.filename}`, '_blank')
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Backups &amp; Restore</h1>
          <p className="page-subtitle">
            Automated daily backups at 02:00 UTC — Admin access only
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating…
            </span>
          ) : '+ Create Backup Now'}
        </button>
      </div>

      {/* Info banner */}
      <div className="card p-4 bg-indigo-50 border border-indigo-100">
        <div className="flex gap-3 text-sm text-indigo-800">
          <svg className="w-5 h-5 shrink-0 mt-0.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <div className="space-y-1">
            <p className="font-semibold">Backup Policy</p>
            <ul className="text-xs space-y-0.5 text-indigo-700">
              <li>• Automatic daily backups run at <strong>02:00 UTC</strong></li>
              <li>• Backups are retained for <strong>30 days</strong> by default</li>
              <li>• Each backup includes all tables: decks, shoes, studios, audit logs, users</li>
              <li>• Restore replaces <strong>all current data</strong> — use with caution</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Backup list */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : isError ? (
          <div className="text-center py-10 text-rose-500 text-sm">
            Failed to load backups. Check server logs.
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No backups found.
            <div className="mt-3">
              <button
                className="btn-primary btn-sm"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Create First Backup
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Filename</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Size</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {backups.map(b => (
                <tr key={b.path} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{b.filename}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                    {formatDate(b.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatBytes(b.size_bytes)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end flex-wrap">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => handleDownload(b)}
                      >
                        Download
                      </button>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => { setRestoreTarget(b); setRestoreConfirmed(false) }}
                      >
                        Restore
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => setDeleteTarget(b)}
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

      {/* Restore Confirmation Modal */}
      {restoreTarget && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setRestoreTarget(null)
              setRestoreConfirmed(false)
            }
          }}
        >
          <div className="modal-content w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Restore Database</h2>
              <button
                className="btn-ghost btn-sm"
                onClick={() => { setRestoreTarget(null); setRestoreConfirmed(false) }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 font-mono">
                {restoreTarget.filename}
              </div>
              <div className="bg-rose-50 rounded-lg p-4 text-sm text-rose-800">
                <p className="font-semibold mb-2">⚠️ Warning — Destructive Operation</p>
                <ul className="text-xs space-y-1 text-rose-700">
                  <li>• This will <strong>replace ALL current data</strong> with the backup</li>
                  <li>• Any changes made after this backup was created will be lost</li>
                  <li>• The system will be temporarily unavailable during restore</li>
                  <li>• This action <strong>cannot be undone</strong></li>
                </ul>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreConfirmed}
                  onChange={e => setRestoreConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">
                  I understand this will permanently overwrite the current database and cannot be undone.
                </span>
              </label>
              <div className="flex gap-3 pt-1">
                <button
                  className="btn-ghost flex-1"
                  onClick={() => { setRestoreTarget(null); setRestoreConfirmed(false) }}
                >
                  Cancel
                </button>
                <button
                  className="btn-danger flex-1"
                  disabled={!restoreConfirmed || restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate({
                    date_dir: restoreTarget.date_dir,
                    filename: restoreTarget.filename,
                  })}
                >
                  {restoreMutation.isPending ? 'Restoring…' : 'Restore Database'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null) }}
        >
          <div className="modal-content w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Delete Backup</h2>
              <button className="btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to permanently delete{' '}
                <span className="font-mono font-semibold text-gray-800">{deleteTarget.filename}</span>?
              </p>
              <div className="flex gap-3 pt-1">
                <button className="btn-ghost flex-1" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button
                  className="btn-danger flex-1"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({
                    date_dir: deleteTarget.date_dir,
                    filename: deleteTarget.filename,
                  })}
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

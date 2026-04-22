import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '../api/client'

type ImportType = 'items' | 'locations' | 'barcodes' | 'units' | 'placements'

interface ImportError {
  row: number
  message: string
}

interface ImportResult {
  success: number
  errors: ImportError[]
}

const importTypes: { value: ImportType; label: string; hint: string }[] = [
  { value: 'items', label: 'Items', hint: 'CSV/XLSX: sku, name, category, unit, minStock, description' },
  { value: 'locations', label: 'Locations', hint: 'CSV/XLSX: warehouseCode, code, description' },
  { value: 'barcodes', label: 'Barcodes', hint: 'CSV/XLSX: sku, barcode, symbology' },
  { value: 'units', label: 'Units', hint: 'CSV/XLSX: sku, serial, status' },
  { value: 'placements', label: 'Placements', hint: 'CSV/XLSX: serial, warehouseCode, locationCode' },
]

export default function Import() {
  const [activeTab, setActiveTab] = useState<ImportType>('items')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return toast.error('Select a file first')

    const formData = new FormData()
    formData.append('file', file)

    setUploading(true)
    setResult(null)
    try {
      const res = await api.post<ImportResult>(`/import/${activeTab}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
      if (res.data.errors.length === 0) {
        toast.success(`Imported ${res.data.success} record(s)`)
      } else {
        toast(`Imported ${res.data.success} record(s) with ${res.data.errors.length} error(s)`, {
          icon: '⚠️',
        })
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(msg ?? 'Import failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const activeTypeInfo = importTypes.find(t => t.value === activeTab)!

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="page-title">Import</h1>
        <p className="page-subtitle">Bulk import data from CSV or XLSX files</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-100 pb-0">
        {importTypes.map(t => (
          <button
            key={t.value}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-px ${
              activeTab === t.value
                ? 'border-primary-600 text-primary-700 bg-primary-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => {
              setActiveTab(t.value)
              setResult(null)
              if (fileRef.current) fileRef.current.value = ''
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Upload form */}
      <div className="card p-6">
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-medium">Format:</span> {activeTypeInfo.hint}
        </p>

        <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="label">File (CSV or XLSX)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="btn-primary shrink-0"
          >
            {uploading ? 'Uploading…' : 'Upload & Import'}
          </button>
        </form>
      </div>

      {/* Results */}
      {result && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{result.success}</div>
              <div className="text-xs text-gray-500 mt-0.5">Records imported</div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${result.errors.length > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                {result.errors.length}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Errors</div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div>
              <h3 className="section-title mb-2">Error Details</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead>
                    <tr>
                      <th className="table-header w-16">Row</th>
                      <th className="table-header">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.errors.map((err, i) => (
                      <tr key={i} className="bg-red-50">
                        <td className="table-cell font-mono">{err.row}</td>
                        <td className="table-cell text-red-700">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

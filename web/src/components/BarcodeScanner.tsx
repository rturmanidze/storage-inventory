import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface BarcodeScannerProps {
  onScan: (value: string) => void
  buttonLabel?: string
}

export default function BarcodeScanner({ onScan, buttonLabel = 'Scan with Camera' }: BarcodeScannerProps) {
  const [open, setOpen] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerId = 'qr-reader-' + Math.random().toString(36).slice(2)
  const containerIdRef = useRef(containerId)

  useEffect(() => {
    if (!open) return

    const id = containerIdRef.current
    const scanner = new Html5Qrcode(id)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          onScan(decodedText)
          stopScanner()
        },
        undefined,
      )
      .catch(err => {
        console.error('Camera start error:', err)
        stopScanner()
      })

    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function stopScanner() {
    const s = scannerRef.current
    if (s) {
      s.isScanning
        ? s.stop().then(() => s.clear()).catch(() => s.clear())
        : s.clear()
      scannerRef.current = null
    }
    setOpen(false)
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        📷 {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-800">Scan Barcode / QR Code</h3>
              <button
                type="button"
                onClick={stopScanner}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                aria-label="Close scanner"
              >
                ✕
              </button>
            </div>
            <div id={containerIdRef.current} className="w-full" />
            <div className="px-4 py-3 text-center">
              <button type="button" className="btn-secondary btn-sm" onClick={stopScanner}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

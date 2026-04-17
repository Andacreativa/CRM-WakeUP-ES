'use client'

import { useEffect, useState } from 'react'
import { X, Copy, Check } from 'lucide-react'

interface Field {
  label: string
  value: string
}

const FIELDS: Field[] = [
  { label: 'Ragione sociale', value: 'ANDA AGENCIA DE PUBLICIDAD SL' },
  { label: 'Indirizzo', value: 'Avenida Quinto Centenario, 23 - Piso 2 Int 21' },
  { label: 'Località', value: '38683, Puerto de Santiago (Santa Cruz de Tenerife)' },
  { label: 'NIF', value: 'B16451536' },
  { label: 'Email', value: 'info@andacreativa.com' },
  { label: 'IBAN BBVA', value: 'ES9301820205970202087468' },
]

export default function CompanyInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(value)
      setTimeout(() => setCopied(null), 1500)
    } catch (err) {
      console.error('copy failed', err)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Dati aziendali</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2" style={{ textAlign: 'left' }}>
          {FIELDS.map(f => (
            <div
              key={f.value}
              className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
              style={{ textAlign: 'left' }}
            >
              <div className="flex-1 min-w-0" style={{ textAlign: 'left' }}>
                <p
                  className="text-[10px] uppercase tracking-wide text-gray-400 font-medium"
                  style={{ textAlign: 'left' }}
                >
                  {f.label}
                </p>
                <p
                  className="text-xs text-gray-800 break-words"
                  style={{ textAlign: 'left', wordBreak: 'break-word' }}
                >
                  {f.value}
                </p>
              </div>
              <button
                onClick={() => copy(f.value)}
                className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Copia"
                aria-label={`Copia ${f.label}`}
              >
                {copied === f.value
                  ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                  : <Copy className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

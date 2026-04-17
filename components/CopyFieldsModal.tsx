'use client'

import { useEffect, useState } from 'react'
import { X, Copy, Check } from 'lucide-react'

export interface CopyField {
  label: string
  value: string | null | undefined
}

interface Props {
  open: boolean
  onClose: () => void
  title: string
  fields: CopyField[]
}

export default function CopyFieldsModal({ open, onClose, title, fields }: Props) {
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

  const visibleFields = fields.filter(f => f.value && String(f.value).trim() !== '')

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {visibleFields.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Nessun dato disponibile</p>
        ) : (
          <div className="space-y-2" style={{ textAlign: 'left' }}>
            {visibleFields.map(f => {
              const v = String(f.value)
              return (
                <div
                  key={f.label}
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
                      {v}
                    </p>
                  </div>
                  <button
                    onClick={() => copy(v)}
                    className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    title="Copia"
                    aria-label={`Copia ${f.label}`}
                  >
                    {copied === v
                      ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                      : <Copy className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

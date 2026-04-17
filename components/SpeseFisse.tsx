'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { fmt } from '@/lib/constants'

interface SpesaFissa {
  id: number
  tipo: string
  cadenza: string
  dataPagamento: string
  costo: number
  costoMensile: number
}

const CADENZE = ['MENSILE', 'TRIMESTRALE', 'QUADRIMESTRALE', 'SEMESTRALE', "UNA VOLTA ALL'ANNO"]

// Parse "1.780,95" → 1780.95. Parse "1780.95" → 1780.95. Parse "" → 0.
function parseEU(input: string): number {
  if (!input) return 0
  const cleaned = String(input).trim().replace(/\./g, '').replace(/,/g, '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

// Format number to "1.780,95" (no currency symbol)
function formatEU(n: number): string {
  const abs = Math.abs(n)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}${intWithSep},${decPart}`
}

export default function SpeseFisse() {
  const [rows, setRows] = useState<SpesaFissa[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await (await fetch('/api/spese-fisse')).json()) as any
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('load spese fisse', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const updateRow = async (id: number, patch: Partial<SpesaFissa>) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    await fetch(`/api/spese-fisse/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  const addRow = async () => {
    const res = await fetch('/api/spese-fisse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'Nuova spesa', cadenza: 'MENSILE', dataPagamento: '', costo: 0, costoMensile: 0 }),
    })
    const row = await res.json()
    if (row?.id) setRows(rs => [...rs, row])
  }

  const delRow = async (id: number) => {
    if (!confirm('Eliminare questa spesa fissa?')) return
    setRows(rs => rs.filter(r => r.id !== id))
    await fetch(`/api/spese-fisse/${id}`, { method: 'DELETE' })
  }

  const totMensile = rows.reduce((s, r) => s + (Number(r.costoMensile) || 0), 0)

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">Spese Fisse</h2>
          <p className="text-xs text-gray-500 mt-0.5">Modificabili direttamente nella tabella</p>
        </div>
        <button
          onClick={addRow}
          className="glass-btn-primary flex items-center gap-2 text-white text-xs font-medium px-3 py-2 rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" /> Aggiungi riga
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Tipo di Spesa', 'Cadenza', 'Data Pagamento', 'Costo', 'Costo Mensile', ''].map((h, i) => (
                <th
                  key={h}
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2.5 ${
                    i === 3 || i === 4 ? 'text-right' : 'text-left'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center text-gray-400 py-8 text-sm">Caricamento...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-gray-400 py-8 text-sm">Nessuna spesa fissa</td></tr>
            )}
            {rows.map(r => (
              <EditableRow key={r.id} row={r} onUpdate={patch => updateRow(r.id, patch)} onDelete={() => delRow(r.id)} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
              <td colSpan={4} className="px-3 py-3 text-sm text-gray-700 text-right">TOTALE Costo Mensile</td>
              <td className="px-3 py-3 text-sm text-gray-900 text-right font-bold">{fmt(totMensile)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function EditableRow({
  row,
  onUpdate,
  onDelete,
}: {
  row: SpesaFissa
  onUpdate: (patch: Partial<SpesaFissa>) => void
  onDelete: () => void
}) {
  const [costoStr, setCostoStr] = useState(formatEU(row.costo))
  const [mensileStr, setMensileStr] = useState(formatEU(row.costoMensile))

  useEffect(() => { setCostoStr(formatEU(row.costo)) }, [row.costo])
  useEffect(() => { setMensileStr(formatEU(row.costoMensile)) }, [row.costoMensile])

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/60">
      <td className="px-2 py-1.5">
        <input
          type="text"
          defaultValue={row.tipo}
          onBlur={e => e.target.value !== row.tipo && onUpdate({ tipo: e.target.value })}
          className="w-full bg-transparent border-0 text-sm text-gray-900 px-2 py-1.5 rounded focus:bg-white focus:ring-2 focus:ring-pink-300 focus:outline-none"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={row.cadenza}
          onChange={e => onUpdate({ cadenza: e.target.value })}
          className="w-full bg-transparent border-0 text-xs font-medium text-gray-700 px-2 py-1.5 rounded focus:bg-white focus:ring-2 focus:ring-pink-300 focus:outline-none cursor-pointer"
        >
          {CADENZE.map(c => <option key={c} value={c}>{c}</option>)}
          {!CADENZE.includes(row.cadenza) && <option value={row.cadenza}>{row.cadenza}</option>}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          defaultValue={row.dataPagamento}
          onBlur={e => e.target.value !== row.dataPagamento && onUpdate({ dataPagamento: e.target.value })}
          className="w-full bg-transparent border-0 text-sm text-gray-700 px-2 py-1.5 rounded focus:bg-white focus:ring-2 focus:ring-pink-300 focus:outline-none"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={costoStr}
          onChange={e => setCostoStr(e.target.value)}
          onBlur={e => {
            const n = parseEU(e.target.value)
            setCostoStr(formatEU(n))
            if (n !== row.costo) onUpdate({ costo: n })
          }}
          className="w-full bg-transparent border-0 text-sm text-gray-900 text-right px-2 py-1.5 rounded focus:bg-white focus:ring-2 focus:ring-pink-300 focus:outline-none tabular-nums"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={mensileStr}
          onChange={e => setMensileStr(e.target.value)}
          onBlur={e => {
            const n = parseEU(e.target.value)
            setMensileStr(formatEU(n))
            if (n !== row.costoMensile) onUpdate({ costoMensile: n })
          }}
          className="w-full bg-transparent border-0 text-sm text-gray-900 text-right px-2 py-1.5 rounded focus:bg-white focus:ring-2 focus:ring-pink-300 focus:outline-none font-semibold tabular-nums"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Elimina riga"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

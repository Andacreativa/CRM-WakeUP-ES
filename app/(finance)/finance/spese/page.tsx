'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, Pencil, Trash2, Download, FileSpreadsheet, Paperclip, ExternalLink } from 'lucide-react'
import { fmt, MESI, CATEGORIE_SPESA, CATEGORIE_COLORI, AZIENDE, AZIENDA_COLORI } from '@/lib/constants'
import FiltriBar from '@/components/FiltriBar'
import { useAnno } from '@/lib/anno-context'
import { exportExcel, exportPDF, speseToExcel } from '@/lib/export'

interface Spesa {
  id: number; azienda: string; aziendaNota: string | null; fornitore: string; fornitoreId: number | null; categoria: string
  descrizione: string | null; note: string | null; ricevutaPath: string | null
  mese: number; anno: number; importo: number
}

interface Fornitore { id: number; nome: string; paese: string }

const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1)
const emptyForm = { azienda: AZIENDE[0], aziendaNota: '', fornitore: '', fornitoreId: '' as string | number, categoria: CATEGORIE_SPESA[0], descrizione: '', note: '', mese: new Date().getMonth() + 1, anno: 2025, importo: '', ricevutaPath: '' }

export default function SpesePage() {
  const [spese, setSpese] = useState<Spesa[]>([])
  const [fornitori, setFornitori] = useState<Fornitore[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Spesa | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [filtroMese, setFiltroMese] = useState(0)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const { anno, setAnno } = useAnno()
  const [azienda, setAzienda] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const load = async () => {
    const params = new URLSearchParams({ anno: String(anno) })
    if (azienda) params.set('azienda', azienda)
    const [s, f] = await Promise.all([
      (await fetch(`/api/spese?${params}`)).json() as Promise<any>,
      (await fetch('/api/fornitori')).json() as Promise<any>,
    ])
    setSpese(Array.isArray(s) ? s : [])
    setFornitori(Array.isArray(f) ? f : [])
  }
  useEffect(() => { load() }, [anno, azienda])

  const openNew = () => { setEditing(null); setForm({ ...emptyForm, anno }); setShowForm(true) }
  const openEdit = (s: Spesa) => {
    setEditing(s)
    setForm({ azienda: s.azienda, aziendaNota: s.aziendaNota || '', fornitore: s.fornitore, fornitoreId: s.fornitoreId ?? '', categoria: s.categoria, descrizione: s.descrizione || '', note: s.note || '', mese: s.mese, anno: s.anno, importo: String(s.importo), ricevutaPath: s.ricevutaPath || '' })
    setShowForm(true)
  }

  const applyFornitore = (id: string) => {
    if (!id) {
      setForm(f => ({ ...f, fornitoreId: '', fornitore: '' }))
      return
    }
    const fnt = (fornitori ?? []).find(x => x.id === parseInt(id))
    if (fnt) setForm(f => ({ ...f, fornitoreId: fnt.id, fornitore: fnt.nome }))
  }

  const uploadRicevuta = async (file: File) => {
    setUploading(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json())
    setForm(f => ({ ...f, ricevutaPath: res.path }))
    setUploading(false)
  }

  const save = async () => {
    if (!form.fornitore || !form.importo) return
    const payload = { ...form, importo: parseFloat(form.importo), fornitoreId: form.fornitoreId || null, aziendaNota: form.azienda === 'Altro' ? form.aziendaNota : null }
    if (editing) await fetch(`/api/spese/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    else await fetch('/api/spese', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setShowForm(false); load()
  }

  const del = async (id: number) => {
    if (!confirm('Eliminare questa spesa?')) return
    await fetch(`/api/spese/${id}`, { method: 'DELETE' }); load()
  }

  const filtered = (spese ?? []).filter(s => {
    if (filtroMese && s.mese !== filtroMese) return false
    if (filtroCategoria && s.categoria !== filtroCategoria) return false
    return true
  })

  const totale = filtered.reduce((s, e) => s + (e?.importo ?? 0), 0)
  const perCategoria: Record<string, number> = {}
  ;(spese ?? []).forEach(s => {
    const cat = s?.categoria ?? '—'
    perCategoria[cat] = (perCategoria[cat] || 0) + (s?.importo ?? 0)
  })

  const handleExcelExport = () => exportExcel(speseToExcel(filtered, MESI), `spese_${anno}`)
  const handlePDFExport = () => exportPDF(
    `Spese ${anno}`,
    ['Fornitore', 'Categoria', 'Azienda', 'Mese', 'Importo', 'Descrizione'],
    filtered.map(s => [s.fornitore, s.categoria, s.azienda, MESI[s.mese - 1], fmt(s.importo), s.descrizione || '']),
    `spese_${anno}`
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spese</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} voci</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar anno={anno} azienda={azienda} onAnno={setAnno} onAzienda={setAzienda} />
          <button onClick={handleExcelExport} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
          <button onClick={handlePDFExport} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50">
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
          <button onClick={openNew} className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl">
            <Plus className="w-4 h-4" /> Nuova Spesa
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4 lg:col-span-1 col-span-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Totale Anno</p>
          <p className="text-xl font-bold text-red-500 mt-1">{fmt((spese ?? []).reduce((s, e) => s + (e?.importo ?? 0), 0))}</p>
        </div>
        {Object.entries(perCategoria).slice(0, 3).map(([cat, val]) => (
          <div key={cat} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: CATEGORIE_COLORI[cat] || '#94a3b8' }} />
              <p className="text-xs text-gray-500 truncate">{cat}</p>
            </div>
            <p className="text-lg font-bold text-gray-900">{fmt(val)}</p>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div className="flex gap-3 flex-wrap">
        <select value={filtroMese} onChange={e => setFiltroMese(parseInt(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-pink-300">
          <option value={0}>Tutti i mesi</option>
          {MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-pink-300">
          <option value="">Tutte le categorie</option>
          {CATEGORIE_SPESA.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filtroMese > 0 || filtroCategoria) && <span className="text-sm text-gray-500 flex items-center">→ {fmt(totale)}</span>}
      </div>

      {/* Tabella */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Fornitore', 'Categoria', 'Azienda', 'Mese', 'Importo', 'Note', 'Ric.', ''].map(h => (
                <th key={h} className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 ${h === 'Importo' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-12 text-sm">Nessuna spesa trovata</td></tr>}
            {filtered.map(s => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.fornitore}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: (CATEGORIE_COLORI[s.categoria] || '#94a3b8') + '20', color: CATEGORIE_COLORI[s.categoria] || '#64748b' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORIE_COLORI[s.categoria] || '#94a3b8' }} />
                    {s.categoria}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: s.azienda === 'Spagna' ? '#fef2f2' : s.azienda === 'Italia' ? '#f0fdf4' : '#f8fafc', color: s.azienda === 'Spagna' ? '#ef4444' : s.azienda === 'Italia' ? '#22c55e' : '#64748b' }}>
                    {s.azienda === 'Altro' && s.aziendaNota ? s.aziendaNota : s.azienda}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{MESI[s.mese - 1]}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(s.importo)}</td>
                <td className="px-4 py-3 text-xs text-gray-400 max-w-[120px] truncate">{s.note || s.descrizione || '—'}</td>
                <td className="px-4 py-3">
                  {s.ricevutaPath ? (
                    <a href={s.ricevutaPath} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-pink-600 hover:underline">
                      <Paperclip className="w-3 h-3" /><ExternalLink className="w-3 h-3" />
                    </a>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => del(s.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900">{editing ? 'Modifica Spesa' : 'Nuova Spesa'}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Azienda *</label>
                <div className="flex gap-2">
                  {AZIENDE.map(a => {
                    const col = AZIENDA_COLORI[a]
                    const active = form.azienda === a
                    return (
                      <button key={a} onClick={() => setForm(f => ({ ...f, azienda: a, aziendaNota: '' }))}
                        className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                        style={active ? { background: col.bg, color: col.text, borderColor: col.border } : { background: '#fff', borderColor: '#e2e8f0', color: '#94a3b8' }}>
                        {a}
                      </button>
                    )
                  })}
                </div>
                {form.azienda === 'Altro' && (
                  <input
                    type="text"
                    value={form.aziendaNota}
                    onChange={e => setForm(f => ({ ...f, aziendaNota: e.target.value }))}
                    placeholder="Specifica provenienza..."
                    className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Da anagrafica fornitori</label>
                <select
                  value={form.fornitoreId || ''}
                  onChange={e => applyFornitore(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-700"
                >
                  <option value="">— Seleziona dall'anagrafica (opzionale) —</option>
                  {fornitori.map(fn => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Fornitore *</label>
                  <input type="text" value={form.fornitore} onChange={e => setForm(f => ({ ...f, fornitore: e.target.value, fornitoreId: '' }))}
                    placeholder="Es. Google" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Categoria *</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
                    {CATEGORIE_SPESA.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Mese *</label>
                  <select value={form.mese} onChange={e => setForm(f => ({ ...f, mese: parseInt(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
                    {MESI_NUMS.map(m => <option key={m} value={m}>{MESI[m - 1]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Importo (€) *</label>
                  <input type="number" step="0.01" value={form.importo} onChange={e => setForm(f => ({ ...f, importo: e.target.value }))}
                    placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Descrizione</label>
                <input type="text" value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" placeholder="Es. Abbonamento mensile" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Note interne</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none" placeholder="Note private..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Ricevuta / Allegato</label>
                {form.ricevutaPath ? (
                  <div className="flex items-center gap-2">
                    <a href={form.ricevutaPath} target="_blank" rel="noopener noreferrer" className="text-xs text-pink-600 hover:underline flex items-center gap-1">
                      <Paperclip className="w-3 h-3" /> Visualizza allegato
                    </a>
                    <button onClick={() => setForm(f => ({ ...f, ricevutaPath: '' }))} className="text-xs text-red-500 hover:underline">Rimuovi</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 hover:border-pink-400 hover:text-pink-600 transition-colors">
                      <Paperclip className="w-4 h-4" /> {uploading ? 'Caricamento...' : 'Allega file'}
                    </button>
                    <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf"
                      onChange={e => { if (e.target.files?.[0]) uploadRicevuta(e.target.files[0]) }} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">Annulla</button>
              <button onClick={save} disabled={uploading} className="glass-btn-primary flex-1 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-60">
                {editing ? 'Salva' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

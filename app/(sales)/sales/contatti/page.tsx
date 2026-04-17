'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Mail, Phone, MapPin, FileText } from 'lucide-react'
import AddressFields, { formatAddress } from '@/components/AddressFields'

interface Contatto {
  id: number
  nome: string
  paese: string
  email: string | null
  telefono: string | null
  partitaIva: string | null
  via: string | null
  cap: string | null
  citta: string | null
  provincia: string | null
  note: string | null
  status: string
}

const STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead', bg: '#fef9c3', text: '#a16207', border: '#fde047' },
  { value: 'acquisito', label: 'Acquisito', bg: '#dcfce7', text: '#166534', border: '#86efac' },
  { value: 'perso', label: 'Perso', bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
]

const statusStyle = (s: string) => STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0]

const paesiFlag: Record<string, string> = {
  Italia: '🇮🇹', Spagna: '🇪🇸', Francia: '🇫🇷',
  Germania: '🇩🇪', Portogallo: '🇵🇹', 'Regno Unito': '🇬🇧',
}

const emptyForm = {
  nome: '', paese: 'Italia', email: '', telefono: '',
  partitaIva: '',
  via: '', cap: '', citta: '', provincia: '',
  note: '', status: 'lead',
}

const BRAND = '#db291b'

export default function ContattiPage() {
  const [contatti, setContatti] = useState<Contatto[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contatto | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('tutti')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const load = async () => {
    const data = (await (await fetch('/api/contatti')).json()) as any
    setContatti(Array.isArray(data) ? data : [])
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true) }
  const openEdit = (c: Contatto) => {
    setEditing(c)
    setForm({
      nome: c.nome, paese: c.paese,
      email: c.email || '', telefono: c.telefono || '',
      partitaIva: c.partitaIva || '',
      via: c.via || '', cap: c.cap || '',
      citta: c.citta || '', provincia: c.provincia || '',
      note: c.note || '', status: c.status,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.nome) return
    if (editing) {
      await fetch(`/api/contatti/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } else {
      await fetch('/api/contatti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    }
    setShowForm(false)
    load()
  }

  const del = async (id: number) => {
    if (!confirm('Eliminare questo contatto?')) return
    await fetch(`/api/contatti/${id}`, { method: 'DELETE' })
    load()
  }

  const q = (search ?? '').toLowerCase()
  const filtered = (contatti ?? []).filter(c => {
    const matchSearch =
      (c.nome ?? '').toLowerCase().includes(q) ||
      (c.paese ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    const matchStatus = filtroStatus === 'tutti' || c.status === filtroStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pl-10 md:pl-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contatti</h1>
          <p className="text-gray-500 text-sm mt-1">{contatti.length} contatti in anagrafica</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all"
          style={{ background: BRAND }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
        >
          <Plus className="w-4 h-4" /> Nuovo Contatto
        </button>
      </div>

      {/* Filtri */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, paese, email..."
          className="w-full max-w-sm border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[{ value: 'tutti', label: 'Tutti' }, ...STATUS_OPTIONS].map(o => (
            <button
              key={o.value}
              onClick={() => setFiltroStatus(o.value)}
              className="text-sm px-3 py-1.5 rounded-md font-medium transition-colors"
              style={
                filtroStatus === o.value
                  ? { background: BRAND, color: '#fff' }
                  : { color: '#64748b' }
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-1">Nessun contatto trovato</p>
          <p className="text-sm">Aggiungi il primo contatto con il pulsante in alto</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => {
            const st = statusStyle(c.status)
            return (
              <div key={c.id} className="glass-card rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{paesiFlag[c.paese] || '🌍'}</span>
                      <h3 className="font-semibold text-gray-900">{c.nome}</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{c.paese}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
                      style={{ background: st.bg, color: st.text, borderColor: st.border }}
                    >
                      {st.label}
                    </span>
                    <button
                      onClick={() => openEdit(c)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => del(c.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {c.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />{c.email}
                    </div>
                  )}
                  {c.telefono && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />{c.telefono}
                    </div>
                  )}
                  {(c.via || c.cap || c.citta || c.provincia) && (
                    <div className="flex items-start gap-2 text-xs text-gray-500">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <span>{formatAddress({ via: c.via ?? '', cap: c.cap ?? '', citta: c.citta ?? '', provincia: c.provincia ?? '', paese: c.paese })}</span>
                    </div>
                  )}
                  {c.partitaIva && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <FileText className="w-3.5 h-3.5 text-gray-400" />P.IVA: {c.partitaIva}
                    </div>
                  )}
                </div>

                {c.note && (
                  <p className="text-xs text-gray-400 italic border-t border-gray-50 pt-2">{c.note}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? 'Modifica Contatto' : 'Nuovo Contatto'}
            </h2>

            {/* Status selector */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
              <div className="flex gap-2">
                {STATUS_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setForm(f => ({ ...f, status: o.value }))}
                    className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                    style={
                      form.status === o.value
                        ? { background: o.bg, color: o.text, borderColor: o.border }
                        : { background: '#fff', borderColor: '#e2e8f0', color: '#94a3b8' }
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Nome / Ragione Sociale *</label>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Es. Acme Srl"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Partita IVA</label>
                  <input
                    type="text"
                    value={form.partitaIva}
                    onChange={e => setForm(f => ({ ...f, partitaIva: e.target.value }))}
                    placeholder="IT12345678901"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="info@azienda.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Telefono</label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="+39 02..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Indirizzo</p>
                  <AddressFields
                    value={{ via: form.via, cap: form.cap, citta: form.citta, provincia: form.provincia, paese: form.paese }}
                    onChange={a => setForm(f => ({ ...f, via: a.via, cap: a.cap, citta: a.citta, provincia: a.provincia, paese: a.paese }))}
                    inputClass="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Note</label>
                  <textarea
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    rows={2}
                    placeholder="Note interne..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={save}
                className="flex-1 text-white text-sm font-medium py-2.5 rounded-xl transition-all"
                style={{ background: BRAND }}
              >
                {editing ? 'Salva Modifiche' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

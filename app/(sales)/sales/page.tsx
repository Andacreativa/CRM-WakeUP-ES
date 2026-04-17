'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, X, Trash2, Phone, ChevronRight, Euro, Building2, Mail, MessageSquare, Send, FileText } from 'lucide-react'
import { fmt } from '@/lib/constants'

interface AppuntoCall {
  id: number
  testo: string
  createdAt: string
}

interface PreventivoSummary {
  id: number
  numero: string
  oggetto: string
  subtotale: number
  totale: number
  feeCommerciale: number
  iva: number
  status: string
  createdAt: string
}

interface Lead {
  id: number
  nome: string
  azienda: string | null
  email: string | null
  telefono: string | null
  valore: number | null
  stage: string
  note: string | null
  createdAt: string
  appunti: AppuntoCall[]
  preventivi: PreventivoSummary[]
}

interface Preventivo {
  id: number
  numero: string
  nomeCliente: string
  aziendaCliente: string | null
  oggetto: string
  iva: number
  subtotale: number
  totale: number
  feeCommerciale: number
  status: string
  createdAt: string
}

const STAGES = [
  { key: 'nuovo',        label: 'Nuovo Lead',    color: '#6366f1', bg: '#eef2ff' },
  { key: 'contatto',     label: 'In Contatto',   color: '#f59e0b', bg: '#fffbeb' },
  { key: 'proposta',     label: 'Proposta',      color: '#3b82f6', bg: '#eff6ff' },
  { key: 'negoziazione', label: 'Negoziazione',  color: '#8b5cf6', bg: '#f5f3ff' },
  { key: 'vinto',        label: 'Vinto',         color: '#10b981', bg: '#f0fdf4' },
  { key: 'perso',        label: 'Perso',         color: '#ef4444', bg: '#fef2f2' },
]

const BRAND = '#db291b'

const emptyForm = { nome: '', azienda: '', email: '', telefono: '', valore: '', note: '', stage: 'nuovo' }

export default function SalesDashboard() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [preventivi, setPreventivi] = useState<Preventivo[]>([])
  const [selected, setSelected] = useState<Lead | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [addingToStage, setAddingToStage] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [newAppunto, setNewAppunto] = useState('')
  const [sendingAppunto, setSendingAppunto] = useState(false)
  const appuntiEndRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const [leadsData, prevData] = await Promise.all([
      fetch('/api/leads').then(r => r.json()),
      fetch('/api/preventivi').then(r => r.json()),
    ])
    const list: Lead[] = Array.isArray(leadsData) ? leadsData : []
    setLeads(list)
    setPreventivi(Array.isArray(prevData) ? prevData : [])
    if (selected) {
      const updated = list.find(l => l.id === selected.id)
      if (updated) setSelected(updated)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    appuntiEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected?.appunti?.length])

  const openNew = (stage: string) => {
    setForm({ ...emptyForm, stage })
    setAddingToStage(stage)
    setShowForm(true)
  }

  const saveLead = async () => {
    if (!form.nome.trim()) return
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, valore: form.valore ? Number(form.valore) : null }),
    })
    setShowForm(false)
    setAddingToStage(null)
    load()
  }

  const moveStage = async (lead: Lead, stage: string) => {
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
    load()
  }

  const deleteLead = async (id: number) => {
    if (!confirm('Eliminare questo lead?')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    if (selected?.id === id) setSelected(null)
    load()
  }

  const sendAppunto = async () => {
    if (!newAppunto.trim() || !selected) return
    setSendingAppunto(true)
    await fetch(`/api/leads/${selected.id}/appunti`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testo: newAppunto.trim() }),
    })
    setNewAppunto('')
    setSendingAppunto(false)
    load()
  }

  const deleteAppunto = async (appuntoId: number) => {
    if (!selected) return
    await fetch(`/api/leads/${selected.id}/appunti`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appuntoId }),
    })
    load()
  }

  const totaleVinto = leads.filter(l => l.stage === 'vinto').reduce((s, l) => s + (l.valore ?? 0), 0)
  const totalePipeline = leads.filter(l => !['vinto', 'perso'].includes(l.stage)).reduce((s, l) => s + (l.valore ?? 0), 0)

  return (
    <div className="flex flex-col h-screen overflow-hidden -m-4 -mt-14 md:-m-8">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pl-14 pr-4 md:px-8 py-3 md:py-5 border-b border-gray-200 bg-white/60 backdrop-blur shrink-0">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-gray-900">Pipeline Sales</h1>
          <p className="text-gray-500 text-xs md:text-sm mt-0.5">{leads.length} lead totali</p>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">Pipeline</p>
            <p className="text-sm font-bold text-indigo-600">{fmt(totalePipeline)}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">Vinto</p>
            <p className="text-sm font-bold text-emerald-600">{fmt(totaleVinto)}</p>
          </div>
          <button
            onClick={() => openNew('nuovo')}
            className="flex items-center gap-2 text-white text-xs md:text-sm font-medium px-3 md:px-4 py-2 md:py-2.5 rounded-xl transition-all"
            style={{ background: BRAND }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuovo</span> Lead
          </button>
        </div>
      </div>

      {/* Kanban + Detail panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Kanban board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 md:gap-4 h-full px-4 md:px-8 py-4 md:py-6" style={{ minWidth: `${STAGES.length * 220}px` }}>
            {STAGES.map(stage => {
              const stageleads = leads.filter(l => l.stage === stage.key)
              const stageVal = stageleads.reduce((s, l) => s + (l.valore ?? 0), 0)
              return (
                <div key={stage.key} className="flex flex-col w-52 md:w-64 shrink-0">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                      <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full text-white" style={{ background: stage.color }}>
                        {stageleads.length}
                      </span>
                    </div>
                    <button
                      onClick={() => openNew(stage.key)}
                      className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {stageVal > 0 && (
                    <p className="text-xs text-gray-400 mb-2 pl-1">{fmt(stageVal)}</p>
                  )}

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {stageleads.map(lead => (
                      <div
                        key={lead.id}
                        onClick={() => setSelected(selected?.id === lead.id ? null : lead)}
                        className="glass-card rounded-xl p-3.5 cursor-pointer transition-all hover:shadow-md"
                        style={selected?.id === lead.id ? { borderColor: stage.color, borderWidth: 2 } : {}}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-semibold text-gray-900 leading-tight">{lead.nome}</p>
                          <button
                            onClick={e => { e.stopPropagation(); deleteLead(lead.id) }}
                            className="p-0.5 rounded text-gray-300 hover:text-red-500 transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {lead.azienda && (
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />{lead.azienda}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2.5">
                          {lead.valore ? (
                            <span className="text-xs font-bold text-gray-700 flex items-center gap-0.5">
                              <Euro className="w-3 h-3" />{fmt(lead.valore).replace('€', '').trim()}
                            </span>
                          ) : <span />}
                          <div className="flex items-center gap-1.5">
                            {lead.appunti.length > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-gray-400">
                                <MessageSquare className="w-3 h-3" />{lead.appunti.length}
                              </span>
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                          </div>
                        </div>

                        {/* Quick stage move */}
                        <div className="flex gap-1 mt-2.5 flex-wrap">
                          {STAGES.filter(s => s.key !== stage.key).map(s => (
                            <button
                              key={s.key}
                              onClick={e => { e.stopPropagation(); moveStage(lead, s.key) }}
                              className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium transition-colors"
                              style={{ color: s.color, borderColor: s.color + '60', background: s.bg }}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {stageleads.length === 0 && (
                      <button
                        onClick={() => openNew(stage.key)}
                        className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-xs text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
                      >
                        + Aggiungi lead
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail / Call notes panel */}
        {selected && (
          <div className="fixed inset-0 z-40 md:relative md:inset-auto md:w-80 md:shrink-0 border-l border-gray-200 bg-white/95 md:bg-white/80 backdrop-blur flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">{selected.nome}</h2>
                  {selected.azienda && <p className="text-xs text-gray-400 mt-0.5">{selected.azienda}</p>}
                </div>
                <button onClick={() => setSelected(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0 ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stage badge */}
              {(() => {
                const s = STAGES.find(s => s.key === selected.stage)!
                return (
                  <span className="inline-block mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: s.bg, color: s.color }}>
                    {s.label}
                  </span>
                )
              })()}

              {/* Info */}
              <div className="mt-3 space-y-1.5">
                {selected.email && (
                  <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-indigo-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />{selected.email}
                  </a>
                )}
                {selected.telefono && (
                  <a href={`tel:${selected.telefono}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-indigo-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />{selected.telefono}
                  </a>
                )}
                {selected.valore && (
                  <p className="flex items-center gap-2 text-xs font-bold text-gray-700">
                    <Euro className="w-3.5 h-3.5 text-gray-400" />{fmt(selected.valore)}
                  </p>
                )}
              </div>

              {selected.note && (
                <p className="mt-3 text-xs text-gray-500 italic border-t border-gray-100 pt-2">{selected.note}</p>
              )}
            </div>

            {/* Preventivi collegati */}
            {selected.preventivi?.length > 0 && (
              <div className="px-5 py-3 border-b border-gray-100 shrink-0 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Preventivi
                </p>
                {selected.preventivi.map(p => {
                  const guadagno = p.subtotale * (1 - (p.feeCommerciale ?? 0) / 100)
                  const statusColor = p.status === 'accettato' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                    : p.status === 'rifiutato' ? 'text-red-500 bg-red-50 border-red-200'
                    : 'text-amber-600 bg-amber-50 border-amber-200'
                  return (
                    <div key={p.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono text-gray-400">{p.numero}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusColor}`}>
                          {p.status === 'accettato' ? 'Accettato' : p.status === 'rifiutato' ? 'Rifiutato' : 'Attesa'}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-gray-700 mt-0.5 truncate">{p.oggetto}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-gray-400">Totale: <span className="font-semibold text-gray-700">{fmt(p.totale)}</span></span>
                        {p.feeCommerciale > 0 && (
                          <span className="text-[10px] text-emerald-600 font-semibold">Netto: {fmt(guadagno)}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Appunti call list */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Appunti Call
              </p>
              {selected.appunti.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">Nessun appunto ancora.<br />Aggiungi note dalla call qui sotto.</p>
              )}
              {[...selected.appunti].reverse().map(a => (
                <div key={a.id} className="group relative bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3">
                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{a.testo}</p>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    {new Date(a.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <button
                    onClick={() => deleteAppunto(a.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-500 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div ref={appuntiEndRef} />
            </div>

            {/* New appunto input */}
            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
              <textarea
                value={newAppunto}
                onChange={e => setNewAppunto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendAppunto() }}
                placeholder="Scrivi appunti dalla call..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-200 resize-none bg-white"
              />
              <button
                onClick={sendAppunto}
                disabled={!newAppunto.trim() || sendingAppunto}
                className="mt-2 w-full flex items-center justify-center gap-2 text-white text-xs font-semibold py-2 rounded-xl transition-all disabled:opacity-40"
                style={{ background: BRAND }}
                onMouseEnter={e => { if (!sendingAppunto && newAppunto.trim()) (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
              >
                <Send className="w-3.5 h-3.5" /> Salva appunto
                <span className="text-[10px] opacity-60 ml-1">⌘↵</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Preventivi section */}
      <div className="shrink-0 border-t border-gray-200 bg-white/60 backdrop-blur px-4 md:px-8 py-4 md:py-5 max-h-[220px] md:max-h-[260px] overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Preventivi</h2>
          <span className="text-xs text-gray-400 font-normal ml-1">{preventivi.length} totali</span>
          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="text-gray-400">
              Guadagno totale:{' '}
              <span className="font-bold text-emerald-600">
                {fmt(preventivi.reduce((s, p) => s + p.subtotale * (1 - (p.feeCommerciale ?? 0) / 100), 0))}
              </span>
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                {['Numero', 'Cliente', 'Oggetto', '€ Servizi', 'Subtotale', 'IVA', 'Fee commerciale', 'Guadagno'].map(h => (
                  <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2 whitespace-nowrap last:text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preventivi.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400 py-6">Nessun preventivo</td>
                </tr>
              )}
              {preventivi.map(p => {
                const ivaAmt = p.subtotale * (p.iva / 100)
                const feeAmt = p.subtotale * (p.feeCommerciale ?? 0) / 100
                const guadagno = p.subtotale - feeAmt
                return (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-gray-600 whitespace-nowrap">{p.numero}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-800">{p.nomeCliente}</p>
                      {p.aziendaCliente && <p className="text-gray-400">{p.aziendaCliente}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate">{p.oggetto}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{fmt(p.subtotale)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmt(p.subtotale)}</td>
                    <td className="px-3 py-2.5 text-gray-500">{p.iva}% · {fmt(ivaAmt)}</td>
                    <td className="px-3 py-2.5 text-orange-600 font-medium">
                      {p.feeCommerciale ? <>{p.feeCommerciale}% · {fmt(feeAmt)}</> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-emerald-600 text-right">{fmt(guadagno)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Lead Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="glass-modal rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Nuovo Lead
                {addingToStage && (() => {
                  const s = STAGES.find(s => s.key === addingToStage)
                  return s ? <span className="ml-2 text-sm font-medium" style={{ color: s.color }}>— {s.label}</span> : null
                })()}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nome / Azienda *</label>
                <input
                  autoFocus
                  type="text"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Es. Marco Rossi"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Azienda</label>
                  <input
                    type="text"
                    value={form.azienda}
                    onChange={e => setForm(f => ({ ...f, azienda: e.target.value }))}
                    placeholder="Es. Acme Srl"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Valore stimato (€)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.valore}
                    onChange={e => setForm(f => ({ ...f, valore: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="info@..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Telefono</label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="+34..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Note iniziali</label>
                <textarea
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                  placeholder="Primo contatto tramite..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
                />
              </div>

              {/* Stage selector */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Stage</label>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => setForm(f => ({ ...f, stage: s.key }))}
                      className="text-xs px-2.5 py-1 rounded-full border font-medium transition-all"
                      style={form.stage === s.key
                        ? { background: s.color, color: '#fff', borderColor: s.color }
                        : { background: s.bg, color: s.color, borderColor: s.color + '60' }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={saveLead}
                className="flex-1 text-white text-sm font-medium py-2.5 rounded-xl transition-all"
                style={{ background: BRAND }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
              >
                Aggiungi Lead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

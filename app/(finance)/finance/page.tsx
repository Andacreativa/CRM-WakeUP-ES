'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Wallet, Users, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { fmt, MESI, CATEGORIE_COLORI } from '@/lib/constants'
import FiltriBar from '@/components/FiltriBar'
import { useAnno } from '@/lib/anno-context'

interface DashboardData {
  totaleFatture: number; totaleFatturePagate: number; totaleFattureInAttesa: number
  totaleSpese: number; bilancio: number; clienti: number
  mesi: { mese: number; entrate: number; uscite: number; entratePrec: number; uscitePrec: number }[]
  categorieSpese: { name: string; value: number }[]
  ultimeFatture: { id: number; importo: number; pagato: boolean; mese: number; azienda: string; cliente: { nome: string } }[]
  scadenzeAlert: { id: number; importo: number; scadenza: string; cliente: { nome: string } }[]
  trend: { fattureAnnoPrec: number; speseAnnoPrec: number }
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const { anno, setAnno } = useAnno()
  const [azienda, setAzienda] = useState('')

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = async () => {
      try {
        const params = new URLSearchParams({ anno: String(anno) })
        if (azienda) params.set('azienda', azienda)
        const res = await fetch(`/api/dashboard?${params}`)
        const text = await res.text()
        if (!res.ok || !text) {
          console.error('[dashboard] fetch failed', res.status, text)
          return
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = JSON.parse(text) as any
        if (d && Array.isArray(d.mesi)) setData(d)
      } catch (e) {
        console.error('[dashboard] parse error', e)
      }
    }
    run()
  }, [anno, azienda])

  if (!data) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#e8308a' }} />
    </div>
  )

  const chartMesi = (data.mesi ?? []).map(m => ({
    name: (MESI[m.mese - 1] ?? '').slice(0, 3),
    Entrate: m.entrate ?? 0, Uscite: m.uscite ?? 0,
    [`Entrate ${anno - 1}`]: m.entratePrec ?? 0,
  }))

  const fattureAnnoPrec = data.trend?.fattureAnnoPrec ?? 0
  const pctFatture = fattureAnnoPrec > 0
    ? (((data.totaleFatture ?? 0) - fattureAnnoPrec) / fattureAnnoPrec * 100).toFixed(1)
    : null

  const oggi = new Date()
  const scadenzeUrgenti = (data.scadenzeAlert ?? []).filter(s => s?.scadenza && (new Date(s.scadenza) <= oggi || Math.ceil((new Date(s.scadenza).getTime() - oggi.getTime()) / 86400000) <= 7))

  const kpis = [
    { label: 'Totale Fatture', value: fmt(data.totaleFatture ?? 0), icon: TrendingUp, iconColor: '#e8308a', iconBg: '#fce7f3', sub: pctFatture ? `${Number(pctFatture) > 0 ? '+' : ''}${pctFatture}% vs ${anno - 1}` : `${fmt(data.totaleFatturePagate ?? 0)} incassati` },
    { label: 'Totale Spese', value: fmt(data.totaleSpese ?? 0), icon: TrendingDown, iconColor: '#ef4444', iconBg: '#fef2f2', sub: 'uscite anno' },
    { label: 'Bilancio', value: fmt(data.bilancio ?? 0), icon: Wallet, iconColor: (data.bilancio ?? 0) >= 0 ? '#10b981' : '#ef4444', iconBg: (data.bilancio ?? 0) >= 0 ? '#f0fdf4' : '#fef2f2', sub: 'entrate - uscite' },
    { label: 'Clienti', value: String(data.clienti ?? 0), icon: Users, iconColor: '#8b5cf6', iconBg: '#f5f3ff', sub: 'totale anagrafica' },
    { label: 'Da Incassare', value: fmt(data.totaleFattureInAttesa ?? 0), icon: Clock, iconColor: '#f59e0b', iconBg: '#fffbeb', sub: 'fatture non pagate' },
    { label: 'Incassato', value: fmt(data.totaleFatturePagate ?? 0), icon: CheckCircle, iconColor: '#10b981', iconBg: '#f0fdf4', sub: 'fatture pagate' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Riepilogo finanziario {anno}{azienda ? ` — ${azienda}` : ''}</p>
        </div>
        <FiltriBar anno={anno} azienda={azienda} onAnno={setAnno} onAzienda={setAzienda} showAzienda={false} />
      </div>

      {/* Alert scadenze */}
      {scadenzeUrgenti.length > 0 && (
        <Link href="/finance/scadenze" className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 hover:bg-amber-100 transition-colors">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm font-medium text-amber-800">
            {scadenzeUrgenti.length} {scadenzeUrgenti.length === 1 ? 'fattura in scadenza o scaduta' : 'fatture in scadenza o scadute'} — clicca per vedere le scadenze
          </p>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="glass-card rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{k.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{k.value}</p>
                <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: k.iconBg }}>
                <k.icon className="w-5 h-5" style={{ color: k.iconColor }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Area chart con trend */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Entrate vs Uscite — Confronto {anno - 1}/{anno}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartMesi}>
              <defs>
                <linearGradient id="gEnt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gUsc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              <Area type="monotone" dataKey="Entrate" stroke="#10b981" strokeWidth={2} fill="url(#gEnt)" />
              <Area type="monotone" dataKey="Uscite" stroke="#ef4444" strokeWidth={2} fill="url(#gUsc)" />
              <Area type="monotone" dataKey={`Entrate ${anno - 1}`} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart spese */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Spese per Categoria</h2>
          {(data.categorieSpese ?? []).length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Nessuna spesa</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
                <Pie data={data.categorieSpese ?? []} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" nameKey="name">
                  {(data.categorieSpese ?? []).map((entry, i) => (
                    // eslint-disable-next-line @typescript-eslint/no-deprecated
                    <Cell key={i} fill={CATEGORIE_COLORI[entry?.name ?? ''] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bar chart + ultime fatture */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Bilancio Mensile</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartMesi} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              <Bar dataKey="Entrate" fill="#e8308a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Uscite" fill="#fca5a5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Ultime Fatture</h2>
          {(data.ultimeFatture ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Nessuna fattura</p>
          ) : (
            <div className="space-y-3">
              {(data.ultimeFatture ?? []).map(f => (
                <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{f.cliente?.nome ?? '—'}</p>
                    <p className="text-xs text-gray-400">{MESI[f.mese - 1] ?? ''} · {f.azienda ?? ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{fmt(f.importo ?? 0)}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.pagato ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {f.pagato ? 'Pagato' : 'In attesa'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

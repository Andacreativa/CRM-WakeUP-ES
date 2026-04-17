'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { Download, FileSpreadsheet } from 'lucide-react'
import { fmt, MESI } from '@/lib/constants'
import FiltriBar from '@/components/FiltriBar'
import { useAnno } from '@/lib/anno-context'
import { exportExcel, exportPDF } from '@/lib/export'

interface MeseData { mese: number; entrate: number; uscite: number; bilancio: number }

export default function BilancioPage() {
  const [dati, setDati] = useState<MeseData[]>([])
  const [fattureTotale, setFattureTotale] = useState(0)
  const [speseTotale, setSpeseTotale] = useState(0)
  const { anno, setAnno } = useAnno()
  const [azienda, setAzienda] = useState('')

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = async () => {
      const params = new URLSearchParams({ anno: String(anno) })
      if (azienda) params.set('azienda', azienda)
      const [rawF, rawS] = await Promise.all([
        (await fetch(`/api/fatture?${params}`)).json() as Promise<any>,
        (await fetch(`/api/spese?${params}`)).json() as Promise<any>,
      ])
      const fatture: { mese: number; importo: number }[] = Array.isArray(rawF) ? rawF : []
      const spese: { mese: number; importo: number }[] = Array.isArray(rawS) ? rawS : []
      setFattureTotale(fatture.reduce((s: number, f) => s + (f?.importo ?? 0), 0))
      setSpeseTotale(spese.reduce((s: number, e) => s + (e?.importo ?? 0), 0))
      setDati(Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        const entrate = fatture.filter(f => f?.mese === m).reduce((s: number, f) => s + (f?.importo ?? 0), 0)
        const uscite = spese.filter(e => e?.mese === m).reduce((s: number, e) => s + (e?.importo ?? 0), 0)
        return { mese: m, entrate, uscite, bilancio: entrate - uscite }
      }))
    }
    run()
  }, [anno, azienda])

  const bilancioTotale = fattureTotale - speseTotale

  const chartData = dati.map(d => ({
    name: MESI[d.mese - 1].slice(0, 3),
    Entrate: d.entrate, Uscite: d.uscite, Bilancio: d.bilancio,
  }))

  const handleExcel = () => exportExcel(
    dati.map(d => ({ Mese: MESI[d.mese - 1], Entrate: d.entrate, Uscite: d.uscite, Bilancio: d.bilancio })),
    `bilancio_${anno}`
  )

  const handlePDF = () => exportPDF(
    `Bilancio ${anno}${azienda ? ` — ${azienda}` : ''}`,
    ['Mese', 'Entrate', 'Uscite', 'Bilancio'],
    dati.map(d => [MESI[d.mese - 1], fmt(d.entrate), fmt(d.uscite), fmt(d.bilancio)]),
    `bilancio_${anno}`
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bilancio</h1>
          <p className="text-gray-500 text-sm mt-1">Conto economico {anno}{azienda ? ` — ${azienda}` : ''}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar anno={anno} azienda={azienda} onAnno={setAnno} onAzienda={setAzienda} />
          <button onClick={handleExcel} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
          <button onClick={handlePDF} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50">
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
        </div>
      </div>

      {/* KPI Totali */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Totale Entrate</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(fattureTotale)}</p>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Totale Uscite</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{fmt(speseTotale)}</p>
        </div>
        <div
          className={`glass-card rounded-2xl p-5 ${
            bilancioTotale > 0 ? 'bg-emerald-50/60' : bilancioTotale < 0 ? 'bg-red-50/60' : ''
          }`}
        >
          <p className="text-xs text-gray-500 uppercase tracking-wide">Bilancio Netto</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              bilancioTotale > 0 ? 'text-emerald-600' : bilancioTotale < 0 ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {fmt(bilancioTotale)}
          </p>
        </div>
      </div>

      {/* Grafico Entrate vs Uscite */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Entrate vs Uscite per Mese</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barSize={20} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <Bar dataKey="Entrate" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Uscite" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Grafico Bilancio netto */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Bilancio Netto per Mese</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={2} />
            <Bar dataKey="Bilancio" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                // eslint-disable-next-line @typescript-eslint/no-deprecated
                <Bar key={i} dataKey="Bilancio" fill={entry.Bilancio >= 0 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabella mensile */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Mese', 'Entrate', 'Uscite', 'Bilancio'].map((h, i) => (
                <th key={h} className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3 ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dati.map(d => (
              <tr key={d.mese} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium text-gray-800">{MESI[d.mese - 1]}</td>
                <td className="px-6 py-3 text-sm font-semibold text-right" style={{ color: d.entrate > 0 ? '#10b981' : '#94a3b8' }}>{d.entrate > 0 ? fmt(d.entrate) : '—'}</td>
                <td className="px-6 py-3 text-sm font-semibold text-red-500 text-right">{d.uscite > 0 ? fmt(d.uscite) : '—'}</td>
                <td className={`px-6 py-3 text-sm font-bold text-right ${d.bilancio >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {d.entrate === 0 && d.uscite === 0 ? '—' : fmt(d.bilancio)}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
              <td className="px-6 py-3 text-sm text-gray-800">TOTALE ANNO</td>
              <td className="px-6 py-3 text-sm text-right text-emerald-600">{fmt(fattureTotale)}</td>
              <td className="px-6 py-3 text-sm text-red-500 text-right">{fmt(speseTotale)}</td>
              <td className={`px-6 py-3 text-sm text-right ${bilancioTotale >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(bilancioTotale)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

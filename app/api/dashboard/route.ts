import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
  const { searchParams } = new URL(request.url)
  const anno = parseInt(searchParams.get('anno') || '2025')
  const azienda = searchParams.get('azienda') || undefined
  const whereBase = { anno, ...(azienda ? { azienda } : {}) }

  const [fatture, spese, clienti, fattureAnnoPrec, speseAnnoPrec] = await Promise.all([
    prisma.fattura.findMany({ where: whereBase }),
    prisma.spesa.findMany({ where: whereBase }),
    prisma.cliente.count(),
    prisma.fattura.findMany({ where: { anno: anno - 1, ...(azienda ? { azienda } : {}) } }),
    prisma.spesa.findMany({ where: { anno: anno - 1, ...(azienda ? { azienda } : {}) } }),
  ])

  const totaleFatture = fatture.reduce((s: number, f) => s + f.importo, 0)
  const totaleFatturePagate = fatture.filter(f => f.pagato).reduce((s: number, f) => s + f.importo, 0)
  const totaleFattureInAttesa = fatture.filter(f => !f.pagato).reduce((s: number, f) => s + f.importo, 0)
  const totaleSpese = spese.reduce((s: number, e) => s + e.importo, 0)
  const bilancio = totaleFatture - totaleSpese

  // Scadenze imminenti (fatture non pagate con scadenza nei prossimi 7 giorni o scadute)
  const oggi = new Date()
  const fra7 = new Date(oggi); fra7.setDate(oggi.getDate() + 7)
  const scadenzeAlert = await prisma.fattura.findMany({
    where: {
      pagato: false,
      scadenza: { not: null },
      anno,
    },
    include: { cliente: true },
  })

  // Monthly data
  const mesi = Array.from({ length: 12 }, (_, i) => {
    const mese = i + 1
    const entrate = fatture.filter(f => f.mese === mese).reduce((s: number, f) => s + f.importo, 0)
    const uscite = spese.filter(e => e.mese === mese).reduce((s: number, e) => s + e.importo, 0)
    const entratePrec = fattureAnnoPrec.filter(f => f.mese === mese).reduce((s: number, f) => s + f.importo, 0)
    const uscitePrec = speseAnnoPrec.filter(e => e.mese === mese).reduce((s: number, e) => s + e.importo, 0)
    return { mese, entrate, uscite, entratePrec, uscitePrec }
  })

  // Spese per categoria
  const categorieMap: Record<string, number> = {}
  spese.forEach(s => { categorieMap[s.categoria] = (categorieMap[s.categoria] || 0) + s.importo })
  const categorieSpese = Object.entries(categorieMap).map(([name, value]) => ({ name, value }))

  // Ultime fatture
  const ultimeFatture = await prisma.fattura.findMany({
    where: whereBase,
    include: { cliente: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  // Trend anno su anno
  const totFatturePrec = fattureAnnoPrec.reduce((s: number, f) => s + f.importo, 0)
  const totSpesePrec = speseAnnoPrec.reduce((s: number, e) => s + e.importo, 0)

  return NextResponse.json({
    totaleFatture,
    totaleFatturePagate,
    totaleFattureInAttesa,
    totaleSpese,
    bilancio,
    clienti,
    mesi,
    categorieSpese,
    ultimeFatture,
    scadenzeAlert,
    trend: {
      fattureAnnoPrec: totFatturePrec,
      speseAnnoPrec: totSpesePrec,
    },
  })
  } catch (err) {
    // Log dettagliato lato server: type, message, stack, raw
    console.error('[GET /api/dashboard] type:', typeof err)
    console.error('[GET /api/dashboard] constructor:', (err as object)?.constructor?.name)
    console.error('[GET /api/dashboard] raw:', err)
    if (err instanceof Error) {
      console.error('[GET /api/dashboard] message:', err.message)
      console.error('[GET /api/dashboard] stack:', err.stack)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    const errorMsg = [
      e?.name,
      e?.code,
      e?.errorCode,
      e?.message,
      e?.meta ? JSON.stringify(e.meta) : null,
      e?.cause ? String(e.cause) : null,
    ].filter(Boolean).join(' | ') || (() => {
      try { return JSON.stringify(err, Object.getOwnPropertyNames(err as object)) }
      catch { return String(err) }
    })()
    return NextResponse.json({
      totaleFatture: 0,
      totaleFatturePagate: 0,
      totaleFattureInAttesa: 0,
      totaleSpese: 0,
      bilancio: 0,
      clienti: 0,
      mesi: Array.from({ length: 12 }, (_, i) => ({
        mese: i + 1, entrate: 0, uscite: 0, entratePrec: 0, uscitePrec: 0,
      })),
      categorieSpese: [],
      ultimeFatture: [],
      scadenzeAlert: [],
      trend: { fattureAnnoPrec: 0, speseAnnoPrec: 0 },
      error: errorMsg,
    }, { status: 500 })
  }
}

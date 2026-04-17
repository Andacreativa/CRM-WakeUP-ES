import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractError(err: any) {
  return [
    err?.name, err?.code, err?.errorCode, err?.message,
    err?.meta ? JSON.stringify(err.meta) : null,
  ].filter(Boolean).join(' | ') || (() => {
    try { return JSON.stringify(err, Object.getOwnPropertyNames(err as object)) }
    catch { return String(err) }
  })()
}

export async function GET() {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        appunti: { orderBy: { createdAt: 'desc' } },
        preventivi: { orderBy: { createdAt: 'desc' }, select: { id: true, numero: true, oggetto: true, subtotale: true, totale: true, feeCommerciale: true, iva: true, status: true, createdAt: true } },
      },
    })
    return NextResponse.json(leads)
  } catch (err) {
    console.error('[GET /api/leads]', err)
    return NextResponse.json({ error: extractError(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const lead = await prisma.lead.create({
      data: {
        nome: body.nome,
        azienda: body.azienda || null,
        email: body.email || null,
        telefono: body.telefono || null,
        valore: body.valore ? Number(body.valore) : null,
        stage: body.stage || 'nuovo',
        note: body.note || null,
      },
      include: { appunti: true },
    })
    return NextResponse.json(lead)
  } catch (err) {
    console.error('[POST /api/leads]', err)
    return NextResponse.json({ error: extractError(err) }, { status: 500 })
  }
}

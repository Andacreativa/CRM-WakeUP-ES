import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const fornitori = await prisma.fornitore.findMany({ orderBy: { nome: 'asc' } })
    return NextResponse.json(fornitori)
  } catch (e) {
    console.error('[GET /api/fornitori]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fornitore = await prisma.fornitore.create({
      data: {
        nome: body.nome,
        paese: body.paese || 'Italia',
        email: body.email || null,
        telefono: body.telefono || null,
        partitaIva: body.partitaIva || null,
        via: body.via || null,
        cap: body.cap || null,
        citta: body.citta || null,
        provincia: body.provincia || null,
        note: body.note || null,
      },
    })
    return NextResponse.json(fornitore)
  } catch (e) {
    console.error('[POST /api/fornitori]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

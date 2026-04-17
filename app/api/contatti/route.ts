import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const contatti = await prisma.contatto.findMany({ orderBy: { nome: 'asc' } })
    return NextResponse.json(contatti)
  } catch (e) {
    console.error('[GET /api/contatti]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const contatto = await prisma.contatto.create({
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
        status: body.status || 'lead',
      },
    })
    return NextResponse.json(contatto)
  } catch (e) {
    console.error('[POST /api/contatti]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

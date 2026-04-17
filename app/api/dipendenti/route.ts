import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const anno = parseInt(searchParams.get('anno') || String(new Date().getFullYear()))
    const dipendenti = await prisma.dipendente.findMany({
      orderBy: { nome: 'asc' },
      include: {
        pagamenti: { where: { anno } },
      },
    })
    return NextResponse.json(dipendenti)
  } catch (e) {
    console.error('[GET /api/dipendenti]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const dipendente = await prisma.dipendente.create({
      data: {
        nome: body.nome,
        cognome: body.cognome || null,
        ruolo: body.ruolo || null,
        dataNascita: body.dataNascita ? new Date(body.dataNascita) : null,
        dni: body.dni || null,
        nie: body.nie || null,
        via: body.via || null,
        cap: body.cap || null,
        citta: body.citta || null,
        provincia: body.provincia || null,
        paese: body.paese || 'Spagna',
        telefono: body.telefono || null,
        email: body.email || null,
        iban: body.iban || null,
        nettoBustaPaga: parseFloat(body.nettoBustaPaga) || 0,
        irpf: parseFloat(body.irpf) || 0,
        seguridadSocial: parseFloat(body.seguridadSocial) || 0,
      },
    })
    return NextResponse.json(dipendente)
  } catch (e) {
    console.error('[POST /api/dipendenti]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

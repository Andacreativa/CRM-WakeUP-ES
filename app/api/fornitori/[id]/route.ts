import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const fornitore = await prisma.fornitore.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.paese !== undefined && { paese: body.paese }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.telefono !== undefined && { telefono: body.telefono }),
        ...(body.partitaIva !== undefined && { partitaIva: body.partitaIva }),
        ...(body.via !== undefined && { via: body.via || null }),
        ...(body.cap !== undefined && { cap: body.cap || null }),
        ...(body.citta !== undefined && { citta: body.citta || null }),
        ...(body.provincia !== undefined && { provincia: body.provincia || null }),
        ...(body.note !== undefined && { note: body.note }),
      },
    })
    return NextResponse.json(fornitore)
  } catch (e) {
    console.error('[PATCH /api/fornitori/[id]]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.fornitore.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[DELETE /api/fornitori/[id]]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

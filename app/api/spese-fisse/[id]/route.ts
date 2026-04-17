import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const row = await prisma.spesaFissa.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.tipo !== undefined && { tipo: body.tipo }),
        ...(body.cadenza !== undefined && { cadenza: body.cadenza }),
        ...(body.dataPagamento !== undefined && { dataPagamento: body.dataPagamento }),
        ...(body.costo !== undefined && { costo: Number(body.costo) || 0 }),
        ...(body.costoMensile !== undefined && { costoMensile: Number(body.costoMensile) || 0 }),
      },
    })
    return NextResponse.json(row)
  } catch (e) {
    console.error('[PATCH /api/spese-fisse/[id]]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.spesaFissa.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[DELETE /api/spese-fisse/[id]]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

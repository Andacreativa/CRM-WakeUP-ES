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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const lead = await prisma.lead.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.azienda !== undefined && { azienda: body.azienda || null }),
        ...(body.email !== undefined && { email: body.email || null }),
        ...(body.telefono !== undefined && { telefono: body.telefono || null }),
        ...(body.valore !== undefined && { valore: body.valore ? Number(body.valore) : null }),
        ...(body.stage !== undefined && { stage: body.stage }),
        ...(body.note !== undefined && { note: body.note || null }),
      },
      include: { appunti: { orderBy: { createdAt: 'desc' } } },
    })
    return NextResponse.json(lead)
  } catch (err) {
    console.error('[PATCH /api/leads/[id]]', err)
    return NextResponse.json({ error: extractError(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.lead.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/leads/[id]]', err)
    return NextResponse.json({ error: extractError(err) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const spesa = await prisma.spesa.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.azienda !== undefined && { azienda: body.azienda }),
      ...(body.aziendaNota !== undefined && { aziendaNota: body.aziendaNota }),
      ...(body.fornitore !== undefined && { fornitore: body.fornitore }),
      ...(body.fornitoreId !== undefined && { fornitoreId: body.fornitoreId ? Number(body.fornitoreId) : null }),
      ...(body.categoria !== undefined && { categoria: body.categoria }),
      ...(body.descrizione !== undefined && { descrizione: body.descrizione }),
      ...(body.note !== undefined && { note: body.note }),
      ...(body.ricevutaPath !== undefined && { ricevutaPath: body.ricevutaPath }),
      ...(body.mese !== undefined && { mese: body.mese }),
      ...(body.anno !== undefined && { anno: body.anno }),
      ...(body.importo !== undefined && { importo: parseFloat(body.importo) }),
    },
  })
  return NextResponse.json(spesa)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const spesa = await prisma.spesa.findUnique({ where: { id: parseInt(id) } })
  if (spesa?.ricevutaPath) {
    const fs = await import('fs/promises')
    const path = await import('path')
    const filePath = path.join(process.cwd(), 'public', spesa.ricevutaPath)
    await fs.unlink(filePath).catch(() => {})
  }
  await prisma.spesa.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ ok: true })
}

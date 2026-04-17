import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const anno = parseInt(searchParams.get('anno') || '2025')
  const azienda = searchParams.get('azienda') || undefined

  const spese = await prisma.spesa.findMany({
    where: { anno, ...(azienda ? { azienda } : {}) },
    orderBy: [{ mese: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(spese)
}

export async function POST(request: Request) {
  const body = await request.json()
  const spesa = await prisma.spesa.create({
    data: {
      azienda: body.azienda || 'Spagna',
      aziendaNota: body.aziendaNota || null,
      fornitore: body.fornitore,
      fornitoreId: body.fornitoreId ? Number(body.fornitoreId) : null,
      categoria: body.categoria,
      descrizione: body.descrizione || null,
      note: body.note || null,
      ricevutaPath: body.ricevutaPath || null,
      mese: body.mese,
      anno: body.anno || 2025,
      importo: parseFloat(body.importo),
    },
  })
  return NextResponse.json(spesa)
}

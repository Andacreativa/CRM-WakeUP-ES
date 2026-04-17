import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST: toggle pagamento (anno, mese, tipo: 'stipendio' | 'seguridad')
// Se non esiste → crea Spesa + record PagamentoDipendente
// Se esiste → elimina Spesa + record PagamentoDipendente
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const dipendenteId = parseInt(id)
    const body = await request.json()
    const anno: number = parseInt(body.anno)
    const mese: number = parseInt(body.mese)
    const tipo: 'stipendio' | 'seguridad' = body.tipo

    if (!['stipendio', 'seguridad'].includes(tipo)) {
      return NextResponse.json({ error: 'tipo non valido' }, { status: 400 })
    }

    const existing = await prisma.pagamentoDipendente.findUnique({
      where: { dipendenteId_anno_mese_tipo: { dipendenteId, anno, mese, tipo } },
    })

    if (existing) {
      // toggle off → elimina spesa + record
      if (existing.spesaId) {
        await prisma.spesa.deleteMany({ where: { id: existing.spesaId } })
      }
      await prisma.pagamentoDipendente.delete({ where: { id: existing.id } })
      return NextResponse.json({ pagato: false })
    }

    // toggle on → crea spesa + record
    const dipendente = await prisma.dipendente.findUnique({ where: { id: dipendenteId } })
    if (!dipendente) {
      return NextResponse.json({ error: 'dipendente non trovato' }, { status: 404 })
    }

    const importo = tipo === 'stipendio' ? dipendente.nettoBustaPaga : dipendente.seguridadSocial
    const categoria = tipo === 'stipendio' ? 'Stipendio' : 'Seguridad Social'
    const descrizione = tipo === 'stipendio'
      ? `Stipendio mensile — ${dipendente.nome}`
      : `Seguridad Social — ${dipendente.nome}`

    const spesa = await prisma.spesa.create({
      data: {
        azienda: 'Spagna',
        fornitore: dipendente.nome,
        categoria,
        descrizione,
        mese,
        anno,
        importo,
      },
    })

    await prisma.pagamentoDipendente.create({
      data: { dipendenteId, anno, mese, tipo, spesaId: spesa.id },
    })

    return NextResponse.json({ pagato: true, spesaId: spesa.id })
  } catch (e) {
    console.error('[POST /api/dipendenti/[id]/pagamento]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SEED = [
  { tipo: 'Busta paga Leonardo Mestre', cadenza: 'MENSILE', dataPagamento: 'indicativamente metà/fine mese', costo: 1780.95, costoMensile: 1780.95 },
  { tipo: 'Busta paga Lorenzo Vanghetti', cadenza: 'MENSILE', dataPagamento: 'indicativamente metà/fine mese', costo: 2000, costoMensile: 2000 },
  { tipo: 'Presentación de pagos fraccionados modelos 111,115,420,202', cadenza: 'TRIMESTRALE', dataPagamento: 'Aprile, Luglio, Ottobre, Gennaio', costo: 90, costoMensile: 30 },
  { tipo: 'Impuesto de Sociedades', cadenza: "UNA VOLTA ALL'ANNO", dataPagamento: '25 luglio', costo: 150, costoMensile: 12.5 },
  { tipo: 'Cuentas Anuales Registro Mercantil', cadenza: "UNA VOLTA ALL'ANNO", dataPagamento: '25 luglio', costo: 150, costoMensile: 12.5 },
  { tipo: 'Seguridad Social Leonardo Mestre (quota intera)', cadenza: 'MENSILE', dataPagamento: '30 del mese in corso', costo: 315, costoMensile: 315 },
  { tipo: 'Seguridad Social Lorenzo Vanghetti (prezzo agevolato primo anno)', cadenza: 'MENSILE', dataPagamento: '30 del mese in corso', costo: 87.61, costoMensile: 88.56 },
  { tipo: 'I.R.P.F. Leonardo Mestre 7% del netto busta paga', cadenza: 'TRIMESTRALE', dataPagamento: '20 Aprile, 20 Giugno, 20 Ottobre, 20 Gennaio', costo: 134.05, costoMensile: 134.05 },
  { tipo: 'I.R.P.F. Lorenzo Vanghetti 12,64% del netto busta paga', cadenza: 'TRIMESTRALE', dataPagamento: '20 Aprile, 20 Giugno, 20 Ottobre, 20 Gennaio', costo: 302.27, costoMensile: 302.27 },
  { tipo: "Tasse sull'utile 18% anno precedente", cadenza: 'QUADRIMESTRALE', dataPagamento: 'Ottobre, Dicembre, Aprile', costo: 0, costoMensile: 0 },
  { tipo: 'Pago fraccionado Tarjeta de Empresa', cadenza: 'MENSILE', dataPagamento: '5 del mese', costo: 100, costoMensile: 100 },
]

export async function GET() {
  try {
    let rows = await prisma.spesaFissa.findMany({ orderBy: [{ ordine: 'asc' }, { id: 'asc' }] })
    if (rows.length === 0) {
      await prisma.spesaFissa.createMany({
        data: SEED.map((r, i) => ({ ...r, ordine: i })),
      })
      rows = await prisma.spesaFissa.findMany({ orderBy: [{ ordine: 'asc' }, { id: 'asc' }] })
    }
    return NextResponse.json(rows)
  } catch (e) {
    console.error('[GET /api/spese-fisse]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const count = await prisma.spesaFissa.count()
    const row = await prisma.spesaFissa.create({
      data: {
        tipo: body.tipo || '',
        cadenza: body.cadenza || 'MENSILE',
        dataPagamento: body.dataPagamento || '',
        costo: Number(body.costo) || 0,
        costoMensile: Number(body.costoMensile) || 0,
        ordine: count,
      },
    })
    return NextResponse.json(row)
  } catch (e) {
    console.error('[POST /api/spese-fisse]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fatturaId = Number(body.fatturaId);
    const importo = Number(body.importo);

    if (!fatturaId || Number.isNaN(fatturaId)) {
      return NextResponse.json({ error: "fatturaId mancante" }, { status: 400 });
    }
    if (!importo || importo <= 0) {
      return NextResponse.json(
        { error: "importo deve essere > 0" },
        { status: 400 },
      );
    }

    const fattura = await prisma.fattura.findUnique({
      where: { id: fatturaId },
      include: { acconti: true },
    });
    if (!fattura) {
      return NextResponse.json({ error: "Fattura non trovata" }, { status: 404 });
    }

    const acconto = await prisma.acconto.create({
      data: {
        fatturaId,
        importo,
        data: body.data ? new Date(body.data) : new Date(),
        metodoPagamento: body.metodoPagamento || null,
        note: body.note || null,
      },
    });

    const totalePagato =
      fattura.acconti.reduce((s, a) => s + a.importo, 0) + importo;
    const residuo = Math.max(0, fattura.importo - totalePagato);

    const pagato = fattura.pagato;

    return NextResponse.json({ acconto, totalePagato, residuo, pagato });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/acconti] errore:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

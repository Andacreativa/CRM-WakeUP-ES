import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RINNOVO_INCLUDE, creaRichiestaRinnovo, serializzaRinnovo } from "@/lib/rinnovi";
import { serializzaRichiesta } from "@/lib/richieste";

type Ctx = { params: Promise<{ id: string }> };

// Richiesta di fattura per la scadenza attuale del rinnovo (una sola).
export async function POST(_: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const r = await prisma.rinnovoSito.findUnique({
      where: { id: parseInt(id, 10) },
      include: RINNOVO_INCLUDE,
    });
    if (!r || r.deletedAt) {
      return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    }
    const s = serializzaRinnovo(r);
    if (s.richiestaCorrente) {
      return NextResponse.json(
        { error: `C'è già la richiesta ${s.richiestaCorrente.codice} per questa scadenza` },
        { status: 409 },
      );
    }
    if (!r.clienteId && !r.nomeCliente) {
      return NextResponse.json({ error: "Prima assegna il cliente" }, { status: 400 });
    }
    if (r.importo <= 0) {
      return NextResponse.json({ error: "Manca l'importo del rinnovo" }, { status: 400 });
    }
    const richiesta = await prisma.$transaction((tx) => creaRichiestaRinnovo(tx, r));
    return NextResponse.json(serializzaRichiesta(richiesta));
  } catch (e) {
    console.error("[POST /api/rinnovi/[id]/crea-richiesta]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

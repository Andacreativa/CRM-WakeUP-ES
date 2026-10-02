import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RICHIESTA_INCLUDE, serializzaRichiesta } from "@/lib/richieste";

type Ctx = { params: Promise<{ id: string }> };

// Collega la richiesta a una fattura già esistente.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const richiestaId = parseInt(id, 10);
  const { fatturaId } = (await request.json().catch(() => ({}))) as {
    fatturaId?: number;
  };
  if (!fatturaId) {
    return NextResponse.json({ error: "fatturaId mancante" }, { status: 400 });
  }
  const fattura = await prisma.fattura.findUnique({
    where: { id: fatturaId },
    include: { richiesta: { select: { id: true, codice: true } } },
  });
  if (!fattura) {
    return NextResponse.json({ error: "Fattura non trovata" }, { status: 404 });
  }
  if (fattura.richiesta && fattura.richiesta.id !== richiestaId) {
    return NextResponse.json(
      { error: `Fattura già collegata alla richiesta ${fattura.richiesta.codice}` },
      { status: 409 },
    );
  }
  const r = await prisma.richiestaFattura.update({
    where: { id: richiestaId },
    data: {
      fatturaId,
      emessa: true,
      emessaIl: fattura.data ?? new Date(),
    },
    include: RICHIESTA_INCLUDE,
  });
  return NextResponse.json(serializzaRichiesta(r));
}

// Scollega la fattura: la richiesta torna "da fare".
export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await prisma.richiestaFattura.update({
    where: { id: parseInt(id, 10) },
    data: { fatturaId: null, emessa: false, emessaIl: null, incassata: false },
    include: RICHIESTA_INCLUDE,
  });
  return NextResponse.json(serializzaRichiesta(r));
}

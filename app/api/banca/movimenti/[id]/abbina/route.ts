import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INCLUDE_MOVIMENTO, centesimi, imparaBanca } from "@/lib/banca";

type Ctx = { params: Promise<{ id: string }> };

// POST { spesaIds: number[], forza?: boolean, impara?: boolean }: collega
// il movimento (uscita) a una o più Spese già registrate. Senza `forza`
// la somma delle spese deve coincidere con l'importo del movimento.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const movId = parseInt(id, 10);
    const body = await request.json();
    const ids: number[] = Array.isArray(body.spesaIds)
      ? body.spesaIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => n > 0)
      : body.spesaId
        ? [parseInt(String(body.spesaId), 10)]
        : [];
    if (!ids.length) return NextResponse.json({ error: "Nessuna spesa indicata" }, { status: 400 });

    const mov = await prisma.movimentoBancario.findUnique({
      where: { id: movId },
      include: { abbinamenti: true },
    });
    if (!mov) return NextResponse.json({ error: "Movimento non trovato" }, { status: 404 });
    if (mov.importo >= 0) {
      return NextResponse.json({ error: "Solo le uscite si abbinano a spese" }, { status: 400 });
    }
    if (mov.stato !== "da_abbinare" || mov.abbinamenti.length) {
      return NextResponse.json({ error: "Movimento già gestito" }, { status: 409 });
    }
    const spese = await prisma.spesa.findMany({
      where: { id: { in: ids } },
      include: {
        abbinamentiBancari: { select: { movimentoId: true } },
        pagamentoMensile: { select: { id: true } },
      },
    });
    if (spese.length !== ids.length) {
      return NextResponse.json({ error: "Spesa non trovata" }, { status: 404 });
    }
    const occupata = spese.find((s) => s.abbinamentiBancari.length);
    if (occupata) {
      return NextResponse.json(
        { error: `La spesa #${occupata.id} è già collegata a un altro movimento` },
        { status: 409 },
      );
    }
    const somma = spese.reduce((t, s) => t + s.importo, 0);
    if (!body.forza && Math.abs(centesimi(somma) - centesimi(mov.importo)) > 5) {
      return NextResponse.json(
        {
          error: `Importi diversi: movimento ${Math.abs(mov.importo).toFixed(2)}, spese ${somma.toFixed(2)}`,
          needsForza: true,
        },
        { status: 409 },
      );
    }

    const aggiornato = await prisma.$transaction(async (tx) => {
      await tx.abbinamentoBancario.createMany({
        data: spese.map((s) => ({ movimentoId: mov.id, spesaId: s.id, importo: s.importo })),
      });
      return tx.movimentoBancario.update({
        where: { id: mov.id },
        data: { stato: "abbinato" },
        include: INCLUDE_MOVIMENTO,
      });
    });
    // Le righe del registro pagamenti sono per persona: non si imparano
    if (body.impara !== false && spese.length === 1 && !spese[0].pagamentoMensile) {
      await imparaBanca(prisma, mov.beneficiario, {
        categoria: spese[0].categoria,
        fornitore: spese[0].fornitore,
      });
    }
    return NextResponse.json({ ...aggiornato, suggerimento: null });
  } catch (e) {
    console.error("[POST /api/banca/movimenti/id/abbina]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

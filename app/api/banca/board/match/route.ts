import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroreIncasso, incassaMovimento } from "@/lib/banca-incasso";

// POST { movimentoId, fatturaId, importo? } — il bonifico (o quel che ne
// resta) copre la fattura: acconto con la data del bonifico + collegamento.
// POST { movimentoId, altroIngresso: { categoria } } — non è l'incasso di una
// fattura: registra un altro ingresso (cashback, rimborso tasse…).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const movimentoId = parseInt(String(body.movimentoId), 10);
    if (!movimentoId) return NextResponse.json({ error: "movimentoId mancante" }, { status: 400 });
    const fatturaId = parseInt(String(body.fatturaId ?? 0), 10) || 0;
    const importo = body.importo !== undefined ? Number(body.importo) : undefined;
    const mov = await incassaMovimento(prisma, movimentoId, {
      fatture: fatturaId ? [{ id: fatturaId, importo }] : [],
      altroIngresso: body.altroIngresso?.categoria ? { categoria: String(body.altroIngresso.categoria) } : null,
    });
    return NextResponse.json({ ok: true, movimento: mov });
  } catch (e) {
    if (e instanceof ErroreIncasso) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/banca/board/match]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

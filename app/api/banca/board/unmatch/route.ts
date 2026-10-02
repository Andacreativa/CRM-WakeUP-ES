import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scollegaMovimento } from "@/lib/banca-incasso";

// POST { movimentoId, fatturaId? } — annulla l'abbinamento (di una fattura o
// di tutto il bonifico): via l'acconto, la fattura torna in attesa se serve.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const movimentoId = parseInt(String(body.movimentoId), 10);
    if (!movimentoId) return NextResponse.json({ error: "movimentoId mancante" }, { status: 400 });
    const fatturaId = parseInt(String(body.fatturaId ?? 0), 10) || undefined;
    const mov = await scollegaMovimento(prisma, movimentoId, fatturaId);
    return NextResponse.json({ ok: true, movimento: mov });
  } catch (e) {
    console.error("[POST /api/banca/board/unmatch]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

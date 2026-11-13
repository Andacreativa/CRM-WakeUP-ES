import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INCLUDE_MOVIMENTO } from "@/lib/banca";
import { isVoceRegistroBanca } from "@/lib/banca-shared";
import { ErroreRegistro, collegaRegistro, type RigaInput } from "@/lib/registro-banca";

type Ctx = { params: Promise<{ id: string }> };

// POST { righe: [{ dipendenteId, voce, mese, anno, importo, pagamentoId?, nuova? }],
//        resto?: { importo, descrizione, mese, anno } }
// Il movimento (uscita) paga queste righe del registro pagamenti: quelle
// già registrate si collegano, le altre si creano con la loro spesa.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const movId = parseInt(id, 10);
    const body = await request.json();
    const righe: RigaInput[] = Array.isArray(body.righe)
      ? body.righe.filter((r: { voce?: unknown }) => r && isVoceRegistroBanca(r.voce))
      : [];
    if (!righe.length || righe.length !== (body.righe?.length ?? 0)) {
      return NextResponse.json({ error: "Righe del registro non valide" }, { status: 400 });
    }
    await collegaRegistro(prisma, movId, righe, body.resto ?? null);
    const aggiornato = await prisma.movimentoBancario.findUnique({
      where: { id: movId },
      include: INCLUDE_MOVIMENTO,
    });
    return NextResponse.json({ ...aggiornato, suggerimento: null });
  } catch (e) {
    if (e instanceof ErroreRegistro) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/banca/movimenti/id/registro]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

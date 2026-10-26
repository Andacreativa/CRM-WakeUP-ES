import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroreAbbonamento, baseUrl, cambiaStato, serializzaAbbonamento } from "@/lib/abbonamenti";

// Sospendi / riattiva / cancella (con data di fine, default fine mese)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { stato?: string; dataFine?: string };
    const stato = body.stato;
    if (stato !== "attivo" && stato !== "sospeso" && stato !== "cancellato") {
      return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    }
    const dataFine = body.dataFine ? new Date(body.dataFine) : null;
    if (dataFine && isNaN(dataFine.getTime())) return NextResponse.json({ error: "Data di fine non valida" }, { status: 400 });
    const a = await cambiaStato(prisma, parseInt(id, 10) || 0, stato, { dataFine });
    return NextResponse.json(serializzaAbbonamento(a, baseUrl(request)));
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/abbonamenti/[id]/stato]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

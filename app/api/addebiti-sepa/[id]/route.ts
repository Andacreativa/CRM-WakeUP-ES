import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroreAbbonamento, segnaAddebito } from "@/lib/abbonamenti";

// Stato del singolo addebito: incassato / devuelto / previsto / annullato
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { stato?: string; motivo?: string };
    const stato = body.stato;
    if (stato !== "previsto" && stato !== "incassato" && stato !== "devuelto" && stato !== "annullato") {
      return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    }
    return NextResponse.json(await segnaAddebito(prisma, parseInt(id, 10) || 0, stato, { motivo: body.motivo }));
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[PATCH /api/addebiti-sepa/[id]]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroreAbbonamento, baseUrl } from "@/lib/abbonamenti";
import { disdiciArea, serializzaArea } from "@/lib/abbonamenti-area";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { inviaConfermaDisdetta } from "@/lib/abbonamenti-mail";
import { emailArea } from "@/lib/area-token";

export const runtime = "nodejs";

// Disdetta dall'area: vale fino a fine mese, poi niente addebiti né fatture
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const email = await emailArea(request);
  if (!email) return NextResponse.json({ error: "accesso" }, { status: 401 });
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { conferma?: boolean };
    if (body.conferma !== true) return NextResponse.json({ error: "conferma" }, { status: 400 });
    const a = await disdiciArea(prisma, parseInt(id, 10) || 0, email);
    const invio = await inviaConfermaDisdetta(a, baseUrl(request));
    const [cfg] = await getCreditore(prisma);
    return NextResponse.json({ ok: true, abbonamento: serializzaArea(a, cfg), dataFine: a.dataFine, emailInviata: invio.cliente.inviata });
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/public/area/abbonamenti/[id]/baja]", e);
    return NextResponse.json({ error: "errore" }, { status: 500 });
  }
}

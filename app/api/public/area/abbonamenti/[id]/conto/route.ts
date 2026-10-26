import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroreAbbonamento, baseUrl } from "@/lib/abbonamenti";
import { cambiaContoArea, serializzaArea } from "@/lib/abbonamenti-area";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { inviaConfermaCambioConto } from "@/lib/abbonamenti-mail";
import { emailArea } from "@/lib/area-token";

export const runtime = "nodejs";

const ipDi = (request: Request) =>
  (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || null;

// Nuovo conto = nuovo mandato SEPA firmato adesso (spunta + data + IP);
// al cliente il PDF, all'agenzia l'avviso.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const email = await emailArea(request);
  if (!email) return NextResponse.json({ error: "accesso" }, { status: 401 });
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const firma = { ip: ipDi(request), userAgent: request.headers.get("user-agent") };
    const { a, precedente } = await cambiaContoArea(parseInt(id, 10) || 0, email, body, firma);
    const invio = await inviaConfermaCambioConto(a, baseUrl(request), precedente);
    const [cfg] = await getCreditore(prisma);
    return NextResponse.json({
      ok: true,
      abbonamento: serializzaArea(a, cfg),
      mandatoRef: a.mandatoRef,
      emailInviata: invio.cliente.inviata,
    });
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/public/area/abbonamenti/[id]/conto]", e);
    return NextResponse.json({ error: "errore" }, { status: 500 });
  }
}

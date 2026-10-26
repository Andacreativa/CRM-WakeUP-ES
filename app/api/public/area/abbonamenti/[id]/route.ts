import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroreAbbonamento, baseUrl } from "@/lib/abbonamenti";
import { aggiornaDatiArea, serializzaArea } from "@/lib/abbonamenti-area";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { inviaAvvisoDatiArea } from "@/lib/abbonamenti-mail";
import { AREA_COOKIE, COOKIE_AREA_OPTIONS, DURATA_SESSIONE, creaTokenArea, emailArea } from "@/lib/area-token";

export const runtime = "nodejs";

// Il cliente aggiorna i propri dati di contatto. Se cambia l'email, il
// cookie viene riemesso per la nuova (l'area è legata all'email).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const email = await emailArea(request);
  if (!email) return NextResponse.json({ error: "accesso" }, { status: 401 });
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { a, modifiche } = await aggiornaDatiArea(prisma, parseInt(id, 10) || 0, email, body);
    if (modifiche.length) await inviaAvvisoDatiArea(a, modifiche, baseUrl(request));
    const [cfg] = await getCreditore(prisma);
    const res = NextResponse.json({ ok: true, abbonamento: serializzaArea(a, cfg), modifiche: modifiche.length, email: a.email });
    if (a.email.toLowerCase() !== email.toLowerCase()) {
      res.cookies.set(AREA_COOKIE, await creaTokenArea(a.email, "sessione", DURATA_SESSIONE), COOKIE_AREA_OPTIONS);
    }
    return res;
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[PATCH /api/public/area/abbonamenti/[id]]", e);
    return NextResponse.json({ error: "errore" }, { status: 500 });
  }
}

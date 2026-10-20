import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventiCalendario, tokenIcal, ymd } from "@/lib/calendario";

export const runtime = "nodejs";

// Eventi del calendario fra due date (incluse), più le richieste senza data
// e l'indirizzo del feed iCal da aggiungere a Google/Apple Calendar.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const valida = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const oggi = ymd(new Date());
  const da = valida(searchParams.get("da")) ?? oggi;
  const a = valida(searchParams.get("a")) ?? oggi;
  if (a < da) return NextResponse.json({ error: "Intervallo non valido" }, { status: 400 });
  const domini = searchParams.get("domini") === "1";

  const { eventi, senzaData } = await eventiCalendario(prisma, { da, a, domini, oggi });
  const token = tokenIcal();
  // L'indirizzo pubblico dell'app, se Vercel ce lo dice, altrimenti quello della richiesta
  const base = process.env.APP_URL?.replace(/\/$/, "") || origin;
  return NextResponse.json({
    da,
    a,
    eventi,
    senzaData,
    icalUrl: token ? `${base}/api/calendario/ical?t=${token}` : null,
  });
}

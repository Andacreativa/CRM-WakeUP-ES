import { prisma } from "@/lib/prisma";
import { calendarioIcs, eventiCalendario, tokenIcal, ymd } from "@/lib/calendario";

export const runtime = "nodejs";

// Feed iCal per Google Calendar / Apple Calendar: senza sessione (il proxy lo
// lascia passare), protetto dal token `t`. Da due mesi fa a un anno avanti;
// le fatture pagate e le richieste già emesse non ci sono.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token = tokenIcal();
  if (!token) return new Response("Feed non configurato", { status: 503 });
  if (searchParams.get("t") !== token) return new Response("Non autorizzato", { status: 401 });

  const oggi = new Date();
  const da = new Date(oggi);
  da.setUTCMonth(da.getUTCMonth() - 2);
  const a = new Date(oggi);
  a.setUTCFullYear(a.getUTCFullYear() + 1);
  const { eventi } = await eventiCalendario(prisma, {
    da: ymd(da),
    a: ymd(a),
    domini: searchParams.get("domini") === "1",
    oggi: ymd(oggi),
  });
  const base = process.env.APP_URL?.replace(/\/$/, "") || origin;
  const ics = calendarioIcs(eventi.filter((e) => e.stato !== "pagata"), base, oggi);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="anda-finance.ics"',
      "Cache-Control": "no-store",
    },
  });
}

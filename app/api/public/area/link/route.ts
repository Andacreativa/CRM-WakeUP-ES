import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { whereArea } from "@/lib/abbonamenti-area";
import { inviaLinkAccessoArea } from "@/lib/abbonamenti-mail";
import { baseUrl } from "@/lib/abbonamenti";
import { linguaValida } from "@/components/abbonamenti/tipi";

export const runtime = "nodejs";

// «Mandami il link di accesso»: se l'email ha almeno un abbonamento firmato
// parte la mail con il link (60 minuti). La risposta è la stessa in ogni
// caso: da fuori non si capisce quali email esistono.
const ipDi = (request: Request) =>
  (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || null;

const tentativi = new Map<string, number[]>();
function troppiTentativi(ip: string | null) {
  if (!ip) return false;
  const ora = Date.now();
  const lista = (tentativi.get(ip) ?? []).filter((t) => ora - t < 10 * 60_000);
  lista.push(ora);
  tentativi.set(ip, lista);
  return lista.length > 5;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (String(body.sitio_web ?? "").trim()) return NextResponse.json({ ok: true });
    if (troppiTentativi(ipDi(request))) return NextResponse.json({ error: "troppi_tentativi" }, { status: 429 });
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "email_non_valida" }, { status: 400 });
    const primo = await prisma.abbonamento.findFirst({ where: whereArea(email), select: { lingua: true }, orderBy: { createdAt: "asc" } });
    if (primo) {
      const lingua = body.lang ? linguaValida(body.lang) : linguaValida(primo.lingua);
      const invio = await inviaLinkAccessoArea(email, lingua, baseUrl(request));
      if (!invio.inviata) console.warn(`[area] link di accesso non inviato a ${email}: ${invio.errore}`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/public/area/link]", e);
    return NextResponse.json({ error: "errore" }, { status: 500 });
  }
}

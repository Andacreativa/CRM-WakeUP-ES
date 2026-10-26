import { NextResponse } from "next/server";
import { AREA_COOKIE, COOKIE_AREA_OPTIONS, DURATA_SESSIONE, creaTokenArea, leggiTokenArea } from "@/lib/area-token";
import { baseUrl } from "@/lib/abbonamenti";
import { linguaValida } from "@/components/abbonamenti/tipi";

export const runtime = "nodejs";

// Il link delle email: scambia il token «link» con il cookie di sessione
// (24 ore) e manda alla pagina dell'area. Link scaduto o manomesso → la
// pagina con l'avviso e il modulo per chiederne uno nuovo.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get("lang") ? linguaValida(searchParams.get("lang")) : null;
  const base = baseUrl(request);
  const coda = lang ? `?lang=${lang}` : "";
  const t = await leggiTokenArea(searchParams.get("t"), "link");
  if (!t) return NextResponse.redirect(`${base}/suscripcion/area${coda}${coda ? "&" : "?"}err=link`, { status: 303 });
  const sessione = await creaTokenArea(t.email, "sessione", DURATA_SESSIONE);
  const res = NextResponse.redirect(`${base}/suscripcion/area${coda}`, { status: 303 });
  res.cookies.set(AREA_COOKIE, sessione, COOKIE_AREA_OPTIONS);
  return res;
}

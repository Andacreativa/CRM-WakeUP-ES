import { NextResponse } from "next/server";
import { svuotaCodaVerifactu } from "@/lib/verifactu/coda";

// Manda all'AEAT i registri VeriFactu rimasti in coda (AEAT giù al momento
// dell'emissione, fatture degli abbonamenti). Lo chiama il cron dei rinnovi
// ogni mattina e lo può chiamare un orologio esterno più spesso: niente
// sessione, vale `Authorization: Bearer CRON_SECRET` come gli altri cron.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const esito = await svuotaCodaVerifactu();
    if (esito.inviati || esito.inCoda || esito.errore)
      console.log(`[cron verifactu] inviati ${esito.inviati}, in coda ${esito.inCoda}${esito.errore ? `, errore: ${esito.errore}` : ""}`);
    return NextResponse.json(esito);
  } catch (e) {
    console.error("[GET /api/cron/verifactu]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { generaRichiesteInScadenza } from "@/lib/rinnovi";
import { svuotaCodaVerifactu } from "@/lib/verifactu/coda";

// Cron giornaliero (vercel.json): crea le richieste di fattura dei rinnovi
// che entrano nell'anticipo. Vercel manda `Authorization: Bearer CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const esito = await generaRichiesteInScadenza();
    console.log(`[cron rinnovi] create ${esito.create.length}, già fatte ${esito.giaFatte}`);
    // Stesso giro mattutino: i registri VeriFactu rimasti in coda ripartono
    // (il piano Vercel non permette un terzo cron)
    const verifactu = await svuotaCodaVerifactu().catch((e) => ({
      errore: e instanceof Error ? e.message : String(e),
    }));
    return NextResponse.json({ ...esito, verifactu });
  } catch (e) {
    console.error("[GET /api/cron/rinnovi]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

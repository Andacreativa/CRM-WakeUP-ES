import { NextResponse } from "next/server";
import { generaRichiesteInScadenza } from "@/lib/rinnovi";

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
    return NextResponse.json(esito);
  } catch (e) {
    console.error("[GET /api/cron/rinnovi]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

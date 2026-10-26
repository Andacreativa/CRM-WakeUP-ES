import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroreAbbonamento, baseUrl, creaRemessa } from "@/lib/abbonamenti";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { inviaFattureRemessa } from "@/lib/abbonamenti-mail";

export const runtime = "nodejs";

// Crea la remessa del mese (fichero pain.008) con gli addebiti previsti, le
// fatture delle quote e, se impostato, le manda per email.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      anno?: number;
      mese?: number;
      dataAddebito?: string;
      addebitoIds?: number[];
    };
    const anno = Number(body.anno);
    const mese = Number(body.mese);
    if (!anno || !mese || mese < 1 || mese > 12) return NextResponse.json({ error: "Mese non valido" }, { status: 400 });
    const dataAddebito = body.dataAddebito ? new Date(body.dataAddebito) : null;
    if (dataAddebito && isNaN(dataAddebito.getTime())) return NextResponse.json({ error: "Data di addebito non valida" }, { status: 400 });
    const esito = await creaRemessa({
      anno,
      mese,
      dataAddebito,
      addebitoIds: Array.isArray(body.addebitoIds) ? body.addebitoIds.map(Number).filter(Boolean) : null,
    });
    const [cfg] = await getCreditore(prisma);
    const email = cfg.fatturaAutomatica && cfg.emailFattura && esito.fattureIds.length ? await inviaFattureRemessa(esito.fattureIds, baseUrl(request)) : [];
    return NextResponse.json({
      ...esito,
      email: { inviate: email.filter((e) => e.esito.inviata).length, nonInviate: email.filter((e) => !e.esito.inviata) },
    });
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/addebiti-sepa/remessa]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

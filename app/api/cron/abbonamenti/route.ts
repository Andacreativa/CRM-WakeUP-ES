import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generaAddebitiMese } from "@/lib/abbonamenti";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { inviaMail, mailConfigurata } from "@/lib/mail";
import { fmt, MESI } from "@/lib/constants";

export const runtime = "nodejs";

// Cron giornaliero (vercel.json): crea gli addebiti «previsti» del mese in
// corso per gli abbonamenti attivi; quando ne nascono, avvisa l'agenzia
// che la remessa è da generare in Finance › Addebiti SEPA.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const oggi = new Date();
    const anno = oggi.getUTCFullYear();
    const mese = oggi.getUTCMonth() + 1;
    const esito = await generaAddebitiMese(prisma, anno, mese);
    console.log(`[cron abbonamenti] ${anno}-${mese}: creati ${esito.creati}, già fatti ${esito.giaFatti}`);
    let avviso = false;
    if (esito.creati > 0 && mailConfigurata()) {
      const [cfg] = await getCreditore(prisma);
      const a = cfg.notificaEmail.trim();
      if (a) {
        const previsti = await prisma.addebitoSepa.findMany({ where: { anno, mese, stato: "previsto" }, select: { importo: true } });
        const totale = previsti.reduce((s, x) => s + x.importo, 0);
        const base = process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
        await inviaMail({
          a,
          oggetto: `Addebiti SEPA di ${MESI[mese - 1].toLowerCase()} ${anno}: ${previsti.length} da mandare in banca`,
          testo:
            `Sono pronti ${previsti.length} addebiti per ${MESI[mese - 1].toLowerCase()} ${anno}, in tutto ${fmt(totale)}.\n` +
            `Genera la remessa e carica il fichero in BBVA da Finance › Addebiti SEPA:\n${base}/finance/addebiti\n`,
          nomeMittente: "Anda Finance",
        });
        avviso = true;
      }
    }
    return NextResponse.json({ anno, mese, ...esito, avviso });
  } catch (e) {
    console.error("[GET /api/cron/abbonamenti]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADDEBITO_RIGA_INCLUDE, dataAddebitoMese, generaAddebitiMese } from "@/lib/abbonamenti";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";

const oggiUTC = () => {
  const d = new Date();
  return { anno: d.getUTCFullYear(), mese: d.getUTCMonth() + 1 };
};

// Addebiti del mese (Finance › Addebiti SEPA) con totali, data proposta e
// quanti abbonamenti attivi non hanno ancora l'addebito.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const oggi = oggiUTC();
  const anno = parseInt(searchParams.get("anno") || "", 10) || oggi.anno;
  const mese = parseInt(searchParams.get("mese") || "", 10) || oggi.mese;
  const [cfg] = await getCreditore(prisma);
  const [addebiti, attivi] = await Promise.all([
    prisma.addebitoSepa.findMany({
      where: { anno, mese, abbonamento: { deletedAt: null } },
      include: ADDEBITO_RIGA_INCLUDE,
      orderBy: [{ stato: "asc" }, { id: "asc" }],
    }),
    prisma.abbonamento.count({
      where: {
        deletedAt: null,
        stato: "attivo",
        mandatoFirmatoIl: { not: null },
        AND: [
          { OR: [{ dataInizio: null }, { dataInizio: { lte: new Date(Date.UTC(anno, mese, 0)) } }] },
          { OR: [{ dataFine: null }, { dataFine: { gte: new Date(Date.UTC(anno, mese - 1, 1)) } }] },
        ],
        addebiti: { none: { anno, mese } },
      },
    }),
  ]);
  const somma = (stato?: string) =>
    addebiti.filter((a) => (stato ? a.stato === stato : a.stato !== "annullato")).reduce((s, a) => s + a.importo, 0);
  return NextResponse.json({
    anno,
    mese,
    addebiti,
    totali: {
      tutti: somma(),
      previsti: somma("previsto"),
      inRemessa: somma("in_remessa"),
      incassati: somma("incassato"),
      devueltos: somma("devuelto"),
    },
    daGenerare: attivi,
    dataAddebitoProposta: dataAddebitoMese(anno, mese, cfg.giornoAddebito),
    giornoAddebito: cfg.giornoAddebito,
    fatturaAutomatica: cfg.fatturaAutomatica,
    emailFattura: cfg.emailFattura,
  });
}

// Genera gli addebiti previsti del mese (idempotente)
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { anno?: number; mese?: number };
    const oggi = oggiUTC();
    const anno = Number(body.anno) || oggi.anno;
    const mese = Number(body.mese) || oggi.mese;
    if (mese < 1 || mese > 12) return NextResponse.json({ error: "Mese non valido" }, { status: 400 });
    return NextResponse.json(await generaAddebitiMese(prisma, anno, mese));
  } catch (e) {
    console.error("[POST /api/addebiti-sepa]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

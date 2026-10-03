import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RICHIESTA_INCLUDE, parseVoci, serializzaRichiesta } from "@/lib/richieste";
import { getImpostazioniFatture, prossimoNumeroFattura } from "@/lib/impostazioni";

// Converte la richiesta in una fattura vera (registro Fatture) e la collega.
// Richiede la validazione. I dati della fattura (numero, data, scadenza,
// metodo) arrivano dal form precompilato. Con VeriFactu acceso nasce una
// bozza: numero e registro arrivano quando la si emette dal suo pannello.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const richiestaId = parseInt(id, 10);
    const body = (await request.json().catch(() => ({}))) as {
      numero?: string;
      data?: string;
      scadenza?: string;
      metodo?: string;
    };
    const r = await prisma.richiestaFattura.findUnique({
      where: { id: richiestaId },
    });
    if (!r || r.deletedAt) {
      return NextResponse.json({ error: "Non trovata" }, { status: 404 });
    }
    if (r.fatturaId) {
      return NextResponse.json(
        { error: "Richiesta già collegata a una fattura" },
        { status: 409 },
      );
    }
    if (r.validazione !== "ok") {
      return NextResponse.json(
        { error: "Valida la richiesta prima di creare la fattura" },
        { status: 409 },
      );
    }

    const dataFattura = body.data ? new Date(body.data) : new Date();
    const cfg = await getImpostazioniFatture(prisma);
    const bozza = cfg.vfModo !== "spento";
    // Le righe della richiesta diventano le righe della fattura, se i conti tornano
    const righe = parseVoci(r.voci);
    const voci =
      righe.length && Math.abs(righe.reduce((s, v) => s + v.importo, 0) - r.imponibile) < 0.01
        ? righe.map((v) => ({ descrizione: v.descrizione, quantita: 1, prezzo: v.importo }))
        : [];
    const result = await prisma.$transaction(async (tx) => {
      const numero = bozza
        ? null
        : body.numero?.trim() || (await prossimoNumeroFattura(tx, r.anno, cfg));
      const fattura = await tx.fattura.create({
        data: {
          numero,
          data: dataFattura,
          stato: bozza ? "bozza" : "emessa",
          emessaIl: bozza ? null : new Date(),
          descrizione: r.descrizione?.trim() || null,
          voci: JSON.stringify(voci),
          clienteId: r.clienteId,
          contrattoId: r.contrattoId,
          azienda: r.azienda,
          aziendaNota: r.aziendaNota,
          mese: r.mese,
          anno: r.anno,
          importo: r.imponibile,
          tipoIva: r.tipoIva,
          iva: r.iva,
          pagato: false,
          inviata: false,
          origine: "finance",
          metodo: body.metodo?.trim() || null,
          scadenza: body.scadenza ? new Date(body.scadenza) : null,
        },
      });
      const richiesta = await tx.richiestaFattura.update({
        where: { id: richiestaId },
        data: bozza
          ? { fatturaId: fattura.id }
          : { fatturaId: fattura.id, emessa: true, emessaIl: dataFattura },
        include: RICHIESTA_INCLUDE,
      });
      return { fattura, richiesta };
    });

    return NextResponse.json({
      fattura: result.fattura,
      richiesta: serializzaRichiesta(result.richiesta),
    });
  } catch (e) {
    console.error("[POST /api/richieste-fattura/[id]/crea-fattura]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RICHIESTA_INCLUDE, parseVoci, serializzaRichiesta } from "@/lib/richieste";
import { causaIgicProposta, getImpostazioniFatture, prossimoNumeroFattura } from "@/lib/impostazioni";

// Converte la richiesta in una fattura vera (registro Fatture) e la collega.
// Richiede la validazione. I dati della fattura (numero, data, scadenza,
// metodo) arrivano dal form precompilato. Con VeriFactu acceso nasce una
// bozza: numero e registro arrivano quando la si emette dal suo pannello.
// La fattura emessa è nella lingua del PDF (spagnolo: va al commercialista e
// all'AEAT): le righe arrivano dal modale già tradotte e riviste, la
// descrizione dell'operazione è quella di default delle Impostazioni
// («Servicios de Publicidad»), mai il testo italiano della richiesta.
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
      voci?: { descrizione?: string; importo?: number }[];
    };
    const r = await prisma.richiestaFattura.findUnique({
      where: { id: richiestaId },
      include: { cliente: { select: { paese: true } } },
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
    // Le righe: quelle riviste nel modale se i conti tornano con l'imponibile,
    // altrimenti quelle della richiesta; senza righe, una sola con la sua descrizione
    const tornano = (vs: { descrizione: string; importo: number }[]) =>
      vs.length > 0 &&
      vs.every((v) => v.descrizione) &&
      Math.abs(vs.reduce((s, v) => s + v.importo, 0) - r.imponibile) < 0.01;
    const dalModale = (Array.isArray(body.voci) ? body.voci : []).map((v) => ({
      descrizione: String(v?.descrizione ?? "").trim(),
      importo: Number(v?.importo) || 0,
    }));
    const dallaRichiesta = parseVoci(r.voci);
    const righe = tornano(dalModale)
      ? dalModale
      : tornano(dallaRichiesta)
        ? dallaRichiesta
        : [{ descrizione: r.descrizione.trim(), importo: r.imponibile }];
    const voci = righe.map((v) => ({ descrizione: v.descrizione, quantita: 1, prezzo: v.importo }));
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
          descrizione: cfg.vfDescrizioneDefault.trim() || null,
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
          // A 0 % serve la causa di esenzione (VeriFactu la esige): quella
          // delle Impostazioni per il paese del cliente, come nel modale
          causaIgic: Number(r.iva) > 0 ? null : causaIgicProposta(r.cliente?.paese, cfg),
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

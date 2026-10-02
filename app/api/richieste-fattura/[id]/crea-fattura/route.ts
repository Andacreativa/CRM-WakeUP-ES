import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RICHIESTA_INCLUDE, serializzaRichiesta } from "@/lib/richieste";
import { prossimoNumeroFattura } from "@/lib/impostazioni";

// Converte la richiesta in una fattura vera (registro Fatture) e la collega.
// Richiede la validazione. I dati della fattura (numero, data, scadenza,
// metodo) arrivano dal form precompilato.
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
    const result = await prisma.$transaction(async (tx) => {
      const numero =
        body.numero?.trim() || (await prossimoNumeroFattura(tx, r.anno));
      const fattura = await tx.fattura.create({
        data: {
          numero,
          data: dataFattura,
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
        data: { fatturaId: fattura.id, emessa: true, emessaIl: dataFattura },
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

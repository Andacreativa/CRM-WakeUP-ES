import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  RICHIESTA_INCLUDE,
  STEP_RICORRENZA,
  avanzaMese,
  calcolaImporti,
  nextCodiceRichiesta,
  parseVoci,
  serializzaRichiesta,
} from "@/lib/richieste";

// Lista richieste con filtri. anno=0 e mese=0 significano "tutti".
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const num = (k: string) => {
    const v = searchParams.get(k);
    return v ? parseInt(v, 10) || 0 : 0;
  };
  const anno = num("anno");
  const mese = num("mese");
  const clienteId = num("clienteId");
  const contrattoId = num("contrattoId");
  const azienda = searchParams.get("azienda") || "";
  const origine = searchParams.get("origine") || "";
  const stato = searchParams.get("stato") || "";
  const q = (searchParams.get("q") || "").trim();

  const where: Prisma.RichiestaFatturaWhereInput = {
    deletedAt: null,
    ...(anno > 0 ? { anno } : {}),
    ...(mese > 0 ? { mese } : {}),
    ...(clienteId > 0 ? { clienteId } : {}),
    ...(contrattoId > 0 ? { contrattoId } : {}),
    ...(azienda ? { azienda } : {}),
    ...(origine ? { origine } : {}),
    ...(q
      ? {
          OR: [
            { descrizione: { contains: q, mode: "insensitive" } },
            { codice: { contains: q, mode: "insensitive" } },
            { nomeCliente: { contains: q, mode: "insensitive" } },
            { cliente: { nome: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.richiestaFattura.findMany({
    where,
    include: RICHIESTA_INCLUDE,
    orderBy: [{ anno: "desc" }, { mese: "desc" }, { codice: "desc" }],
  });

  let out = rows.map(serializzaRichiesta);
  if (stato === "da_validare") out = out.filter((r) => r.stato === "da_validare");
  else if (stato === "da_fare") out = out.filter((r) => r.stato === "da_fare");
  else if (stato === "emesse") out = out.filter((r) => r.emessaEff);
  else if (stato === "da_incassare")
    out = out.filter((r) => r.emessaEff && !r.incassataEff);
  else if (stato === "incassate") out = out.filter((r) => r.incassataEff);

  return NextResponse.json(out);
}

// Crea una richiesta, oppure una serie (ricorrenza + numero ripetizioni).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const voci = parseVoci(body.voci);
    const descrizione = String(body.descrizione ?? "").trim() ||
      voci.map((v) => v.descrizione).filter(Boolean).join(", ");
    const mese = parseInt(body.mese, 10);
    const anno = parseInt(body.anno, 10);
    if (!descrizione || !mese || !anno) {
      return NextResponse.json(
        { error: "Descrizione, mese e anno sono obbligatori" },
        { status: 400 },
      );
    }
    const tipoIva = body.tipoIva === "igic7" ? "igic7" : "igic_exenta";
    const { imponibile, iva, totale } = calcolaImporti(
      voci,
      body.imponibile,
      tipoIva,
    );
    if (imponibile <= 0) {
      return NextResponse.json(
        { error: "Inserisci almeno una voce con importo" },
        { status: 400 },
      );
    }

    const ricorrenza = STEP_RICORRENZA[body.ricorrenza] !== undefined
      ? String(body.ricorrenza)
      : "una_tantum";
    const step = STEP_RICORRENZA[ricorrenza];
    const n = step > 0 ? Math.min(36, Math.max(1, parseInt(body.ripetizioni, 10) || 1)) : 1;
    const validazione = body.autorizzaTutte ? "ok" : "in_attesa";
    const dataInvio = body.dataInvio ? new Date(body.dataInvio) : null;

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      let serieCodice: string | null = null;
      let periodo = { mese, anno };
      for (let i = 0; i < n; i++) {
        const codice = await nextCodiceRichiesta(tx, periodo.anno);
        if (n > 1 && i === 0) serieCodice = codice;
        let invio: Date | null = dataInvio;
        if (dataInvio && i > 0) {
          invio = new Date(dataInvio);
          invio.setMonth(invio.getMonth() + step * i);
        }
        const row = await tx.richiestaFattura.create({
          data: {
            codice,
            clienteId: body.clienteId ? parseInt(body.clienteId, 10) : null,
            nomeCliente: body.nomeCliente?.trim() || null,
            contrattoId: body.contrattoId ? parseInt(body.contrattoId, 10) : null,
            azienda: body.azienda || "Spagna",
            aziendaNota: body.azienda === "Altro" ? body.aziendaNota || null : null,
            descrizione,
            voci: JSON.stringify(voci),
            imponibile,
            tipoIva,
            iva,
            totale,
            mese: periodo.mese,
            anno: periodo.anno,
            dataInvio: invio,
            serieCodice,
            serieIndice: n > 1 ? i + 1 : null,
            serieTotale: n > 1 ? n : null,
            ricorrenza,
            responsabile: body.responsabile?.trim() || null,
            validazione,
            validataIl: validazione === "ok" ? new Date() : null,
            note: body.note?.trim() || null,
            origine: "manuale",
          },
          include: RICHIESTA_INCLUDE,
        });
        rows.push(row);
        periodo = avanzaMese(periodo.mese, periodo.anno, step);
      }
      return rows;
    });

    return NextResponse.json(created.map(serializzaRichiesta));
  } catch (e) {
    console.error("[POST /api/richieste-fattura]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

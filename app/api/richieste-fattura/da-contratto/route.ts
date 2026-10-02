import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  RICHIESTA_INCLUDE,
  avanzaMese,
  calcolaImporti,
  nextCodiceRichiesta,
  serializzaRichiesta,
} from "@/lib/richieste";

// Genera le richieste di fattura di un contratto: una per rata (mensile, a
// partire dal mese di decorrenza) più una per le voci una tantum, se presenti.
// Non crea mai fatture: solo richieste da validare.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      contrattoId?: number;
      autorizzaTutte?: boolean;
    };
    const contrattoId = Number(body.contrattoId);
    if (!contrattoId) {
      return NextResponse.json({ error: "contrattoId mancante" }, { status: 400 });
    }
    const c = await prisma.contratto.findUnique({
      where: { id: contrattoId },
      include: { preventivo: { select: { iva: true } } },
    });
    if (!c) {
      return NextResponse.json({ error: "Contratto non trovato" }, { status: 404 });
    }
    const esistenti = await prisma.richiestaFattura.count({
      where: { contrattoId, deletedAt: null },
    });
    if (esistenti > 0) {
      return NextResponse.json(
        {
          error: `Questo contratto ha già ${esistenti} richieste. Eliminale prima di rigenerarle.`,
          esistenti,
        },
        { status: 409 },
      );
    }

    // Voci una tantum dal JSON del contratto
    let unaTantum = 0;
    const descrUnaTantum: string[] = [];
    try {
      const voci = JSON.parse(c.voci || "[]") as Array<{
        servizio?: string;
        tipo?: string;
        quantita?: number;
        prezzoUnitario?: number;
      }>;
      for (const v of voci) {
        if (v.tipo !== "una_tantum") continue;
        const imp = (Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0);
        unaTantum += imp;
        if (v.servizio) descrUnaTantum.push(v.servizio);
      }
    } catch {
      /* voci non leggibili: nessuna una tantum */
    }

    const tipoIva = c.preventivo?.iva === 7 ? "igic7" : "igic_exenta";
    const dec = new Date(c.dataDecorrenza);
    const giorno = Math.min(dec.getDate(), 28);
    const validazione = body.autorizzaTutte ? "ok" : "in_attesa";
    const n = Math.max(1, c.numeroRate);
    const base = {
      clienteId: c.clienteId,
      nomeCliente: c.clienteId ? null : c.nomeClienteFallback,
      contrattoId: c.id,
      azienda: "Spagna",
      tipoIva,
      responsabile: null,
      validazione,
      validataIl: validazione === "ok" ? new Date() : null,
      origine: "contratto",
      serieCodice: c.numero,
    };

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      let periodo = { mese: dec.getMonth() + 1, anno: dec.getFullYear() };

      if (unaTantum > 0) {
        const descrizione = `${c.oggetto} — Una tantum${
          descrUnaTantum.length ? ` (${descrUnaTantum.join(", ")})` : ""
        }`;
        const voci = [{ descrizione, importo: unaTantum }];
        rows.push(
          await tx.richiestaFattura.create({
            data: {
              ...base,
              codice: await nextCodiceRichiesta(tx, periodo.anno),
              descrizione,
              voci: JSON.stringify(voci),
              ...calcolaImporti(voci, 0, tipoIva),
              mese: periodo.mese,
              anno: periodo.anno,
              dataInvio: new Date(periodo.anno, periodo.mese - 1, giorno),
              ricorrenza: "una_tantum",
            },
            include: RICHIESTA_INCLUDE,
          }),
        );
      }

      for (let i = 0; i < n; i++) {
        const descrizione = `${c.oggetto} — Rata ${i + 1}/${n}`;
        const voci = [{ descrizione, importo: c.importoMensile }];
        rows.push(
          await tx.richiestaFattura.create({
            data: {
              ...base,
              codice: await nextCodiceRichiesta(tx, periodo.anno),
              descrizione,
              voci: JSON.stringify(voci),
              ...calcolaImporti(voci, 0, tipoIva),
              mese: periodo.mese,
              anno: periodo.anno,
              dataInvio: new Date(periodo.anno, periodo.mese - 1, giorno),
              serieIndice: i + 1,
              serieTotale: n,
              ricorrenza: "mensile",
            },
            include: RICHIESTA_INCLUDE,
          }),
        );
        periodo = avanzaMese(periodo.mese, periodo.anno, 1);
      }
      return rows;
    });

    return NextResponse.json(created.map(serializzaRichiesta));
  } catch (e) {
    console.error("[POST /api/richieste-fattura/da-contratto]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

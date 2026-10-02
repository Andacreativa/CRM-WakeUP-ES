import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  INCLUDE_MOVIMENTO,
  NOTA_BANCA,
  NOTA_GIA_INCASSATA,
  centesimi,
  dopoCambioIncasso,
  meseAnno,
  pulisci,
} from "@/lib/banca";

type Ctx = { params: Promise<{ id: string }> };
const CATEGORIE_ALTRO = new Set(["cashback", "rimborso_tasse", "apporto_socio", "incasso_senza_fattura", "altro"]);

// POST { fatture: [{ id, importo? }], altroIngresso?: { categoria, descrizione? } }
// Incassa un bonifico (entrata): per ogni fattura crea un Acconto con la data
// del movimento (metodo "Bonifico") e il collegamento; la fattura diventa
// "incassata" quando gli acconti la coprono. L'importo di ogni fattura, se
// non indicato, è il suo residuo (o l'intero importo se già incassata a mano:
// acconto retroattivo, stato invariato) entro quanto resta del bonifico.
// Quello che avanza va in un Altro ingresso se richiesto, altrimenti resta
// da assegnare (il movimento rimane "da rivedere" con l'assegnazione parziale).
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const movId = parseInt(id, 10);
    const body = await request.json();
    const richieste: { id: number; importo?: number }[] = Array.isArray(body.fatture)
      ? body.fatture
          .map((x: { id: unknown; importo?: unknown }) => ({
            id: parseInt(String(x.id), 10),
            importo: x.importo !== undefined && x.importo !== null ? Number(x.importo) : undefined,
          }))
          .filter((x: { id: number }) => x.id > 0)
      : [];
    const altro =
      body.altroIngresso && CATEGORIE_ALTRO.has(String(body.altroIngresso.categoria))
        ? { categoria: String(body.altroIngresso.categoria), descrizione: pulisci(body.altroIngresso.descrizione) }
        : null;
    if (!richieste.length && !altro) {
      return NextResponse.json({ error: "Indica almeno una fattura o un altro ingresso" }, { status: 400 });
    }

    const mov = await prisma.movimentoBancario.findUnique({
      where: { id: movId },
      include: { abbinamenti: true },
    });
    if (!mov) return NextResponse.json({ error: "Movimento non trovato" }, { status: 404 });
    if (mov.importo <= 0) return NextResponse.json({ error: "Solo le entrate si incassano" }, { status: 400 });
    if (mov.stato !== "da_abbinare") return NextResponse.json({ error: "Movimento già gestito" }, { status: 409 });
    const giaAssegnato = mov.abbinamenti.reduce((t, a) => t + a.importo, 0);
    let resta = Math.round((mov.importo - giaAssegnato) * 100) / 100;
    if (resta <= 0) return NextResponse.json({ error: "Il bonifico è già tutto assegnato" }, { status: 409 });

    const fatture = richieste.length
      ? await prisma.fattura.findMany({
          where: { id: { in: richieste.map((r) => r.id) } },
          include: { acconti: { select: { importo: true } }, abbinamentiBancari: { select: { movimentoId: true } } },
        })
      : [];
    if (fatture.length !== richieste.length) {
      return NextResponse.json({ error: "Fattura non trovata" }, { status: 404 });
    }
    const occupata = fatture.find((f) => f.abbinamentiBancari.some((a) => a.movimentoId !== movId));
    if (occupata) {
      return NextResponse.json(
        { error: `La fattura ${occupata.numero ?? `#${occupata.id}`} è già collegata a un altro bonifico` },
        { status: 409 },
      );
    }

    // Quote: nell'ordine richiesto, residuo (o importo intero se già incassata a mano), entro quanto resta
    const quote: { fatturaId: number; importo: number; primaPagato: boolean; giaIncassata: boolean }[] = [];
    for (const r of richieste) {
      const f = fatture.find((x) => x.id === r.id)!;
      const incassato = f.acconti.reduce((t, a) => t + a.importo, 0);
      const residuo = f.pagato ? f.importo : Math.max(0, f.importo - incassato);
      let importo = r.importo !== undefined && r.importo > 0 ? r.importo : residuo;
      importo = Math.min(importo, resta);
      importo = Math.round(importo * 100) / 100;
      if (importo <= 0) continue;
      quote.push({ fatturaId: f.id, importo, primaPagato: f.pagato, giaIncassata: f.pagato && incassato === 0 });
      resta = Math.round((resta - importo) * 100) / 100;
    }
    if (richieste.length && !quote.length) {
      return NextResponse.json({ error: "Le fatture scelte non hanno residuo da incassare" }, { status: 409 });
    }
    const quotaAltro = altro && resta > 0 ? resta : 0;
    if (altro && quotaAltro <= 0 && !quote.length) {
      return NextResponse.json({ error: "Niente da registrare come altro ingresso" }, { status: 409 });
    }

    const descrizioneMov = [mov.concetto, mov.beneficiario, mov.osservazioni].map(pulisci).filter(Boolean).join(" · ");
    const { mese, anno } = meseAnno(mov.dataContabile);
    const cambiati: { fatturaId: number; primaPagato: boolean }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const qta of quote) {
        const acconto = await tx.acconto.create({
          data: {
            fatturaId: qta.fatturaId,
            importo: qta.importo,
            data: mov.dataContabile,
            metodoPagamento: "Bonifico",
            note: `${NOTA_BANCA} #${mov.id}${qta.giaIncassata ? ` · ${NOTA_GIA_INCASSATA}` : ""} · ${descrizioneMov}`.slice(0, 500),
          },
        });
        await tx.abbinamentoBancario.create({
          data: { movimentoId: mov.id, fatturaId: qta.fatturaId, accontoId: acconto.id, importo: qta.importo },
        });
        if (!qta.primaPagato) {
          const f = await tx.fattura.findUnique({ where: { id: qta.fatturaId }, include: { acconti: { select: { importo: true } } } });
          const tot = f!.acconti.reduce((t, a) => t + a.importo, 0);
          if (centesimi(tot) + 5 >= centesimi(f!.importo)) {
            await tx.fattura.update({ where: { id: qta.fatturaId }, data: { pagato: true, metodo: f!.metodo ?? "Bonifico" } });
            cambiati.push({ fatturaId: qta.fatturaId, primaPagato: false });
          }
        }
      }
      if (altro && quotaAltro > 0) {
        const ai = await tx.altroIngresso.create({
          data: {
            fonte: pulisci(mov.beneficiario) || pulisci(mov.concetto) || "Banca",
            categoria: altro.categoria,
            azienda: "Spagna",
            descrizione: altro.descrizione || descrizioneMov.slice(0, 200) || null,
            mese,
            anno,
            importo: quotaAltro,
            incassato: true,
            dataIncasso: mov.dataContabile,
          },
        });
        await tx.abbinamentoBancario.create({
          data: { movimentoId: mov.id, altroIngressoId: ai.id, importo: quotaAltro },
        });
        resta = 0;
      }
      await tx.movimentoBancario.update({
        where: { id: mov.id },
        data: {
          stato: resta <= 0.009 ? "abbinato" : "da_abbinare",
          nota: resta > 0.009 ? `Residuo da assegnare: ${resta.toFixed(2)} €` : null,
        },
      });
    });
    for (const c of cambiati) await dopoCambioIncasso(prisma, c.fatturaId, c.primaPagato);

    const aggiornato = await prisma.movimentoBancario.findUnique({
      where: { id: mov.id },
      include: INCLUDE_MOVIMENTO,
    });
    return NextResponse.json({ ...aggiornato, suggerimento: null, entrata: null });
  } catch (e) {
    console.error("[POST /api/banca/movimenti/id/incassa]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

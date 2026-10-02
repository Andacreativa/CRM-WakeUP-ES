import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INCLUDE_MOVIMENTO, centesimi, imparaBanca } from "@/lib/banca";

type Ctx = { params: Promise<{ id: string }> };

// POST { spesaIds: number[], forza?: boolean, impara?: boolean,
//        registraCome?: "rimborsi" | "benefit", dipendenteId?: number }: collega
// il movimento (uscita) a una o più Spese già registrate. Senza `forza`
// la somma delle spese deve coincidere con l'importo del movimento.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const movId = parseInt(id, 10);
    const body = await request.json();
    const ids: number[] = Array.isArray(body.spesaIds)
      ? body.spesaIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => n > 0)
      : body.spesaId
        ? [parseInt(String(body.spesaId), 10)]
        : [];
    if (!ids.length) return NextResponse.json({ error: "Nessuna spesa indicata" }, { status: 400 });

    const mov = await prisma.movimentoBancario.findUnique({
      where: { id: movId },
      include: { abbinamenti: true },
    });
    if (!mov) return NextResponse.json({ error: "Movimento non trovato" }, { status: 404 });
    if (mov.importo >= 0) {
      return NextResponse.json({ error: "Solo le uscite si abbinano a spese" }, { status: 400 });
    }
    if (mov.stato !== "da_abbinare" || mov.abbinamenti.length) {
      return NextResponse.json({ error: "Movimento già gestito" }, { status: 409 });
    }
    const spese = await prisma.spesa.findMany({
      where: { id: { in: ids } },
      include: {
        abbinamentiBancari: { select: { movimentoId: true } },
        pagamentoMensile: { select: { id: true } },
      },
    });
    if (spese.length !== ids.length) {
      return NextResponse.json({ error: "Spesa non trovata" }, { status: 404 });
    }
    const occupata = spese.find((s) => s.abbinamentiBancari.length);
    if (occupata) {
      return NextResponse.json(
        { error: `La spesa #${occupata.id} è già collegata a un altro movimento` },
        { status: 409 },
      );
    }
    const somma = spese.reduce((t, s) => t + s.importo, 0);
    if (!body.forza && Math.abs(centesimi(somma) - centesimi(mov.importo)) > 5) {
      return NextResponse.json(
        {
          error: `Importi diversi: movimento ${Math.abs(mov.importo).toFixed(2)}, spese ${somma.toFixed(2)}`,
          needsForza: true,
        },
        { status: 409 },
      );
    }

    // Una spesa storica (es. "Soci" 500 €) che in realtà è un rimborso al socio:
    // entra nel registro pagamenti e cambia categoria, su richiesta esplicita.
    const registraCome =
      body.registraCome === "rimborsi" || body.registraCome === "benefit" ? body.registraCome : null;
    const dipendenteId = registraCome ? parseInt(body.dipendenteId, 10) || 0 : 0;
    if (registraCome && (!dipendenteId || spese.length !== 1 || spese[0].pagamentoMensile)) {
      return NextResponse.json(
        { error: "Per registrare nel registro serve una sola spesa non ancora registrata e una persona" },
        { status: 400 },
      );
    }

    const aggiornato = await prisma.$transaction(async (tx) => {
      if (registraCome && dipendenteId) {
        const sp = spese[0];
        await tx.pagamentoMensile.create({
          data: {
            dipendenteId,
            anno: sp.anno,
            mese: sp.mese,
            voce: registraCome,
            importo: sp.importo,
            data: mov.dataContabile,
            note: mov.osservazioni ?? sp.descrizione ?? null,
            spesaId: sp.id,
          },
        });
        const categoria = registraCome === "rimborsi" ? "Rimborsi" : "Benefit";
        if (sp.categoria !== categoria) {
          await tx.spesa.update({ where: { id: sp.id }, data: { categoria } });
        }
      }
      await tx.abbinamentoBancario.createMany({
        data: spese.map((s) => ({ movimentoId: mov.id, spesaId: s.id, importo: s.importo })),
      });
      return tx.movimentoBancario.update({
        where: { id: mov.id },
        data: { stato: "abbinato" },
        include: INCLUDE_MOVIMENTO,
      });
    });
    // Le righe del registro pagamenti sono per persona: non si imparano
    if (body.impara !== false && spese.length === 1 && !spese[0].pagamentoMensile) {
      await imparaBanca(prisma, mov.beneficiario, {
        categoria: spese[0].categoria,
        fornitore: spese[0].fornitore,
      });
    }
    return NextResponse.json({ ...aggiornato, suggerimento: null });
  } catch (e) {
    console.error("[POST /api/banca/movimenti/id/abbina]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

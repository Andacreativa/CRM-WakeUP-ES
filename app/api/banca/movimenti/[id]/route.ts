import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INCLUDE_MOVIMENTO, NOTA_GIA_INCASSATA, dopoCambioIncasso } from "@/lib/banca";

type Ctx = { params: Promise<{ id: string }> };

// PATCH { azione: "escludi", nota? } | { azione: "ripristina" } |
//       { azione: "scollega" } | { nota }
// "scollega" toglie i collegamenti ma NON cancella la Spesa (resta in
// Spese, si cancella da lì se davvero non serve).
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const movId = parseInt(id, 10);
    const body = await request.json();
    const mov = await prisma.movimentoBancario.findUnique({
      where: { id: movId },
      include: { abbinamenti: true },
    });
    if (!mov) return NextResponse.json({ error: "Movimento non trovato" }, { status: 404 });

    const azione = body.azione as string | undefined;
    if (azione === "escludi") {
      if (mov.abbinamenti.length) {
        return NextResponse.json(
          { error: "Movimento collegato: scollegalo prima di escluderlo" },
          { status: 409 },
        );
      }
      await prisma.movimentoBancario.update({
        where: { id: movId },
        data: { stato: "escluso", nota: body.nota?.trim() || mov.nota || null },
      });
    } else if (azione === "ripristina") {
      if (mov.stato !== "escluso") {
        return NextResponse.json({ error: "Il movimento non è escluso" }, { status: 409 });
      }
      await prisma.movimentoBancario.update({
        where: { id: movId },
        data: { stato: "da_abbinare", nota: null },
      });
    } else if (azione === "scollega") {
      // Entrate: gli acconti e gli altri ingressi creati dall'incasso spariscono
      // con il collegamento; la fattura torna "in attesa" solo se l'incasso
      // da banca era l'unico (quelle già segnate incassate a mano restano tali).
      const link = await prisma.abbinamentoBancario.findMany({
        where: { movimentoId: movId },
        include: { acconto: { select: { id: true, fatturaId: true, note: true } } },
      });
      const accontiIds = link.map((l) => l.accontoId).filter((x): x is number => x !== null);
      const altriIds = link.map((l) => l.altroIngressoId).filter((x): x is number => x !== null);
      const fattureIds = Array.from(new Set(link.map((l) => l.fatturaId).filter((x): x is number => x !== null)));
      const giaIncassate = new Set(
        link.filter((l) => l.acconto?.note?.includes(NOTA_GIA_INCASSATA)).map((l) => l.fatturaId),
      );
      const cambiate: { fatturaId: number; primaPagato: boolean }[] = [];
      await prisma.$transaction(async (tx) => {
        await tx.abbinamentoBancario.deleteMany({ where: { movimentoId: movId } });
        if (accontiIds.length) await tx.acconto.deleteMany({ where: { id: { in: accontiIds } } });
        if (altriIds.length) await tx.altroIngresso.deleteMany({ where: { id: { in: altriIds } } });
        for (const fid of fattureIds) {
          if (giaIncassate.has(fid)) continue;
          const f = await tx.fattura.findUnique({ where: { id: fid }, include: { acconti: { select: { importo: true } } } });
          if (!f || !f.pagato) continue;
          const tot = f.acconti.reduce((t, a) => t + a.importo, 0);
          if (Math.round(tot * 100) + 5 < Math.round(f.importo * 100)) {
            await tx.fattura.update({ where: { id: fid }, data: { pagato: false } });
            cambiate.push({ fatturaId: fid, primaPagato: true });
          }
        }
        await tx.movimentoBancario.update({ where: { id: movId }, data: { stato: "da_abbinare", nota: null } });
      });
      for (const c of cambiate) await dopoCambioIncasso(prisma, c.fatturaId, c.primaPagato);
    } else if (body.nota !== undefined) {
      await prisma.movimentoBancario.update({
        where: { id: movId },
        data: { nota: body.nota?.trim() || null },
      });
    } else {
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
    }

    const aggiornato = await prisma.movimentoBancario.findUnique({
      where: { id: movId },
      include: INCLUDE_MOVIMENTO,
    });
    return NextResponse.json({ ...aggiornato, suggerimento: null, entrata: null });
  } catch (e) {
    console.error("[PATCH /api/banca/movimenti/id]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

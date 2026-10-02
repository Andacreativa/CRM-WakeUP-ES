import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { INCLUDE_MOVIMENTO } from "@/lib/banca";
import { scollegaMovimento } from "@/lib/banca-incasso";

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
      // Uscite: via i collegamenti, la Spesa resta. Entrate: via anche gli
      // acconti e gli altri ingressi nati dal collegamento (lib/banca-incasso).
      await scollegaMovimento(prisma, movId);
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

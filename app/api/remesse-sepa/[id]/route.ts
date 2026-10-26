import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADDEBITO_RIGA_INCLUDE, ErroreAbbonamento, annullaRemessa, segnaRemessa } from "@/lib/abbonamenti";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await prisma.remessaSepa.findUnique({
    where: { id: parseInt(id, 10) || 0 },
    include: { addebiti: { include: ADDEBITO_RIGA_INCLUDE, orderBy: { id: "asc" } } },
  });
  if (!r) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  const { xml: _xml, ...resto } = r;
  void _xml;
  return NextResponse.json(resto);
}

// Caricata in banca / incassata / di nuovo generata
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { stato?: string; note?: string };
    if (body.note !== undefined) {
      await prisma.remessaSepa.update({ where: { id: parseInt(id, 10) || 0 }, data: { note: String(body.note).trim() || null } });
    }
    const stato = body.stato;
    if (stato !== undefined) {
      if (stato !== "generata" && stato !== "inviata" && stato !== "incassata") {
        return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
      }
      await segnaRemessa(prisma, parseInt(id, 10) || 0, stato);
    }
    const r = await prisma.remessaSepa.findUnique({
      where: { id: parseInt(id, 10) || 0 },
      include: { addebiti: { include: ADDEBITO_RIGA_INCLUDE, orderBy: { id: "asc" } } },
    });
    if (!r) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
    const { xml: _xml, ...resto } = r;
    void _xml;
    return NextResponse.json(resto);
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[PATCH /api/remesse-sepa/[id]]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Annulla una remessa non ancora caricata: addebiti di nuovo previsti
export async function DELETE(_: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    return NextResponse.json(await annullaRemessa(prisma, parseInt(id, 10) || 0));
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[DELETE /api/remesse-sepa/[id]]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

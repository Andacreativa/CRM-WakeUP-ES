import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// DELETE: elimina un'importazione e i suoi movimenti, solo se nessuno di
// essi è collegato a spese o incassi.
export async function DELETE(_: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const impId = parseInt(id, 10);
    const collegati = await prisma.movimentoBancario.count({
      where: { importId: impId, stato: { in: ["abbinato", "spesa_creata"] } },
    });
    if (collegati > 0) {
      return NextResponse.json(
        { error: `${collegati} movimenti sono collegati: scollegali prima` },
        { status: 409 },
      );
    }
    await prisma.importBancario.delete({ where: { id: impId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/banca/importazioni/id]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

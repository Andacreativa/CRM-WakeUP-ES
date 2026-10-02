import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const pagamentoId = parseInt(id, 10);
  const body = await request.json();
  const p = await prisma.pagamentoMensile.findUnique({ where: { id: pagamentoId } });
  if (!p) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  if (p.voce === "commissioni") {
    return NextResponse.json(
      { error: "Le commissioni si modificano dalla fattura" },
      { status: 409 },
    );
  }
  const importo =
    body.importo !== undefined
      ? Math.round((parseFloat(body.importo) || 0) * 100) / 100
      : p.importo;
  if (importo <= 0) {
    return NextResponse.json({ error: "Importo non valido" }, { status: 400 });
  }
  const row = await prisma.$transaction(async (tx) => {
    if (p.spesaId && body.importo !== undefined) {
      await tx.spesa.update({ where: { id: p.spesaId }, data: { importo } });
    }
    return tx.pagamentoMensile.update({
      where: { id: pagamentoId },
      data: {
        importo,
        ...(body.data !== undefined && { data: body.data ? new Date(body.data) : null }),
        ...(body.note !== undefined && { note: body.note?.trim() || null }),
      },
    });
  });
  return NextResponse.json(row);
}

// Elimina il pagamento e la spesa collegata.
export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  const pagamentoId = parseInt(id, 10);
  const p = await prisma.pagamentoMensile.findUnique({ where: { id: pagamentoId } });
  if (!p) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  if (p.voce === "commissioni") {
    return NextResponse.json(
      { error: "Le commissioni si rimuovono togliendo l'incasso o il commerciale dalla fattura" },
      { status: 409 },
    );
  }
  await prisma.$transaction(async (tx) => {
    if (p.spesaId) await tx.spesa.deleteMany({ where: { id: p.spesaId } });
    await tx.pagamentoMensile.delete({ where: { id: pagamentoId } });
  });
  return NextResponse.json({ ok: true });
}

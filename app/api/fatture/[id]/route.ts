import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  applySplit,
  deleteSplitForFattura,
  getSplitType,
} from "@/lib/finn-split";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fatturaId = parseInt(id);
  const body = await request.json();

  const before = await prisma.fattura.findUnique({ where: { id: fatturaId } });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fattura = await prisma.fattura.update({
    where: { id: fatturaId },
    data: {
      ...(body.numero !== undefined && { numero: body.numero || null }),
      ...(body.data !== undefined && {
        data: body.data ? new Date(body.data) : null,
      }),
      ...(body.clienteId !== undefined && {
        clienteId: body.clienteId ?? null,
      }),
      ...(body.azienda !== undefined && { azienda: body.azienda }),
      ...(body.aziendaNota !== undefined && { aziendaNota: body.aziendaNota }),
      ...(body.mese !== undefined && { mese: body.mese }),
      ...(body.anno !== undefined && { anno: body.anno }),
      ...(body.importo !== undefined && { importo: parseFloat(body.importo) }),
      ...(body.tipoIva !== undefined && { tipoIva: body.tipoIva }),
      ...(body.iva !== undefined && { iva: Number(body.iva) }),
      ...(body.pagato !== undefined && { pagato: body.pagato }),
      ...(body.metodo !== undefined && { metodo: body.metodo || null }),
      ...(body.commerciale !== undefined && {
        commerciale: body.commerciale || null,
      }),
      ...(body.scadenza !== undefined && {
        scadenza: body.scadenza ? new Date(body.scadenza) : null,
      }),
    },
    include: { cliente: true },
  });

  const beforeType = getSplitType(before.commerciale);
  const afterType = getSplitType(fattura.commerciale);
  const wasSplit = beforeType !== null && before.pagato;
  const isSplit = afterType !== null && fattura.pagato;
  const typeChanged = beforeType !== afterType;
  const dataChanged =
    before.importo !== fattura.importo ||
    before.mese !== fattura.mese ||
    before.anno !== fattura.anno ||
    before.clienteId !== fattura.clienteId;

  if (wasSplit && !isSplit) {
    await deleteSplitForFattura(prisma, fatturaId);
  } else if (!wasSplit && isSplit) {
    await applySplit(prisma, fattura, afterType);
  } else if (wasSplit && isSplit && (dataChanged || typeChanged)) {
    await deleteSplitForFattura(prisma, fatturaId);
    await applySplit(prisma, fattura, afterType);
  }

  return NextResponse.json(fattura);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.fattura.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}

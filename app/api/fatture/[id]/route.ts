import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const fattura = await prisma.fattura.update({
    where: { id: parseInt(id) },
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
      ...(body.descrizione !== undefined && { descrizione: body.descrizione }),
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

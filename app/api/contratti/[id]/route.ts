import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const c = await prisma.contratto.findUnique({
    where: { id: parseInt(id) },
    include: { cliente: true, preventivo: true },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(c);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const importoMensile =
    body.importoMensile !== undefined
      ? parseFloat(body.importoMensile)
      : undefined;
  const numeroRate =
    body.numeroRate !== undefined ? parseInt(body.numeroRate, 10) : undefined;
  const c = await prisma.contratto.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.clienteId !== undefined && { clienteId: body.clienteId }),
      ...(body.rappresentanteLegale !== undefined && {
        rappresentanteLegale: body.rappresentanteLegale,
      }),
      ...(body.dataDecorrenza !== undefined && {
        dataDecorrenza: new Date(body.dataDecorrenza),
      }),
      ...(body.durataMesi !== undefined && {
        durataMesi: parseInt(body.durataMesi, 10),
      }),
      ...(importoMensile !== undefined && { importoMensile }),
      ...(numeroRate !== undefined && { numeroRate }),
      ...(importoMensile !== undefined && numeroRate !== undefined && {
        totaleContratto: importoMensile * numeroRate,
      }),
      ...(body.oggetto !== undefined && { oggetto: body.oggetto }),
      ...(body.voci !== undefined && { voci: body.voci }),
      ...(body.lingua !== undefined && { lingua: body.lingua }),
      ...(body.nomeClienteFallback !== undefined && {
        nomeClienteFallback: body.nomeClienteFallback,
      }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.note !== undefined && { note: body.note }),
    },
    include: { cliente: true, preventivo: true },
  });
  return NextResponse.json(c);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.contratto.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}

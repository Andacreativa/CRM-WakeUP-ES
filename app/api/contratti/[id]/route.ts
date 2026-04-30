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

function unaTantumFromVoci(vociJson: string): number {
  try {
    const voci: Array<{
      quantita?: number;
      prezzoUnitario?: number;
      tipo?: string;
    }> = JSON.parse(vociJson || "[]");
    return voci
      .filter((v) => v.tipo === "una_tantum")
      .reduce(
        (s, v) =>
          s + (Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0),
        0,
      );
  } catch {
    return 0;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contrattoId = parseInt(id);
  const body = await request.json();
  const importoMensileNew =
    body.importoMensile !== undefined
      ? parseFloat(body.importoMensile)
      : undefined;
  const numeroRateNew =
    body.numeroRate !== undefined ? parseInt(body.numeroRate, 10) : undefined;
  const vociNew = body.voci !== undefined ? body.voci : undefined;

  // Ricalcola totaleContratto se cambia importoMensile, numeroRate o voci
  let totaleContrattoNew: number | undefined;
  if (
    importoMensileNew !== undefined ||
    numeroRateNew !== undefined ||
    vociNew !== undefined
  ) {
    const current = await prisma.contratto.findUnique({
      where: { id: contrattoId },
      select: { importoMensile: true, numeroRate: true, voci: true },
    });
    if (current) {
      const im = importoMensileNew ?? current.importoMensile;
      const nr = numeroRateNew ?? current.numeroRate;
      const voci = vociNew ?? current.voci;
      totaleContrattoNew = im * nr + unaTantumFromVoci(voci);
    }
  }

  const c = await prisma.contratto.update({
    where: { id: contrattoId },
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
      ...(importoMensileNew !== undefined && { importoMensile: importoMensileNew }),
      ...(numeroRateNew !== undefined && { numeroRate: numeroRateNew }),
      ...(totaleContrattoNew !== undefined && {
        totaleContratto: totaleContrattoNew,
      }),
      ...(body.oggetto !== undefined && { oggetto: body.oggetto }),
      ...(vociNew !== undefined && { voci: vociNew }),
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

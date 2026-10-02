import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Fatture (registro finance) non ancora collegate a nessuna richiesta,
// dello stesso cliente se la richiesta ne ha uno, altrimenti dello stesso anno.
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await prisma.richiestaFattura.findUnique({
    where: { id: parseInt(id, 10) },
  });
  if (!r) return NextResponse.json([], { status: 404 });

  const fatture = await prisma.fattura.findMany({
    where: {
      origine: { not: "sales" },
      richiesta: null,
      ...(r.clienteId ? { clienteId: r.clienteId } : { anno: r.anno }),
    },
    select: {
      id: true,
      numero: true,
      data: true,
      mese: true,
      anno: true,
      importo: true,
      pagato: true,
      cliente: { select: { nome: true } },
    },
    orderBy: [{ anno: "desc" }, { mese: "desc" }, { id: "desc" }],
    take: 60,
  });
  return NextResponse.json(fatture);
}

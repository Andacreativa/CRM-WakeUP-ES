import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Fatture (registro finance) non ancora collegate a nessuna richiesta,
// dello stesso cliente se la richiesta ne ha uno, altrimenti dello stesso anno.
// ?tutti=1: di qualsiasi cliente (es. fattura finita su un doppione del
// cliente); ?q= cerca nel numero e nel nome del cliente.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = new URL(request.url).searchParams;
  const tutti = sp.get("tutti") === "1";
  const q = (sp.get("q") ?? "").trim();
  const r = await prisma.richiestaFattura.findUnique({
    where: { id: parseInt(id, 10) },
  });
  if (!r) return NextResponse.json([], { status: 404 });

  const fatture = await prisma.fattura.findMany({
    where: {
      origine: { not: "sales" },
      annullata: false,
      stato: "emessa",
      richiesta: null,
      ...(tutti ? {} : r.clienteId ? { clienteId: r.clienteId } : { anno: r.anno }),
      ...(q
        ? {
            OR: [
              { numero: { contains: q, mode: "insensitive" as const } },
              { cliente: { nome: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      numero: true,
      data: true,
      mese: true,
      anno: true,
      importo: true,
      pagato: true,
      clienteId: true,
      cliente: { select: { nome: true } },
    },
    orderBy: [{ anno: "desc" }, { mese: "desc" }, { id: "desc" }],
    take: 60,
  });
  return NextResponse.json(fatture);
}

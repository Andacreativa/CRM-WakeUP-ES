import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applySplit, getSplitType } from "@/lib/finn-split";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const anno = parseInt(searchParams.get("anno") || "2025");
  const azienda = searchParams.get("azienda") || undefined;

  const fatture = await prisma.fattura.findMany({
    where: { anno, ...(azienda ? { azienda } : {}) },
    include: { cliente: true },
    orderBy: [{ data: "desc" }, { mese: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(fatture);
}

export async function POST(request: Request) {
  const body = await request.json();
  const tipoIva = body.tipoIva || "iva";
  const iva =
    tipoIva === "igic7"
      ? 7
      : tipoIva === "igic_exenta"
        ? 0
        : Number(body.iva ?? 21);
  const fattura = await prisma.fattura.create({
    data: {
      numero: body.numero || null,
      data: body.data ? new Date(body.data) : null,
      clienteId: body.clienteId ?? null,
      azienda: body.azienda || "Spagna",
      aziendaNota: body.aziendaNota || null,
      mese: body.mese,
      anno: body.anno || 2025,
      importo: parseFloat(body.importo),
      tipoIva,
      iva,
      pagato: body.pagato || false,
      metodo: body.metodo || null,
      commerciale: body.commerciale || null,
      scadenza: body.scadenza ? new Date(body.scadenza) : null,
    },
    include: { cliente: true },
  });

  const splitType = getSplitType(fattura.commerciale);
  if (splitType && fattura.pagato) {
    await applySplit(prisma, fattura, splitType);
  }

  return NextResponse.json(fattura);
}

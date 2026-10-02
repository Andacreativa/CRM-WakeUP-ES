import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applySplit, getSplitType } from "@/lib/finn-split";
import { syncCommissioneFattura } from "@/lib/commissioni";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const annoParam = searchParams.get("anno");
  const anno = annoParam ? parseInt(annoParam) : null;
  const azienda = searchParams.get("azienda") || undefined;
  // Le annullate servono solo al registro Fatture: Bilancio e Scadenze non le contano
  const conAnnullate = searchParams.get("annullate") === "1";

  const fatture = await prisma.fattura.findMany({
    where: {
      origine: { not: "sales" },
      ...(conAnnullate ? {} : { annullata: false }),
      ...(anno && anno > 0 ? { anno } : {}),
      ...(azienda ? { azienda } : {}),
    },
    include: {
      cliente: true,
      acconti: { orderBy: { data: "desc" } },
      solleciti: { orderBy: { data: "desc" }, take: 1 },
      _count: { select: { solleciti: true } },
    },
    orderBy: [
      { anno: "desc" },
      { data: "desc" },
      { mese: "desc" },
      { createdAt: "desc" },
    ],
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
      contrattoId: body.contrattoId ?? null,
      azienda: body.azienda || "Spagna",
      aziendaNota: body.aziendaNota || null,
      mese: body.mese,
      anno: body.anno || 2025,
      importo: parseFloat(body.importo),
      tipoIva,
      iva,
      pagato: body.pagato || false,
      inviata: body.inviata || false,
      dataInvio: body.dataInvio ? new Date(body.dataInvio) : null,
      origine: body.origine || "finance",
      metodo: body.metodo || null,
      commerciale: body.commerciale || null,
      commercialeId: body.commercialeId ? parseInt(body.commercialeId, 10) : null,
      scadenza: body.scadenza ? new Date(body.scadenza) : null,
    },
    include: { cliente: true },
  });

  // Commerciale in anagrafica → commissione; altrimenti ripartizione storica
  if (fattura.commercialeId) {
    await syncCommissioneFattura(prisma, fattura.id);
  } else {
    const splitType = getSplitType(fattura.commerciale);
    if (splitType && fattura.pagato) {
      await applySplit(prisma, fattura, splitType);
    }
  }

  return NextResponse.json(fattura);
}

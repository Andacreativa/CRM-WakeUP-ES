import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RINNOVO_INCLUDE, serializzaRinnovo } from "@/lib/rinnovi";
import { datiRinnovo } from "../route";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await prisma.rinnovoSito.findUnique({
    where: { id: parseInt(id, 10) },
    include: RINNOVO_INCLUDE,
  });
  if (!r || r.deletedAt) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  return NextResponse.json(serializzaRinnovo(r));
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const rinnovoId = parseInt(id, 10);
    const before = await prisma.rinnovoSito.findUnique({ where: { id: rinnovoId } });
    if (!before || before.deletedAt) {
      return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    }
    const body = await request.json();
    const data = datiRinnovo(body, true);
    if (data.dominio !== undefined && !data.dominio) {
      return NextResponse.json({ error: "Dominio obbligatorio" }, { status: 400 });
    }
    if (data.scadenza !== undefined && (!data.scadenza || isNaN((data.scadenza as Date).getTime()))) {
      return NextResponse.json({ error: "Scadenza non valida" }, { status: 400 });
    }
    if (data.dominio && data.dominio !== before.dominio) {
      const doppio = await prisma.rinnovoSito.findUnique({
        where: { dominio: data.dominio as string },
      });
      if (doppio) {
        return NextResponse.json({ error: `${data.dominio} è già nei rinnovi` }, { status: 409 });
      }
    }
    const r = await prisma.$transaction(async (tx) => {
      const agg = await tx.rinnovoSito.update({
        where: { id: rinnovoId },
        data: data as Prisma.RinnovoSitoUncheckedUpdateInput,
        include: RINNOVO_INCLUDE,
      });
      // Se la scadenza viene corretta, la richiesta del ciclo in corso la segue
      if (data.scadenza && agg.scadenza.getTime() !== before.scadenza.getTime()) {
        await tx.richiestaFattura.updateMany({
          where: { rinnovoId, rinnovoScadenza: before.scadenza, deletedAt: null },
          data: { rinnovoScadenza: agg.scadenza },
        });
        return tx.rinnovoSito.findUniqueOrThrow({
          where: { id: rinnovoId },
          include: RINNOVO_INCLUDE,
        });
      }
      return agg;
    });
    return NextResponse.json(serializzaRinnovo(r));
  } catch (e) {
    console.error("[PATCH /api/rinnovi/[id]]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Cancellazione morbida: le richieste già nate restano.
export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.rinnovoSito.update({
    where: { id: parseInt(id, 10) },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

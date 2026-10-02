import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  RICHIESTA_INCLUDE,
  calcolaImporti,
  parseVoci,
  serializzaRichiesta,
} from "@/lib/richieste";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await prisma.richiestaFattura.findUnique({
    where: { id: parseInt(id, 10) },
    include: RICHIESTA_INCLUDE,
  });
  if (!r || r.deletedAt) {
    return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  }
  return NextResponse.json(serializzaRichiesta(r));
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const richiestaId = parseInt(id, 10);
    const body = await request.json();
    const before = await prisma.richiestaFattura.findUnique({
      where: { id: richiestaId },
    });
    if (!before || before.deletedAt) {
      return NextResponse.json({ error: "Non trovata" }, { status: 404 });
    }

    // Ricalcolo importi se cambiano voci, imponibile o tipo IVA
    const vociCambiate = body.voci !== undefined;
    const voci = vociCambiate ? parseVoci(body.voci) : parseVoci(before.voci);
    const tipoIva =
      body.tipoIva !== undefined
        ? body.tipoIva === "igic7"
          ? "igic7"
          : "igic_exenta"
        : before.tipoIva;
    const importi = calcolaImporti(
      voci,
      body.imponibile !== undefined ? body.imponibile : before.imponibile,
      tipoIva,
    );

    const r = await prisma.richiestaFattura.update({
      where: { id: richiestaId },
      data: {
        ...(body.clienteId !== undefined && {
          clienteId: body.clienteId ? parseInt(body.clienteId, 10) : null,
        }),
        ...(body.nomeCliente !== undefined && {
          nomeCliente: body.nomeCliente?.trim() || null,
        }),
        ...(body.contrattoId !== undefined && {
          contrattoId: body.contrattoId ? parseInt(body.contrattoId, 10) : null,
        }),
        ...(body.azienda !== undefined && { azienda: body.azienda || "Spagna" }),
        ...(body.aziendaNota !== undefined && {
          aziendaNota: body.aziendaNota || null,
        }),
        ...(body.descrizione !== undefined && {
          descrizione: String(body.descrizione).trim(),
        }),
        ...(vociCambiate && { voci: JSON.stringify(voci) }),
        imponibile: importi.imponibile,
        tipoIva,
        iva: importi.iva,
        totale: importi.totale,
        ...(body.mese !== undefined && { mese: parseInt(body.mese, 10) }),
        ...(body.anno !== undefined && { anno: parseInt(body.anno, 10) }),
        ...(body.dataInvio !== undefined && {
          dataInvio: body.dataInvio ? new Date(body.dataInvio) : null,
        }),
        ...(body.responsabile !== undefined && {
          responsabile: body.responsabile?.trim() || null,
        }),
        ...(body.note !== undefined && { note: body.note?.trim() || null }),
      },
      include: RICHIESTA_INCLUDE,
    });
    return NextResponse.json(serializzaRichiesta(r));
  } catch (e) {
    console.error("[PATCH /api/richieste-fattura/[id]]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Cancellazione morbida: la riga resta nel DB con deletedAt.
export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.richiestaFattura.update({
    where: { id: parseInt(id, 10) },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

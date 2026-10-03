import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCommissioneFattura } from "@/lib/commissioni";

// Scheda della singola fattura (pannello «Fattura N°» come in Northstar):
// intestatario, incassi, solleciti e da dove nasce (richiesta, contratto).
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fatturaId = parseInt(id, 10);
  if (!fatturaId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const fattura = await prisma.fattura.findUnique({
    where: { id: fatturaId },
    include: {
      cliente: true,
      acconti: { orderBy: { data: "asc" } },
      solleciti: { orderBy: { data: "desc" } },
      richiesta: {
        select: { id: true, codice: true, descrizione: true, voci: true },
      },
      contratto: { select: { id: true, numero: true, oggetto: true } },
      commercialeRef: {
        select: { id: true, nome: true, cognome: true, email: true },
      },
    },
  });
  if (!fattura) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(fattura);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let stage = "init";
  try {
    const { id } = await params;
    const fatturaId = parseInt(id);
    stage = "parse-body";
    const body = await request.json();
    console.log(`[PATCH /api/fatture/${fatturaId}] body:`, body);

    stage = "find-before";
    const before = await prisma.fattura.findUnique({
      where: { id: fatturaId },
      include: { _count: { select: { acconti: true } } },
    });
    if (!before) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Una fattura con incassi non si annulla: prima si tolgono gli incassi
    if (body.annullata === true && (before.pagato || before._count.acconti > 0)) {
      return NextResponse.json(
        { error: "La fattura ha incassi o è segnata incassata: non si può annullare" },
        { status: 409 },
      );
    }
    if (before.annullata && body.pagato === true) {
      return NextResponse.json(
        { error: "La fattura è annullata: ripristinala prima di incassarla" },
        { status: 409 },
      );
    }

    stage = "update";
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
        ...(body.commercialeId !== undefined && {
          commercialeId: body.commercialeId
            ? parseInt(body.commercialeId, 10)
            : null,
        }),
        ...(body.scadenza !== undefined && {
          scadenza: body.scadenza ? new Date(body.scadenza) : null,
        }),
        ...(body.contrattoId !== undefined && {
          contrattoId: body.contrattoId ?? null,
        }),
        ...(body.inviata !== undefined && { inviata: body.inviata }),
        ...(body.dataInvio !== undefined && {
          dataInvio: body.dataInvio ? new Date(body.dataInvio) : null,
        }),
        ...(body.checkInvio !== undefined && { checkInvio: body.checkInvio }),
        ...(body.annullata !== undefined && {
          annullata: !!body.annullata,
          annullataIl: body.annullata ? new Date() : null,
        }),
        ...(body.presentata !== undefined && {
          presentata: !!body.presentata,
          presentataIl: body.presentata ? new Date() : null,
        }),
      },
      include: {
        cliente: true,
        acconti: { orderBy: { data: "desc" } },
      },
    });
    console.log(
      `[PATCH /api/fatture/${fatturaId}] update OK pagato=${fattura.pagato} commerciale=${fattura.commerciale}`,
    );

    const dataChanged =
      before.importo !== fattura.importo ||
      before.mese !== fattura.mese ||
      before.anno !== fattura.anno ||
      before.clienteId !== fattura.clienteId;

    stage = "commissione";
    if (
      before.commercialeId !== fattura.commercialeId ||
      before.pagato !== fattura.pagato ||
      dataChanged
    ) {
      await syncCommissioneFattura(prisma, fatturaId);
    }

    return NextResponse.json(fattura);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as { code: unknown }).code
        : null;
    console.error(
      `[PATCH /api/fatture/[id]] ERRORE stage=${stage} code=${code}:`,
      msg,
    );
    if (e instanceof Error && e.stack) console.error(e.stack);
    return NextResponse.json(
      { error: msg, stage, code },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.fattura.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}

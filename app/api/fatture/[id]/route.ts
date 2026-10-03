import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCommissioneFattura } from "@/lib/commissioni";
import { CAUSE_IGIC } from "@/lib/impostazioni";
import { leggiVoci, totaleVoci } from "@/lib/fatture";

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
      rettificaDi: { select: { id: true, numero: true, data: true } },
      rettifiche: {
        select: { id: true, numero: true, stato: true, importo: true, tipoRettifica: true, annullata: true },
        orderBy: { id: "asc" },
      },
      registriVerifactu: {
        select: {
          id: true,
          ambiente: true,
          tipo: true,
          subsanacion: true,
          stato: true,
          csv: true,
          codiceErrore: true,
          descrizioneErrore: true,
          ultimoErrore: true,
          tentativi: true,
          inviatoIl: true,
          createdAt: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!fattura) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(fattura);
}

const giorno = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

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
      include: {
        _count: { select: { acconti: true } },
        rettifiche: { select: { stato: true, tipoRettifica: true, annullata: true, numero: true } },
      },
    });
    if (!before) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const sostituta = before.rettifiche.find(
      (r) => r.stato === "emessa" && r.tipoRettifica === "S" && !r.annullata,
    );
    if (body.annullata === false && sostituta) {
      return NextResponse.json(
        { error: `La fattura è sostituita dalla rettificativa ${sostituta.numero}: non si ripristina.` },
        { status: 409 },
      );
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

    const bozza = before.stato === "bozza";
    const voci = body.voci !== undefined ? leggiVoci(body.voci) : null;
    const importo =
      voci && voci.length
        ? totaleVoci(voci)
        : body.importo !== undefined
          ? parseFloat(body.importo)
          : undefined;
    const iva = body.iva !== undefined ? Number(body.iva) : undefined;

    // Trasmessa a VeriFactu: i dati del registro non si toccano più. Si
    // correggono solo dopo un rifiuto o un'accettazione con errori (poi si
    // rimanda il registro); numero e data restano comunque quelli.
    if (before.vfStato) {
      stage = "blocco-verifactu";
      if (body.annullata !== undefined) {
        return NextResponse.json(
          { error: "Fattura trasmessa a VeriFactu: l'annullamento si fa dal suo pannello, con il registro di annullamento." },
          { status: 409 },
        );
      }
      const correggibile =
        before.vfStato === "rifiutata" || before.vfStato === "accettata_con_errori";
      const cambia = {
        numero: body.numero !== undefined && (body.numero || null) !== before.numero,
        data: body.data !== undefined && (body.data ? String(body.data).slice(0, 10) : null) !== giorno(before.data),
        cliente: body.clienteId !== undefined && (body.clienteId ?? null) !== before.clienteId,
        importo: importo !== undefined && Math.abs(importo - before.importo) > 0.005,
        imposta:
          (body.tipoIva !== undefined && body.tipoIva !== before.tipoIva) ||
          (iva !== undefined && iva !== before.iva) ||
          (body.causaIgic !== undefined && (body.causaIgic || null) !== before.causaIgic),
        descrizione:
          body.descrizione !== undefined && (body.descrizione?.trim() || null) !== before.descrizione,
        voci: voci !== null && JSON.stringify(voci) !== JSON.stringify(leggiVoci(before.voci)),
      };
      const vietati = Object.entries(cambia)
        .filter(([k, v]) => v && (!correggibile || k === "numero" || k === "data"))
        .map(([k]) => k);
      if (vietati.length) {
        return NextResponse.json(
          {
            error: `Fattura trasmessa a VeriFactu: ${vietati.join(", ")} non si modifica${vietati.length > 1 ? "no" : ""}. Per correggerla si emette una rettificativa.`,
          },
          { status: 409 },
        );
      }
    }

    stage = "update";
    const fattura = await prisma.fattura.update({
      where: { id: fatturaId },
      data: {
        // La bozza non ha numero: lo riceve all'emissione
        ...(body.numero !== undefined && !bozza && { numero: body.numero || null }),
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
        ...(importo !== undefined && Number.isFinite(importo) && { importo }),
        ...(body.tipoIva !== undefined && { tipoIva: body.tipoIva }),
        ...(iva !== undefined && { iva }),
        ...(body.pagato !== undefined && !bozza && { pagato: body.pagato }),
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
        // La spunta a mano vale solo per le fatture non trasmesse da qui
        ...(body.presentata !== undefined &&
          !before.vfStato && {
            presentata: !!body.presentata,
            presentataIl: body.presentata ? new Date() : null,
          }),
        ...(body.descrizione !== undefined && {
          descrizione: body.descrizione?.trim() || null,
        }),
        ...(voci !== null && { voci: JSON.stringify(voci) }),
        // Il motivo della rettifica si sceglie finché è bozza
        ...(body.tipoFattura !== undefined &&
          bozza &&
          before.rettificaDiId &&
          ["R1", "R2", "R3", "R4"].includes(body.tipoFattura) && { tipoFattura: body.tipoFattura }),
        ...(body.causaIgic !== undefined && {
          causaIgic: CAUSE_IGIC.includes(body.causaIgic) ? body.causaIgic : null,
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

    // Rettificativa per sostituzione annullata o ripristinata a mano: la
    // fattura che sostituisce rientra nei totali o ne esce
    if (
      body.annullata !== undefined &&
      before.stato === "emessa" &&
      before.tipoRettifica === "S" &&
      before.rettificaDiId
    ) {
      await prisma.fattura.update({
        where: { id: before.rettificaDiId },
        data: { annullata: !body.annullata, annullataIl: body.annullata ? null : new Date() },
      });
    }

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

// Si elimina solo una bozza: una fattura emessa resta nel registro (si
// annulla o si rettifica).
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fatturaId = parseInt(id, 10);
  const f = await prisma.fattura.findUnique({
    where: { id: fatturaId },
    select: { stato: true },
  });
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (f.stato !== "bozza") {
    return NextResponse.json(
      { error: "Una fattura emessa non si elimina: si annulla o si rettifica." },
      { status: 409 },
    );
  }
  await prisma.fattura.delete({ where: { id: fatturaId } });
  return NextResponse.json({ ok: true });
}

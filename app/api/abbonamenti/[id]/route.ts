import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ABBONAMENTO_INCLUDE, baseUrl, importiAbbonamento, serializzaAbbonamento } from "@/lib/abbonamenti";
import { bicValido, ibanValido, pulisciBic, pulisciIban } from "@/lib/sepa";
import { PAESI, pulisciPiva } from "@/lib/constants";
import { linguaValida, tipoIvaValido } from "@/components/abbonamenti/tipi";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await prisma.abbonamento.findUnique({ where: { id: parseInt(id, 10) || 0 }, include: ABBONAMENTO_INCLUDE });
  if (!a || a.deletedAt) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json(serializzaAbbonamento(a, baseUrl(request)));
}

// Modifica della scheda: dati, conto, prezzo e imposta (ricalcola il lordo),
// data di inizio, note, cliente. Stato e firma hanno le loro route.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const abbId = parseInt(id, 10) || 0;
    const before = await prisma.abbonamento.findUnique({ where: { id: abbId } });
    if (!before || before.deletedAt) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ha = (k: string) => body[k] !== undefined;
    const str = (k: string, max = 200) => String(body[k] ?? "").trim().slice(0, max);
    const strNull = (k: string, max = 200) => str(k, max) || null;
    const data: Prisma.AbbonamentoUncheckedUpdateInput = {};
    if (ha("intestatario")) {
      if (!str("intestatario")) return NextResponse.json({ error: "Intestatario obbligatorio" }, { status: 400 });
      data.intestatario = str("intestatario", 140);
    }
    if (ha("nif")) data.nif = pulisciPiva(body.nif);
    if (ha("email")) {
      const e = str("email", 160).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return NextResponse.json({ error: "Email non valida" }, { status: 400 });
      data.email = e;
    }
    if (ha("telefono")) data.telefono = strNull("telefono", 40);
    if (ha("via")) data.via = strNull("via", 140);
    if (ha("cap")) data.cap = strNull("cap", 16);
    if (ha("citta")) data.citta = strNull("citta", 80);
    if (ha("provincia")) data.provincia = strNull("provincia", 80);
    if (ha("paese")) data.paese = PAESI.includes(str("paese")) ? str("paese") : "Spagna";
    if (ha("titolareConto")) data.titolareConto = str("titolareConto", 140);
    if (ha("iban")) {
      const iban = pulisciIban(body.iban);
      if (iban && !ibanValido(iban)) return NextResponse.json({ error: "IBAN non valido" }, { status: 400 });
      data.iban = iban;
    }
    if (ha("bic")) {
      const bic = pulisciBic(body.bic);
      if (bic && !bicValido(bic)) return NextResponse.json({ error: "BIC non valido" }, { status: 400 });
      data.bic = bic || null;
    }
    if (ha("lingua")) data.lingua = linguaValida(body.lingua);
    if (ha("note")) data.note = strNull("note", 4000);
    if (ha("clienteId")) data.clienteId = body.clienteId ? parseInt(String(body.clienteId), 10) || null : null;
    if (ha("dataInizio")) {
      const d = body.dataInizio ? new Date(String(body.dataInizio)) : null;
      if (d && isNaN(d.getTime())) return NextResponse.json({ error: "Data di inizio non valida" }, { status: 400 });
      data.dataInizio = d;
    }
    if (ha("pianoId")) {
      const piano = body.pianoId ? await prisma.pianoAbbonamento.findUnique({ where: { id: parseInt(String(body.pianoId), 10) || 0 } }) : null;
      if (!piano || piano.prodotto !== before.prodotto) return NextResponse.json({ error: "Piano non valido" }, { status: 400 });
      data.pianoId = piano.id;
      data.pianoNome = piano.nome;
    }
    if (ha("prezzo") || ha("tipoIva")) {
      const prezzo = ha("prezzo") ? parseFloat(String(body.prezzo).replace(",", ".")) : before.prezzo;
      if (!(prezzo >= 0)) return NextResponse.json({ error: "Prezzo non valido" }, { status: 400 });
      const tipoIva = ha("tipoIva") ? tipoIvaValido(body.tipoIva) : before.tipoIva;
      Object.assign(data, importiAbbonamento(prezzo, tipoIva));
    }
    const a = await prisma.abbonamento.update({ where: { id: abbId }, data, include: ABBONAMENTO_INCLUDE });
    // Gli addebiti ancora previsti seguono il nuovo importo
    if (data.totale !== undefined) {
      await prisma.addebitoSepa.updateMany({ where: { abbonamentoId: abbId, stato: "previsto" }, data: { importo: a.totale } });
    }
    return NextResponse.json(serializzaAbbonamento(a, baseUrl(request)));
  } catch (e) {
    console.error("[PATCH /api/abbonamenti/[id]]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Cancellazione morbida: addebiti e fatture già nati restano.
export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  const abbId = parseInt(id, 10) || 0;
  await prisma.addebitoSepa.updateMany({ where: { abbonamentoId: abbId, stato: "previsto" }, data: { stato: "annullato" } });
  await prisma.abbonamento.update({ where: { id: abbId }, data: { deletedAt: new Date(), stato: "cancellato", tokenFirma: null } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCommissioneFattura } from "@/lib/commissioni";
import { getImpostazioniFatture, CAUSE_IGIC } from "@/lib/impostazioni";
import { leggiVoci, totaleVoci } from "@/lib/fatture";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const annoParam = searchParams.get("anno");
  const anno = annoParam ? parseInt(annoParam) : null;
  const azienda = searchParams.get("azienda") || undefined;
  // Le annullate servono solo al registro Fatture: Bilancio e Scadenze non le contano
  const conAnnullate = searchParams.get("annullate") === "1";
  // Le bozze non sono fatture: si chiedono a parte (linguetta Bozze)
  const bozze = searchParams.get("bozze") === "1";

  const fatture = await prisma.fattura.findMany({
    where: {
      origine: { not: "sales" },
      stato: bozze ? "bozza" : "emessa",
      ...(conAnnullate || bozze ? {} : { annullata: false }),
      ...(anno && anno > 0 && !bozze ? { anno } : {}),
      ...(azienda ? { azienda } : {}),
    },
    include: {
      cliente: true,
      acconti: { orderBy: { data: "desc" } },
      solleciti: { orderBy: { data: "desc" }, take: 1 },
      rettifiche: {
        select: { id: true, numero: true, stato: true, importo: true, tipoRettifica: true, annullata: true },
      },
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
  const bozza = body.stato === "bozza";
  const cfg = await getImpostazioniFatture(prisma);
  // Con VeriFactu acceso una fattura nasce bozza e si emette dal suo pannello:
  // è l'emissione che assegna il numero e crea il registro per l'AEAT
  if (!bozza && cfg.vfModo !== "spento") {
    return NextResponse.json(
      { error: "Con VeriFactu attivo la fattura si salva come bozza e poi si emette." },
      { status: 409 },
    );
  }
  const tipoIva = body.tipoIva || "iva";
  const iva =
    tipoIva === "igic7"
      ? 7
      : tipoIva === "igic_exenta"
        ? 0
        : Number(body.iva ?? 21);
  const voci = leggiVoci(body.voci);
  const importo = voci.length ? totaleVoci(voci) : parseFloat(body.importo);
  if (!Number.isFinite(importo)) {
    return NextResponse.json({ error: "Importo mancante" }, { status: 400 });
  }
  const numero = bozza ? null : body.numero?.trim() || null;
  if (numero) {
    const doppia = await prisma.fattura.findFirst({ where: { numero }, select: { id: true } });
    if (doppia) {
      return NextResponse.json(
        { error: `Il numero ${numero} è già usato da un'altra fattura.` },
        { status: 409 },
      );
    }
  }
  const fattura = await prisma.fattura.create({
    data: {
      numero,
      data: body.data ? new Date(body.data) : null,
      clienteId: body.clienteId ?? null,
      contrattoId: body.contrattoId ?? null,
      azienda: body.azienda || "Spagna",
      aziendaNota: body.aziendaNota || null,
      mese: body.mese,
      anno: body.anno || 2025,
      importo,
      tipoIva,
      iva,
      pagato: bozza ? false : body.pagato || false,
      inviata: body.inviata || false,
      dataInvio: body.dataInvio ? new Date(body.dataInvio) : null,
      origine: body.origine || "finance",
      metodo: body.metodo || null,
      commerciale: body.commerciale || null,
      commercialeId: body.commercialeId ? parseInt(body.commercialeId, 10) : null,
      scadenza: body.scadenza ? new Date(body.scadenza) : null,
      stato: bozza ? "bozza" : "emessa",
      emessaIl: bozza ? null : new Date(),
      descrizione: body.descrizione?.trim() || null,
      voci: JSON.stringify(voci),
      causaIgic: iva === 0 && CAUSE_IGIC.includes(body.causaIgic) ? body.causaIgic : null,
    },
    include: { cliente: true },
  });

  // Commerciale in anagrafica → commissione. Le quote soci per fattura
  // (42,5 % a testa) non si fanno più: il dividendo non è per fattura.
  if (fattura.commercialeId) {
    await syncCommissioneFattura(prisma, fattura.id);
  }

  return NextResponse.json(fattura);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpostazioniFatture } from "@/lib/impostazioni";

// «Crea fattura»: dalla proforma nasce una BOZZA di fattura con gli stessi
// cliente, righe, imposta e commerciale, collegata alla proforma. Numero e
// data li prende all'emissione (con VeriFactu acceso è l'emissione che manda
// il registro all'AEAT); la proforma diventa «convertita» e non si modifica.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proformaId = parseInt(id, 10) || 0;
  const cfg = await getImpostazioniFatture(prisma);
  const oggi = new Date();
  const scadenza =
    cfg.giorniScadenza > 0
      ? new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + cfg.giorniScadenza))
      : null;
  try {
    const fattura = await prisma.$transaction(async (tx) => {
      // Passa da aperta a convertita una volta sola, anche con due clic insieme
      const presa = await tx.proforma.updateMany({
        where: { id: proformaId, stato: "aperta", fatturaId: null, clienteId: { not: null } },
        data: { stato: "convertita", convertitaIl: new Date() },
      });
      if (presa.count !== 1) {
        const p = await tx.proforma.findUnique({ where: { id: proformaId }, select: { stato: true, numero: true } });
        throw new Error(
          !p
            ? "Proforma non trovata."
            : p.stato !== "aperta"
              ? `La proforma ${p.numero} è ${p.stato}: non si converte.`
              : "Scegli il cliente della proforma prima di creare la fattura.",
        );
      }
      const p = await tx.proforma.findUniqueOrThrow({ where: { id: proformaId } });
      const f = await tx.fattura.create({
        data: {
          stato: "bozza",
          clienteId: p.clienteId,
          mese: p.mese,
          anno: p.anno,
          descrizione: p.descrizione,
          voci: p.voci,
          importo: p.importo,
          tipoIva: p.tipoIva,
          iva: p.iva,
          causaIgic: p.causaIgic,
          commercialeId: p.commercialeId,
          scadenza,
          origine: "finance",
        },
      });
      await tx.proforma.update({ where: { id: proformaId }, data: { fatturaId: f.id } });
      return f;
    });
    return NextResponse.json({ fattura });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/proforma/[id]/converti]", msg);
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}

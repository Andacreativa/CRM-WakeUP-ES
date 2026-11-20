import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { causaIgicProposta, getImpostazioniFatture } from "@/lib/impostazioni";
import {
  ambienteAttivo,
  blocca,
  creaRegistroAlta,
  creaRegistroAnulacion,
  creaRegistroCorrezione,
  ErroreFattura,
  inviaCoda,
} from "@/lib/verifactu/catena";

const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "UTC" });

// Azioni VeriFactu su una fattura:
//   registra = fattura già emessa (con numero) ma senza registro, perché
//              nata con VeriFactu spento: ne crea il registro di alta e lo
//              manda. Solo per fatture non trasmesse da altri sistemi
//              (es. Billin): altrimenti all'AEAT risulterebbe doppia
//   reinvia  = dopo un rifiuto o un'accettazione con errori, rimanda il
//              registro con i dati corretti
//   annulla  = registro di annullamento (fattura emessa per errore)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fatturaId = parseInt(id, 10);
  const body = (await request.json().catch(() => ({}))) as { azione?: string };
  try {
    const cfg = await getImpostazioniFatture(prisma);
    const ambiente = ambienteAttivo(cfg);
    if (!ambiente) throw new ErroreFattura(["VeriFactu è spento (Impostazioni › VeriFactu)."], 409);
    const f = await prisma.fattura.findUnique({
      where: { id: fatturaId },
      include: { _count: { select: { acconti: true } }, cliente: { select: { paese: true } } },
    });
    if (!f) throw new ErroreFattura(["Fattura non trovata."], 404);

    if (body.azione === "registra") {
      if (f.vfStato) throw new ErroreFattura(["La fattura ha già il suo registro VeriFactu."], 409);
      if (f.stato !== "emessa" || !f.numero || !f.data)
        throw new ErroreFattura(["Emetti prima la fattura."], 409);
      if (f.annullata) throw new ErroreFattura(["La fattura è annullata."], 409);
      const dataFattura = f.data;
      await prisma.$transaction(
        async (tx) => {
          await blocca(tx);
          // Numeri e date camminano insieme: niente data precedente a una
          // fattura già trasmessa della stessa serie (come all'emissione)
          const rettifica = f.tipoFattura !== "F1";
          const dopo = await tx.fattura.findFirst({
            where: {
              stato: "emessa",
              vfStato: { not: null },
              tipoFattura: rettifica ? { not: "F1" } : "F1",
              data: { gt: dataFattura },
            },
            orderBy: { data: "desc" },
            select: { numero: true, data: true },
          });
          if (dopo)
            throw new ErroreFattura([
              `La fattura ${dopo.numero} del ${dataIt(dopo.data!)} è già trasmessa: questa, del ${dataIt(dataFattura)}, verrebbe prima.`,
            ]);
          // Nata con VeriFactu spento, a 0 % può non avere la causa di
          // esenzione: quella delle Impostazioni per il paese del cliente
          if (!f.causaIgic && !(Number(f.iva) > 0)) {
            const causa = causaIgicProposta(f.cliente?.paese, cfg);
            if (causa) await tx.fattura.update({ where: { id: fatturaId }, data: { causaIgic: causa } });
          }
          await creaRegistroAlta(tx, fatturaId, cfg, ambiente);
        },
        { timeout: 20_000, maxWait: 10_000 },
      );
      const coda = await inviaCoda(prisma, cfg, ambiente);
      return NextResponse.json({ ok: true, coda });
    }

    if (!f.vfStato) throw new ErroreFattura(["Questa fattura non è stata trasmessa da qui."], 409);

    if (body.azione === "annulla") {
      if (f.annullata) throw new ErroreFattura(["La fattura è già annullata."], 409);
      if (f.pagato || f._count.acconti > 0)
        throw new ErroreFattura(["La fattura ha incassi o è segnata incassata: non si può annullare."], 409);
      await prisma.$transaction((tx) => creaRegistroAnulacion(tx, fatturaId, cfg, ambiente), {
        timeout: 20_000,
        maxWait: 10_000,
      });
    } else if (body.azione === "reinvia") {
      await prisma.$transaction((tx) => creaRegistroCorrezione(tx, fatturaId, cfg, ambiente), {
        timeout: 20_000,
        maxWait: 10_000,
      });
    } else {
      throw new ErroreFattura(["Azione non riconosciuta."], 400);
    }
    const coda = await inviaCoda(prisma, cfg, ambiente);
    return NextResponse.json({ ok: true, coda });
  } catch (e) {
    if (e instanceof ErroreFattura) {
      return NextResponse.json({ error: e.message, errori: e.errori }, { status: e.status });
    }
    console.error("[POST /api/fatture/[id]/verifactu]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

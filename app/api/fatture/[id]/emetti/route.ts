import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCommissioneFattura } from "@/lib/commissioni";
import { getImpostazioniFatture, prossimoNumeroFattura } from "@/lib/impostazioni";
import { ambienteAttivo, blocca, creaRegistroAlta, ErroreFattura, inviaCoda } from "@/lib/verifactu/catena";

const oggiUTC = () => new Date(new Date().toISOString().slice(0, 10));
const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "UTC" });

// Emissione: la bozza diventa fattura. Riceve il numero e, con VeriFactu
// acceso, nasce il suo registro (concatenato al precedente) che parte per
// l'AEAT. Numero e registro si decidono insieme, uno alla volta.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fatturaId = parseInt(id, 10);
  const body = (await request.json().catch(() => ({}))) as { numero?: string };
  try {
    const cfg = await getImpostazioniFatture(prisma);
    const ambiente = ambienteAttivo(cfg);
    await prisma.$transaction(
      async (tx) => {
        await blocca(tx);
        const f = await tx.fattura.findUnique({
          where: { id: fatturaId },
          include: { richiesta: { select: { id: true } } },
        });
        if (!f) throw new ErroreFattura(["Fattura non trovata."], 404);
        if (f.stato !== "bozza") throw new ErroreFattura(["La fattura è già emessa."], 409);
        if (!f.clienteId) throw new ErroreFattura(["Scegli il cliente prima di emettere."]);
        if (!f.importo) throw new ErroreFattura(["L'importo della fattura è zero."]);

        const oggi = oggiUTC();
        const data = f.data ?? oggi;
        if (data > oggi) throw new ErroreFattura(["La data di emissione non può essere futura."]);
        const rettifica = f.tipoFattura !== "F1";
        // Con VeriFactu il numero lo assegna sempre il sistema
        const numero =
          (ambiente ? "" : body.numero?.trim()) ||
          (await prossimoNumeroFattura(tx, data.getUTCFullYear(), cfg, rettifica));
        const doppia = await tx.fattura.findFirst({
          where: { numero, id: { not: fatturaId } },
          select: { id: true },
        });
        if (doppia) throw new ErroreFattura([`Il numero ${numero} è già usato da un'altra fattura.`], 409);
        if (ambiente) {
          // Numeri e date camminano insieme: niente data precedente a una
          // fattura già trasmessa della stessa serie
          const dopo = await tx.fattura.findFirst({
            where: {
              stato: "emessa",
              vfStato: { not: null },
              tipoFattura: rettifica ? { not: "F1" } : "F1",
              data: { gt: data },
            },
            orderBy: { data: "desc" },
            select: { numero: true, data: true },
          });
          if (dopo)
            throw new ErroreFattura([
              `La fattura ${dopo.numero} è del ${dataIt(dopo.data!)}: usa una data uguale o successiva.`,
            ]);
        }

        await tx.fattura.update({
          where: { id: fatturaId },
          data: { stato: "emessa", numero, data, emessaIl: new Date() },
        });
        if (f.richiesta) {
          await tx.richiestaFattura.update({
            where: { id: f.richiesta.id },
            data: { emessa: true, emessaIl: data },
          });
        }
        if (ambiente) await creaRegistroAlta(tx, fatturaId, cfg, ambiente);
      },
      { timeout: 20_000, maxWait: 10_000 },
    );

    // La fattura è emessa comunque: se l'AEAT non risponde il registro resta
    // in coda e riparte da solo
    const coda = ambiente ? await inviaCoda(prisma, cfg, ambiente) : null;
    const fattura = await prisma.fattura.findUnique({
      where: { id: fatturaId },
      include: { cliente: true, acconti: true },
    });
    if (fattura?.commercialeId) await syncCommissioneFattura(prisma, fatturaId);
    return NextResponse.json({ fattura, coda });
  } catch (e) {
    if (e instanceof ErroreFattura) {
      return NextResponse.json({ error: e.message, errori: e.errori }, { status: e.status });
    }
    console.error("[POST /api/fatture/[id]/emetti]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

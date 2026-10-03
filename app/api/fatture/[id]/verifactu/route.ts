import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpostazioniFatture } from "@/lib/impostazioni";
import {
  ambienteAttivo,
  creaRegistroAnulacion,
  creaRegistroCorrezione,
  ErroreFattura,
  inviaCoda,
} from "@/lib/verifactu/catena";

// Azioni VeriFactu su una fattura già trasmessa:
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
      include: { _count: { select: { acconti: true } } },
    });
    if (!f) throw new ErroreFattura(["Fattura non trovata."], 404);
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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { leggiVoci } from "@/lib/fatture";

const TIPI = ["R1", "R2", "R3", "R4"];
const round2 = (n: number) => Math.round(n * 100) / 100;

// Prepara la bozza di una rettificativa «per differenze» della fattura:
// totale = storna tutto (stesse righe col segno meno), altrimenti si parte
// vuoti e si scrive la differenza. Diventa fattura quando la si emette.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fatturaId = parseInt(id, 10);
  const body = (await request.json().catch(() => ({}))) as { tipo?: string; totale?: boolean };
  const f = await prisma.fattura.findUnique({ where: { id: fatturaId } });
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (f.stato !== "emessa" || !f.numero) {
    return NextResponse.json({ error: "Si rettifica solo una fattura emessa." }, { status: 409 });
  }
  if (f.tipoFattura !== "F1") {
    return NextResponse.json({ error: "Una rettificativa non si rettifica a sua volta." }, { status: 409 });
  }
  if (f.annullata) {
    return NextResponse.json({ error: "La fattura è annullata." }, { status: 409 });
  }
  const totale = body.totale !== false;
  const voci = totale ? leggiVoci(f.voci).map((v) => ({ ...v, prezzo: -v.prezzo })) : [];
  const oggi = new Date();
  const bozza = await prisma.fattura.create({
    data: {
      stato: "bozza",
      tipoFattura: TIPI.includes(body.tipo ?? "") ? body.tipo! : "R1",
      rettificaDiId: f.id,
      clienteId: f.clienteId,
      contrattoId: f.contrattoId,
      azienda: f.azienda,
      aziendaNota: f.aziendaNota,
      mese: oggi.getMonth() + 1,
      anno: oggi.getFullYear(),
      importo: totale ? round2(-f.importo) : 0,
      tipoIva: f.tipoIva,
      iva: f.iva,
      causaIgic: f.causaIgic,
      descrizione: `Rectificación de la factura ${f.numero}`,
      voci: JSON.stringify(voci),
      origine: f.origine,
    },
  });
  return NextResponse.json(bozza);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { leggiVoci } from "@/lib/fatture";

const TIPI = ["R1", "R2", "R3", "R4"];
const round2 = (n: number) => Math.round(n * 100) / 100;

// Prepara la bozza di una rettificativa della fattura. Tre modi:
//   sostituzione = la rifà per intero con i dati giusti (alla sua emissione
//                  la fattura corretta esce dai totali);
//   storno       = per differenze, stesse righe col segno meno;
//   parziale     = per differenze, si scrive la differenza.
// Diventa fattura quando la si emette.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fatturaId = parseInt(id, 10);
  const body = (await request.json().catch(() => ({}))) as { tipo?: string; modo?: string };
  const f = await prisma.fattura.findUnique({
    where: { id: fatturaId },
    include: { _count: { select: { acconti: true } } },
  });
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
  const modo = body.modo === "storno" || body.modo === "parziale" ? body.modo : "sostituzione";
  // La sostituzione toglie la fattura dai totali: i suoi incassi resterebbero appesi
  if (modo === "sostituzione" && (f.pagato || f._count.acconti > 0)) {
    return NextResponse.json(
      { error: "La fattura ha incassi o è segnata incassata: toglili prima, oppure rettifica per differenze." },
      { status: 409 },
    );
  }
  const righe = leggiVoci(f.voci);
  const voci =
    modo === "sostituzione"
      ? righe
      : modo === "storno"
        ? righe.map((v) => ({ ...v, prezzo: -v.prezzo }))
        : [];
  const oggi = new Date();
  const bozza = await prisma.fattura.create({
    data: {
      stato: "bozza",
      tipoFattura: TIPI.includes(body.tipo ?? "") ? body.tipo! : "R1",
      tipoRettifica: modo === "sostituzione" ? "S" : "I",
      rettificaDiId: f.id,
      clienteId: f.clienteId,
      contrattoId: f.contrattoId,
      azienda: f.azienda,
      aziendaNota: f.aziendaNota,
      mese: oggi.getMonth() + 1,
      anno: oggi.getFullYear(),
      importo: modo === "sostituzione" ? f.importo : modo === "storno" ? round2(-f.importo) : 0,
      tipoIva: f.tipoIva,
      iva: f.iva,
      causaIgic: f.causaIgic,
      scadenza: modo === "sostituzione" ? f.scadenza : null,
      commercialeId: modo === "sostituzione" ? f.commercialeId : null,
      // La sostituzione è la stessa operazione, rifatta: tiene la sua descrizione
      descrizione: modo === "sostituzione" ? f.descrizione : `Rectificación de la factura ${f.numero}`,
      voci: JSON.stringify(voci),
      origine: f.origine,
    },
  });
  return NextResponse.json(bozza);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aliquota, imposta, lordo, statoCalcolato, totalePagato } from "@/lib/fatture";
import { isFinnRitenuta } from "@/lib/finn-split";
import { mesiDelPeriodo, type InformeDati } from "@/lib/informe";

export const runtime = "nodejs";

const r2 = (n: number) => Math.round(n * 100) / 100;

// Dati dell'informe per il commercialista fra due date (incluse). Le fatture
// per data di emissione (chi non ce l'ha, per mese di competenza); spese e
// altri ingressi per mese di competenza, perché non hanno una data.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const valida = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const da = valida(searchParams.get("da"));
  const a = valida(searchParams.get("a"));
  if (!da || !a || a < da) return NextResponse.json({ error: "Periodo non valido" }, { status: 400 });

  const perMese = mesiDelPeriodo(da, a);
  const range = { gte: new Date(`${da}T00:00:00.000Z`), lte: new Date(`${a}T23:59:59.999Z`) };

  const [fatture, spese, altriRaw] = await Promise.all([
    prisma.fattura.findMany({
      where: {
        stato: "emessa",
        annullata: false,
        origine: { not: "sales" },
        OR: [{ data: range }, { data: null, OR: perMese }],
      },
      select: {
        id: true,
        numero: true,
        data: true,
        mese: true,
        anno: true,
        importo: true,
        tipoIva: true,
        iva: true,
        causaIgic: true,
        tipoFattura: true,
        pagato: true,
        cliente: { select: { nome: true, partitaIva: true, paese: true } },
        acconti: { select: { importo: true } },
        rettificaDi: { select: { numero: true } },
      },
      orderBy: [{ data: "asc" }, { id: "asc" }],
    }),
    prisma.spesa.findMany({
      where: { OR: perMese },
      orderBy: [{ anno: "asc" }, { mese: "asc" }, { categoria: "asc" }, { fornitore: "asc" }],
    }),
    prisma.altroIngresso.findMany({
      where: { OR: perMese },
      orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
    }),
  ]);
  const idFornitori = Array.from(new Set(spese.map((s) => s.fornitoreId).filter((x): x is number => !!x)));
  const fornitori = idFornitori.length
    ? await prisma.fornitore.findMany({ where: { id: { in: idFornitori } }, select: { id: true, partitaIva: true } })
    : [];
  const nifFornitore = new Map(fornitori.map((f) => [f.id, f.partitaIva ?? ""]));

  const righe: InformeDati["fatture"] = fatture.map((f) => {
    const al = aliquota(f);
    const total = lordo(f);
    const cobrada = statoCalcolato(f) === "pagato";
    return {
      id: f.id,
      numero: f.numero,
      data: f.data ? f.data.toISOString().slice(0, 10) : null,
      mese: f.mese,
      anno: f.anno,
      cliente: f.cliente?.nome ?? "—",
      nif: f.cliente?.partitaIva ?? "",
      paese: f.cliente?.paese ?? "",
      base: r2(f.importo),
      aliquota: al,
      cuota: imposta(f),
      total,
      // Registrate a mano non hanno la causa: a 0 % vale E2 (confermato col commercialista)
      causa: al === 0 ? f.causaIgic || "E2" : "",
      tipoFattura: f.tipoFattura,
      rettificaDi: f.rettificaDi?.numero ?? null,
      cobrada,
      cobrado: cobrada ? total : r2(Math.min(total, totalePagato(f))),
    };
  });
  const speseRighe: InformeDati["spese"] = spese.map((s) => ({
    id: s.id,
    mese: s.mese,
    anno: s.anno,
    fornitore: s.fornitore,
    nif: s.fornitoreId ? (nifFornitore.get(s.fornitoreId) ?? "") : "",
    categoria: s.categoria,
    descrizione: s.descrizione ?? "",
    importo: r2(s.importo),
  }));
  // Le ritenute interne (split Finn) non sono entrate: fuori, come in Bilancio
  const altri: InformeDati["altri"] = altriRaw
    .filter((x) => !isFinnRitenuta(x))
    .map((x) => ({
      id: x.id,
      mese: x.mese,
      anno: x.anno,
      fonte: x.fonte,
      categoria: x.categoria ?? "",
      descrizione: x.descrizione ?? "",
      importo: r2(x.importo),
      incassato: x.incassato,
    }));

  const somma = <T,>(l: T[], fn: (x: T) => number) => r2(l.reduce((s, x) => s + fn(x), 0));
  const perCategoria = new Map<string, number>();
  for (const s of speseRighe) perCategoria.set(s.categoria, r2((perCategoria.get(s.categoria) ?? 0) + s.importo));
  const base = somma(righe, (f) => f.base);
  const gastos = somma(speseRighe, (s) => s.importo);
  const otros = somma(altri, (x) => x.importo);
  const total = somma(righe, (f) => f.total);
  const cobrado = somma(righe, (f) => f.cobrado);
  const dati: InformeDati = {
    da,
    a,
    fatture: righe,
    spese: speseRighe,
    altri,
    riepilogo: {
      nFatture: righe.length,
      base,
      cuota: somma(righe, (f) => f.cuota),
      total,
      cobrado,
      pendiente: r2(total - cobrado),
      nSpese: speseRighe.length,
      gastos,
      gastosPerCategoria: Array.from(perCategoria, ([categoria, importo]) => ({ categoria, importo })).sort(
        (x, y) => y.importo - x.importo,
      ),
      nAltri: altri.length,
      otros,
      resultado: r2(base + otros - gastos),
    },
  };
  return NextResponse.json(dati);
}

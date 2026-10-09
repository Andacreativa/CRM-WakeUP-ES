import type { Prisma } from "@prisma/client";

// Helper per le richieste di fattura ("fatture da emettere").

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Stesse opzioni IVA delle fatture: IGIC esente (0) o IGIC 7%.
export const ivaPerTipo = (tipoIva: string | null | undefined): number =>
  tipoIva === "igic7" ? 7 : 0;

export interface VoceRichiesta {
  descrizione: string;
  importo: number;
}

export function parseVoci(raw: unknown): VoceRichiesta[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v) => {
      const o = (v ?? {}) as Record<string, unknown>;
      return {
        descrizione: String(o.descrizione ?? "").trim(),
        importo: Number(o.importo) || 0,
      };
    })
    .filter((v) => v.descrizione || v.importo);
}

export function calcolaImporti(
  voci: VoceRichiesta[],
  imponibileFallback: unknown,
  tipoIva: string,
) {
  const imponibile = round2(
    voci.length
      ? voci.reduce((s, v) => s + v.importo, 0)
      : Number(imponibileFallback) || 0,
  );
  const iva = ivaPerTipo(tipoIva);
  const totale = round2(imponibile * (1 + iva / 100));
  return { imponibile, iva, totale };
}

// Avanza di `step` mesi (1 = mensile, 3 = trimestrale, 12 = annuale).
export function avanzaMese(mese: number, anno: number, step: number) {
  const idx = (anno * 12 + (mese - 1)) + step;
  return { anno: Math.floor(idx / 12), mese: (idx % 12) + 1 };
}

export const STEP_RICORRENZA: Record<string, number> = {
  una_tantum: 0,
  mensile: 1,
  trimestrale: 3,
  annuale: 12,
};

// Codice progressivo per anno: RF-2026-0001 (max esistente + 1).
export async function nextCodiceRichiesta(
  tx: Prisma.TransactionClient,
  anno: number,
): Promise<string> {
  const prefix = `RF-${anno}-`;
  const rows = await tx.richiestaFattura.findMany({
    where: { codice: { startsWith: prefix } },
    select: { codice: true },
  });
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.codice.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export const RICHIESTA_INCLUDE = {
  cliente: { select: { id: true, nome: true, paese: true } },
  contratto: { select: { id: true, numero: true, oggetto: true } },
  rinnovo: { select: { id: true, dominio: true } },
  fattura: {
    select: {
      id: true,
      numero: true,
      pagato: true,
      importo: true,
      data: true,
      stato: true,
      acconti: { select: { importo: true } },
    },
  },
} satisfies Prisma.RichiestaFatturaInclude;

export type RichiestaConRelazioni = Prisma.RichiestaFatturaGetPayload<{
  include: typeof RICHIESTA_INCLUDE;
}>;

export type StatoRichiesta = "da_validare" | "da_fare" | "emessa" | "incassata";

// Stato effettivo: se c'è una fattura collegata, emessa e incassata si
// leggono da lì; altrimenti valgono i flag manuali (come Northstar).
export function serializzaRichiesta(r: RichiestaConRelazioni) {
  // Una bozza collegata non è ancora una fattura: conta dall'emissione
  const emessaEff = r.fattura ? r.fattura.stato === "emessa" : r.emessa;
  let incassataEff = r.incassata;
  if (r.fattura && emessaEff) {
    const acconti = r.fattura.acconti.reduce((s, a) => s + a.importo, 0);
    incassataEff =
      r.fattura.pagato || (acconti > 0 && acconti >= r.fattura.importo);
  }
  let stato: StatoRichiesta;
  if (emessaEff && incassataEff) stato = "incassata";
  else if (emessaEff) stato = "emessa";
  else if (r.validazione !== "ok") stato = "da_validare";
  else stato = "da_fare";
  return { ...r, emessaEff, incassataEff, stato };
}

export type RichiestaSerializzata = ReturnType<typeof serializzaRichiesta>;

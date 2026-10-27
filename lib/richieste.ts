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

// Avanza di `step` mesi (1 = mensile, 3 = trimestrale, 6 = semestrale,
// 12 = annuale, N = «ogni N mesi»).
export function avanzaMese(mese: number, anno: number, step: number) {
  const idx = (anno * 12 + (mese - 1)) + step;
  return { anno: Math.floor(idx / 12), mese: (idx % 12) + 1 };
}

// ── Ricorrenze ───────────────────────────────────────────────────────────
// Il passo è il numero di mesi fra una rata e la successiva. Le ricorrenze
// standard hanno il passo fisso; «personalizzata» («Ogni N mesi» nel
// modulo) lo prende da `passoMesi`, salvato sulla richiesta.
export const STEP_RICORRENZA: Record<string, number> = {
  una_tantum: 0,
  mensile: 1,
  trimestrale: 3,
  semestrale: 6,
  annuale: 12,
};
export const RICORRENZA_LIBERA = "personalizzata";
export const PASSO_LIBERO = { min: 2, max: 24, iniziale: 4 } as const;

// Il passo libero arriva dal browser: se manca, non è intero o è fuori da
// 2-24 si rifiuta (null), non si inventa un passo.
export function passoLiberoValido(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= PASSO_LIBERO.min && n <= PASSO_LIBERO.max ? n : null;
}

export type RicorrenzaLetta =
  | { ok: true; ricorrenza: string; passo: number; passoMesi: number | null }
  | { ok: false; errore: string };

// Ricorrenza e passo dal corpo della richiesta. Un valore sconosciuto vale
// «una tantum» come prima; «personalizzata» senza un passo valido è un errore.
export function leggiRicorrenza(ricorrenza: unknown, passoMesi: unknown): RicorrenzaLetta {
  const r = String(ricorrenza ?? "");
  if (r === RICORRENZA_LIBERA) {
    const passo = passoLiberoValido(passoMesi);
    if (passo === null) {
      return {
        ok: false,
        errore: `Ogni quanti mesi: serve un numero intero da ${PASSO_LIBERO.min} a ${PASSO_LIBERO.max}`,
      };
    }
    return { ok: true, ricorrenza: r, passo, passoMesi: passo };
  }
  if (STEP_RICORRENZA[r] !== undefined) {
    return { ok: true, ricorrenza: r, passo: STEP_RICORRENZA[r], passoMesi: null };
  }
  return { ok: true, ricorrenza: "una_tantum", passo: 0, passoMesi: null };
}

// Quante rate si possono chiedere in un colpo. Unico posto in cui si
// calcola: la pagina lo riceve da GET /api/richieste-fattura/ricorrenze.
// Mensile, trimestrale e annuale restano a 36 come prima; semestrale 6
// (3 anni); passo libero: sotto i 12 mesi quante ne stanno in 3 anni, da 12
// in su quante ne stanno in 10 anni.
const TETTO_STANDARD = 36;
export function tettoRate(ricorrenza: string, passo: number): number {
  if (passo <= 0) return 1;
  if (ricorrenza === "semestrale") return 6;
  if (ricorrenza === RICORRENZA_LIBERA) {
    return Math.max(1, Math.floor((passo < 12 ? 36 : 120) / passo));
  }
  return TETTO_STANDARD;
}

// Regole per il modulo: passo e tetto di ogni ricorrenza standard, limiti
// e tetti del passo libero.
export function regoleRicorrenze() {
  const fisse: Record<string, { passo: number; tetto: number }> = {};
  for (const [r, passo] of Object.entries(STEP_RICORRENZA)) {
    fisse[r] = { passo, tetto: tettoRate(r, passo) };
  }
  const tetti: Record<string, number> = {};
  for (let n = PASSO_LIBERO.min; n <= PASSO_LIBERO.max; n++) {
    tetti[String(n)] = tettoRate(RICORRENZA_LIBERA, n);
  }
  return { fisse, libera: { valore: RICORRENZA_LIBERA, ...PASSO_LIBERO, tetti } };
}
export type RegoleRicorrenze = ReturnType<typeof regoleRicorrenze>;

// Data di una rata: stesso giorno del mese della prima, `mesi` dopo; se quel
// giorno non esiste nel mese d'arrivo si usa l'ultimo del mese (mai il mese
// dopo). Si conta sempre dalla prima data, così dopo un 28/02 si torna al
// 30. In UTC, come le date «AAAA-MM-GG» che arrivano dal modulo.
export function aggiungiMesi(data: Date, mesi: number): Date {
  const anno = data.getUTCFullYear();
  const mese = data.getUTCMonth() + mesi;
  const ultimo = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      anno,
      mese,
      Math.min(data.getUTCDate(), ultimo),
      data.getUTCHours(),
      data.getUTCMinutes(),
      data.getUTCSeconds(),
      data.getUTCMilliseconds(),
    ),
  );
}

async function ultimoNumeroRichiesta(
  tx: Prisma.TransactionClient,
  anno: number,
): Promise<number> {
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
  return max;
}

const codiceRichiesta = (anno: number, n: number) =>
  `RF-${anno}-${String(n).padStart(4, "0")}`;

// Codice progressivo per anno: RF-2026-0001 (max esistente + 1).
export async function nextCodiceRichiesta(
  tx: Prisma.TransactionClient,
  anno: number,
): Promise<string> {
  return codiceRichiesta(anno, (await ultimoNumeroRichiesta(tx, anno)) + 1);
}

// Per le serie: legge il massimo di ogni anno una volta sola e poi conta in
// memoria. Una lettura per rata, con 12+ rate, sforava i 5 s della transazione.
export function contatoreCodiciRichiesta(tx: Prisma.TransactionClient) {
  const ultimi = new Map<number, number>();
  return async (anno: number): Promise<string> => {
    const n = (ultimi.get(anno) ?? (await ultimoNumeroRichiesta(tx, anno))) + 1;
    ultimi.set(anno, n);
    return codiceRichiesta(anno, n);
  };
}

// Crea tutte le righe con una sola INSERT e le rilegge con le relazioni,
// nello stesso ordine.
export async function creaRichieste(
  tx: Prisma.TransactionClient,
  righe: Prisma.RichiestaFatturaCreateManyInput[],
): Promise<RichiestaConRelazioni[]> {
  await tx.richiestaFattura.createMany({ data: righe });
  const codici = righe.map((r) => r.codice);
  const rows = await tx.richiestaFattura.findMany({
    where: { codice: { in: codici } },
    include: RICHIESTA_INCLUDE,
  });
  return rows.sort((a, b) => codici.indexOf(a.codice) - codici.indexOf(b.codice));
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

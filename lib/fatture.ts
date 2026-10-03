// Tipi e calcoli comuni alla lista Fatture e al pannello della singola
// fattura: un solo posto dove si decide se una fattura è incassata.

export interface ClienteFattura {
  id: number;
  nome: string;
  paese: string;
  email?: string | null;
  partitaIva?: string | null;
  via?: string | null;
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
  smh?: boolean;
}
export interface Acconto {
  id: number;
  importo: number;
  data: string;
  metodoPagamento: string | null;
  note: string | null;
}
export interface Fattura {
  id: number;
  numero: string | null;
  data: string | null;
  clienteId: number | null;
  cliente: ClienteFattura | null;
  azienda: string;
  aziendaNota: string | null;
  mese: number;
  anno: number;
  importo: number;
  tipoIva: string;
  iva: number;
  pagato: boolean;
  inviata: boolean;
  dataInvio: string | null;
  presentata: boolean;
  presentataIl: string | null;
  annullata: boolean;
  annullataIl: string | null;
  metodo: string | null;
  commerciale: string | null;
  commercialeId: number | null;
  scadenza: string | null;
  stato: string; // bozza | emessa
  emessaIl: string | null;
  descrizione: string | null;
  voci: string; // JSON, vedi leggiVoci
  causaIgic: string | null;
  tipoFattura: string; // F1 | R1…R4
  rettificaDiId: number | null;
  vfStato: string | null;
  vfQr: string | null;
  acconti: Acconto[];
}
// La scheda completa (GET /api/fatture/[id])
export interface FatturaDettaglio extends Fattura {
  solleciti: { id: number; data: string; canale: string; nota: string | null }[];
  richiesta: { id: number; codice: string; descrizione: string; voci: string } | null;
  contratto: { id: number; numero: string; oggetto: string } | null;
  commercialeRef: {
    id: number;
    nome: string;
    cognome: string | null;
    email: string | null;
  } | null;
  rettificaDi: { id: number; numero: string | null; data: string | null } | null;
  rettifiche: { id: number; numero: string | null; stato: string; importo: number }[];
  registriVerifactu: RegistroVf[];
}
// Un registro VeriFactu della fattura (emissione, correzione, annullamento)
export interface RegistroVf {
  id: number;
  ambiente: string;
  tipo: string; // alta | anulacion
  subsanacion: boolean;
  stato: string; // in_coda | accettato | accettato_con_errori | rifiutato
  csv: string | null;
  codiceErrore: string | null;
  descrizioneErrore: string | null;
  ultimoErrore: string | null;
  tentativi: number;
  inviatoIl: string | null;
  createdAt: string;
}

export type StatoFattura = "bozza" | "pagato" | "acconto" | "attesa" | "annullata";

// ── Righe della fattura ────────────────────────────────────────────────────
export interface Voce {
  descrizione: string;
  quantita: number;
  prezzo: number;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
export function leggiVoci(raw: unknown): Voce[] {
  let a: unknown = raw;
  if (typeof raw === "string") {
    try {
      a = JSON.parse(raw || "[]");
    } catch {
      return [];
    }
  }
  if (!Array.isArray(a)) return [];
  return a
    .map((v) => ({
      descrizione: String(v?.descrizione ?? "").trim(),
      quantita: Number(v?.quantita ?? 1) || 0,
      prezzo: Number(v?.prezzo ?? 0) || 0,
    }))
    .filter((v) => v.descrizione || v.prezzo);
}
export const totaleVoci = (voci: Voce[]) => round2(voci.reduce((s, v) => s + v.quantita * v.prezzo, 0));

// A 0 % il registro VeriFactu vuole sapere perché: esente (con la causa) o
// non soggetta. Testi dal documento «Validaciones» dell'AEAT, parte IGIC.
export const CAUSE_ZERO: { value: string; label: string }[] = [
  { value: "E1", label: "E1 · esente, capitolo I D.Leg. 1/2025" },
  { value: "E2", label: "E2 · esente, art. 11 Ley 20/1991" },
  { value: "E3", label: "E3 · esente, art. 12 Ley 20/1991" },
  { value: "E4", label: "E4 · esente, art. 13 Ley 20/1991" },
  { value: "E5", label: "E5 · esente, art. 25 Ley 19/1994" },
  { value: "E6", label: "E6 · esente, art. 47 Ley 19/1994" },
  { value: "E7", label: "E7 · esente, art. 90 D.Leg. 1/2025" },
  { value: "E8", label: "E8 · esente, altri casi Ley 20/1991" },
  { value: "N1", label: "N1 · non soggetta, art. 9 Ley 20/1991 e altri" },
  { value: "N2", label: "N2 · non soggetta per regole di localizzazione" },
];
export const nonSoggetta = (causa: string | null | undefined) => !!causa && causa.startsWith("N");

// Fattura trasmessa da questa app: i dati fiscali non si toccano più. Si
// correggono solo se l'AEAT ha rifiutato il registro o lo ha preso con errori.
export const gestitaVf = (f: { vfStato?: string | null }) => !!f.vfStato;
export const correggibileVf = (f: { vfStato?: string | null }) =>
  f.vfStato === "rifiutata" || f.vfStato === "accettata_con_errori";
export const TIPI_RETTIFICA: { value: string; label: string }[] = [
  { value: "R1", label: "R1 · errore di diritto e art. 80 uno, due, sei LIVA" },
  { value: "R2", label: "R2 · concorso del cliente (art. 80 tre)" },
  { value: "R3", label: "R3 · credito incobrabile (art. 80 quattro)" },
  { value: "R4", label: "R4 · altri casi" },
];

export const totalePagato = (f: { acconti?: { importo: number }[] }) =>
  (f.acconti ?? []).reduce((s, a) => s + a.importo, 0);
// Una rettificativa ha importo negativo: il suo residuo (negativo) compensa
// quello della fattura che corregge
export const residuo = (f: { importo: number; acconti?: { importo: number }[] }) =>
  f.importo < 0 ? f.importo - totalePagato(f) : Math.max(0, f.importo - totalePagato(f));
export const statoCalcolato = (f: {
  pagato: boolean;
  importo: number;
  annullata?: boolean;
  stato?: string;
  acconti?: { importo: number }[];
}): StatoFattura => {
  if (f.stato === "bozza") return "bozza";
  // Annullata: resta nel registro ma non è né incassata né da incassare
  if (f.annullata) return "annullata";
  if (f.pagato) return "pagato";
  // Rettificativa: si chiude a mano, quando è compensata o rimborsata
  if (f.importo < 0) return "attesa";
  if (totalePagato(f) >= f.importo) return "pagato";
  if (totalePagato(f) > 0) return "acconto";
  return "attesa";
};

// Incasso creato dalla riconciliazione bancaria (nota = NOTA_BANCA di
// lib/banca.ts): si scollega da Banca › Entrate, non si elimina a mano.
export const incassoDaBanca = (a: { note: string | null }) =>
  (a.note ?? "").startsWith("Incasso da banca");

export const isScaduta = (
  f: { pagato: boolean; annullata?: boolean; scadenza: string | null },
  oggi = new Date(),
) => !f.pagato && !f.annullata && !!f.scadenza && new Date(f.scadenza) < oggi;

export const dataIt = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("it-IT") : "—";

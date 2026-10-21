import { ANNI } from "@/lib/constants";

// Tipi e costanti delle richieste di fattura, comuni a lista, scheda e modali.

export interface ClienteMin {
  id: number;
  nome: string;
  paese?: string;
}
export interface ContrattoMin {
  id: number;
  numero: string;
  oggetto: string;
  clienteId: number | null;
  cliente: { nome: string } | null;
  nomeClienteFallback: string | null;
  numeroRate: number;
  importoMensile: number;
}
export interface VoceRichiesta {
  descrizione: string;
  importo: number;
}
export interface Richiesta {
  id: number;
  codice: string;
  clienteId: number | null;
  cliente: ClienteMin | null;
  nomeCliente: string | null;
  contrattoId: number | null;
  contratto: { id: number; numero: string; oggetto: string } | null;
  rinnovoId?: number | null;
  rinnovo?: { id: number; dominio: string } | null;
  rinnovoScadenza?: string | null;
  azienda: string;
  aziendaNota: string | null;
  descrizione: string;
  voci: string;
  imponibile: number;
  tipoIva: string;
  iva: number;
  totale: number;
  mese: number;
  anno: number;
  dataInvio: string | null;
  serieCodice: string | null;
  serieIndice: number | null;
  serieTotale: number | null;
  ricorrenza: string;
  passoMesi?: number | null; // solo con ricorrenza «personalizzata»
  responsabile: string | null;
  validazione: string;
  validataIl?: string | null;
  emessa: boolean;
  emessaIl?: string | null;
  incassata: boolean;
  fatturaId: number | null;
  fattura: {
    id: number;
    numero: string | null;
    pagato: boolean;
    importo: number;
    data?: string | null;
  } | null;
  origine: string;
  note: string | null;
  createdAt?: string;
  emessaEff: boolean;
  incassataEff: boolean;
  stato: "da_validare" | "da_fare" | "emessa" | "incassata";
  // Quante rate della stessa serie vengono dopo questa (solo dalla scheda,
  // GET /api/richieste-fattura/[id]): se > 0 il modulo chiede «Solo questa /
  // Da questa in poi».
  successive?: number;
}
export interface FatturaCandidata {
  id: number;
  numero: string | null;
  data: string | null;
  mese: number;
  anno: number;
  importo: number;
  pagato: boolean;
  clienteId: number | null;
  cliente: { nome: string } | null;
}

export const STATI_RICHIESTA = [
  { value: "", label: "Tutte" },
  { value: "da_validare", label: "Da validare" },
  { value: "da_fare", label: "Da fare" },
  { value: "emesse", label: "Fatte" },
];
// Voci standard della tendina «Ricorrenza». Il passo libero («Ogni N mesi»)
// non è in tendina: ha il suo tastino e si salva come «personalizzata».
// `nuova`: la tendina la mostra solo se il server la conosce (regole
// ricevute da GET /api/richieste-fattura/ricorrenze).
export const RICORRENZE: { value: string; label: string; nuova?: boolean }[] = [
  { value: "una_tantum", label: "Una tantum" },
  { value: "mensile", label: "Mensile" },
  { value: "trimestrale", label: "Trimestrale" },
  { value: "semestrale", label: "Semestrale", nuova: true },
  { value: "annuale", label: "Annuale" },
];
export const ricorrenzaLabel = (v: string, passoMesi?: number | null) =>
  v === "personalizzata"
    ? passoMesi
      ? `Ogni ${passoMesi} mesi`
      : "Ogni N mesi"
    : RICORRENZE.find((r) => r.value === v)?.label ?? v;

// Regole delle ricorrenze calcolate dal server (passo e tetto delle rate).
// Se la risposta manca o non ha la forma attesa (server non ancora
// aggiornato) il modulo resta com'era: niente Semestrale, niente tastino.
export interface RegoleRicorrenze {
  fisse: Record<string, { passo: number; tetto: number }>;
  libera: { valore: string; min: number; max: number; iniziale: number; tetti: Record<string, number> };
}
export function regoleValide(j: unknown): RegoleRicorrenze | null {
  const r = j as Partial<RegoleRicorrenze> | null;
  const l = r?.libera;
  if (!r?.fisse || typeof r.fisse !== "object" || !l || typeof l !== "object") return null;
  if (![l.min, l.max, l.iniziale].every((n) => Number.isInteger(n)) || !l.tetti) return null;
  return r as RegoleRicorrenze;
}
export const ANNI_FORM = [new Date().getFullYear() + 1, ...ANNI];

export const nomeCliente = (r: {
  cliente: { nome: string } | null;
  nomeCliente: string | null;
}) => r.cliente?.nome || r.nomeCliente || "(cliente da assegnare)";

export const parseVoci = (raw: string): VoceRichiesta[] => {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);

export const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
export const labelCls = "text-xs font-medium text-gray-600 block mb-1";

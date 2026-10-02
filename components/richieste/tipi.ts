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
}
export interface FatturaCandidata {
  id: number;
  numero: string | null;
  data: string | null;
  mese: number;
  anno: number;
  importo: number;
  pagato: boolean;
  cliente: { nome: string } | null;
}

export const STATI_RICHIESTA = [
  { value: "", label: "Tutte" },
  { value: "da_validare", label: "Da validare" },
  { value: "da_fare", label: "Da fare" },
  { value: "emesse", label: "Fatte" },
];
export const RICORRENZE = [
  { value: "una_tantum", label: "Una tantum" },
  { value: "mensile", label: "Mensile" },
  { value: "trimestrale", label: "Trimestrale" },
  { value: "annuale", label: "Annuale" },
];
export const ricorrenzaLabel = (v: string) =>
  RICORRENZE.find((r) => r.value === v)?.label ?? v;
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

import type { Richiesta } from "@/components/richieste/tipi";

// Tipi e costanti dei rinnovi dei siti, comuni a lista, scheda, form e
// lib/rinnovi.ts (che gira sul server: qui niente Prisma).

// La richiesta di fattura del rinnovo nasce questi giorni prima della scadenza.
export const ANTICIPO_GIORNI = 45;

export const STATI_RINNOVO = [
  { value: "attivo", label: "Attivo" },
  { value: "in_lavorazione", label: "In lavorazione" },
  { value: "in_dubbio", label: "In dubbio" },
  { value: "non_attivo", label: "Non attivo" },
] as const;
export const FATTURAZIONI = [
  { value: "rinnovo", label: "Rinnovo a parte" },
  { value: "compresa", label: "Compresa nella gestione" },
  { value: "nessuna", label: "Sito nostro" },
] as const;
export const PROPRIETA = [
  { value: "nostra", label: "Nostra" },
  { value: "cliente", label: "Del cliente" },
] as const;
// Hosting già usati: suggerimenti del campo, si può scrivere altro
export const HOSTING_NOTI = [
  "Squarespace",
  "SiteGround",
  "Aruba",
  "Keliweb",
  "Netsons",
  "Register",
  "Nexaccess",
];

export const statoLabel = (v: string) => STATI_RINNOVO.find((s) => s.value === v)?.label ?? v;
export const fatturazioneLabel = (v: string) =>
  FATTURAZIONI.find((s) => s.value === v)?.label ?? v;
export const proprietaLabel = (v: string) => PROPRIETA.find((s) => s.value === v)?.label ?? v;

// Stato = pill piena (come nel resto dell'app)
export const STATO_PILL: Record<string, string> = {
  attivo: "pill-ok",
  in_lavorazione: "pill-info",
  in_dubbio: "pill-wait",
  non_attivo: "pill-off",
};

export interface Rinnovo {
  id: number;
  dominio: string;
  clienteId: number | null;
  cliente: {
    id: number;
    nome: string;
    paese: string;
    smh: boolean;
    tipoImposta: string | null;
  } | null;
  nomeCliente: string | null;
  scadenza: string;
  importo: number;
  fatturazione: string;
  stato: string;
  hosting: string | null;
  proprieta: string;
  accesso: string | null;
  note: string | null;
  rinnovatoIl: string | null;
  createdAt: string;
  richieste: Richiesta[];
  richiestaCorrente: Richiesta | null;
  giorni: number; // alla scadenza (negativo = scaduto)
  fatturabile: boolean;
  daFatturare: boolean;
}

export const nomeClienteRinnovo = (r: {
  cliente: { nome: string } | null;
  nomeCliente: string | null;
}) => r.cliente?.nome || r.nomeCliente || "(cliente da assegnare)";

export const testoGiorni = (giorni: number) =>
  giorni === 0
    ? "scade oggi"
    : giorni > 0
      ? `tra ${giorni} ${giorni === 1 ? "giorno" : "giorni"}`
      : `scaduto da ${-giorni} ${-giorni === 1 ? "giorno" : "giorni"}`;

export const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
export const labelCls = "text-xs font-medium text-gray-600 block mb-1";

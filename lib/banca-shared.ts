// Parti condivise client/server del modulo Banca: stati, etichette,
// regole di default e tipi. Niente dipendenze server (crypto, xlsx, prisma).
import { CATEGORIE_SPESA } from "./constants";

export const STATI_MOVIMENTO = [
  "da_abbinare",
  "abbinato",
  "spesa_creata",
  "escluso",
] as const;
export type StatoMovimento = (typeof STATI_MOVIMENTO)[number];
export const STATO_MOVIMENTO_LABEL: Record<StatoMovimento, string> = {
  da_abbinare: "Da rivedere",
  abbinato: "Abbinato",
  spesa_creata: "Spesa creata",
  escluso: "Escluso",
};
export const isStatoMovimento = (v: unknown): v is StatoMovimento =>
  typeof v === "string" && (STATI_MOVIMENTO as readonly string[]).includes(v);

// Valore speciale di categoria nelle regole: il movimento viene escluso
// in automatico all'importazione (giroconti, movimenti tecnici).
export const ESCLUDI = "escludi";
export const CATEGORIA_DEFAULT = "Altro";

export interface RegolaBanca {
  pattern: string; // espressione regolare, senza distinzione maiuscole
  categoria: string; // categoria spesa oppure ESCLUDI
  fornitore: string; // facoltativo: fornitore da proporre
}
export interface VoceMemoria {
  categoria: string;
  fornitore: string;
}
export interface ImpostazioniBanca {
  regole: RegolaBanca[];
  memoria: Record<string, VoceMemoria>; // chiave = beneficiario normalizzato
}

const BBVA = "Banco Bilbao Vizcaya Argentaria S.A";
export const REGOLE_BANCA_DEFAULT: RegolaBanca[] = [
  { pattern: "NOMINA|PAGO DE NOMINAS", categoria: "Stipendio", fornitore: "" },
  { pattern: "TGSS|SEGURIDAD SOCIAL|COTIZACION", categoria: "Seguridad Social", fornitore: "" },
  {
    pattern: "COMISION|RETENCI.N PROMOCION|BONIF\\. DEVOLUCION|LIQUIDACION INTERESES",
    categoria: "Costi Bancari",
    fornitore: BBVA,
  },
  {
    pattern: "AEAT|AGENCIA TRIBUTARIA|IMPUESTOS|TRIBUTOS|HACIENDA|\\bNRC\\b",
    categoria: "Tasse",
    fornitore: "Agencia Tributaria",
  },
  {
    pattern: "REEMBOLSO.*SOCIO|GASTOS DE SOCIO|ANTICIPOS DE GASTOS",
    categoria: "Soci",
    fornitore: "",
  },
  {
    pattern: "ADEUDO MENSUAL DE TARJETA|TARJETA VIRTUAL|RECARGA|TRASPASO",
    categoria: "Carta Aziendale",
    fornitore: BBVA,
  },
  { pattern: "METROPOLITAN WORLD", categoria: "Ufficio", fornitore: "Metropolitan World SL" },
  {
    pattern: "JOSE RAMON GARCIA|QUANTUM BUSINESS|ASESORIA",
    categoria: "Commercialista",
    fornitore: "",
  },
  { pattern: "RYANAIR|VUELING|EASYJET|RENFE|CABIFY", categoria: "Costi Aziendali", fornitore: "" },
  {
    pattern:
      "GOOGLE|ANTHROPIC|OPENAI|IONOS|SQUARESPACE|SITEGROUND|ADOBE|NOTION|VERCEL|FIGMA|CANVA|MICROSOFT|ARTLIST|UDEMY",
    categoria: "Software",
    fornitore: "",
  },
  {
    pattern: "PAGO FACTURA|PAGO FATTURA|FACTURA|FATTURA|INVOICE",
    categoria: "Fornitori",
    fornitore: "",
  },
];

export const categoriaValida = (c: unknown): c is string =>
  typeof c === "string" && (c === ESCLUDI || CATEGORIE_SPESA.includes(c));

export interface CandidatoSpesa {
  id: number;
  categoria: string;
  fornitore: string;
  descrizione: string | null;
  importo: number;
  mese: number;
  anno: number;
  registro: string | null; // "Stipendio · Lorenzo Vanghetti" se nasce dal registro
  stessoMese: boolean;
  punteggio: number;
}
export interface Suggerimento {
  categoria: string;
  fornitore: string;
  fornitoreId: number | null;
  descrizione: string;
  escludi: boolean;
  origine: "memoria" | "regola" | "default";
  candidati: CandidatoSpesa[];
}

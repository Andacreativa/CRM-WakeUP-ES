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
    categoria: "Rimborsi",
    fornitore: "",
  },
  // La carta virtuale …7737 è quella su cui si pagano le commissioni a Finn
  {
    pattern: "TARJETA VIRTUAL.*7737",
    categoria: "Commissioni",
    fornitore: "Finn Kalbhenn",
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
      "GOOGLE|ANTHROPIC|CLAUDE|OPENAI|CHATGPT|IONOS|SQUARESPACE|SITEGROUND|ADOBE|NOTION|VERCEL|FIGMA|CANVA|MICROSOFT|ARTLIST|UDEMY",
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
  // Più spese pagate con un solo movimento (es. 3 commissioni in una
  // ricarica): id negativo, le spese vere sono in `ids`
  ids?: number[];
}
export interface Suggerimento {
  categoria: string;
  fornitore: string;
  fornitoreId: number | null;
  descrizione: string;
  escludi: boolean;
  origine: "memoria" | "regola" | "default";
  // Persona in anagrafica citata nel movimento (nomine, rimborsi soci):
  // con categoria Rimborsi o Benefit la spesa finisce anche nel registro.
  dipendenteId: number | null;
  dipendenteNome: string | null;
  candidati: CandidatoSpesa[];
}

// ─── Riconciliazione entrate (Fase 4) ────────────────────────────────
// Un bonifico in entrata si abbina a una o più fatture (crea un Acconto per
// ciascuna, con la data del movimento) oppure diventa un Altro ingresso
// (cashback, rimborso tasse, apporto socio…); i giroconti si escludono.
export interface FatturaCandidata {
  id: number;
  numero: string | null;
  cliente: string;
  clienteId: number | null;
  importo: number;
  incassato: number; // acconti già registrati
  residuo: number; // importo - incassato (0 se già segnata incassata)
  pagato: boolean;
  mese: number;
  anno: number;
  azienda: string;
  punteggio: number;
  motivi: string[]; // "numero citato", "cliente", "importo", "mese"
}
export type CategoriaAltroIngresso =
  | "cashback"
  | "rimborso_tasse"
  | "apporto_socio"
  | "incasso_senza_fattura"
  | "altro";
export interface SuggerimentoEntrata {
  candidati: FatturaCandidata[]; // ordinati per punteggio, le proposte in testa
  proposti: number[]; // id delle fatture preselezionate
  certo: boolean; // numero citato (o cliente) + importi che quadrano: si può applicare in blocco
  altro: CategoriaAltroIngresso | null; // non è un incasso di fattura
  escludi: boolean; // giroconto / movimento tecnico
  motivo: string; // riga esplicativa per l'utente
}

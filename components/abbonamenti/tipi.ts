// Tipi e costanti degli abbonamenti boogo / cobrea e degli addebiti SEPA,
// comuni a lista, scheda, form, modulo pubblico e lib (niente Prisma qui).

export const PRODOTTI = [
  { value: "boogo", label: "Boogo" },
  { value: "cobrea", label: "Cobrea" },
] as const;
export type Prodotto = (typeof PRODOTTI)[number]["value"];
export const prodottoValido = (v: unknown): v is Prodotto =>
  PRODOTTI.some((p) => p.value === v);
export const nomeProdotto = (v: string) => PRODOTTI.find((p) => p.value === v)?.label ?? v;

export const STATI_ABBONAMENTO = [
  { value: "in_attesa", label: "Da firmare" },
  { value: "attivo", label: "Attivo" },
  { value: "sospeso", label: "Sospeso" },
  { value: "cancellato", label: "Cancellato" },
] as const;
export const statoAbbonamentoLabel = (v: string) =>
  STATI_ABBONAMENTO.find((s) => s.value === v)?.label ?? v;
export const STATO_ABB_PILL: Record<string, string> = {
  in_attesa: "pill-wait",
  attivo: "pill-ok",
  sospeso: "pill-partial",
  cancellato: "pill-off",
};

export const LINGUE = [
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
] as const;
export type Lingua = (typeof LINGUE)[number]["value"];
export const linguaValida = (v: unknown): Lingua =>
  v === "it" || v === "en" ? v : "es";

// Stesse imposte delle fatture: IGIC 7 % (Canarie), 0 % (esente / non
// soggetta, es. penisola con inversione del soggetto passivo), IVA 21 %.
export const TIPI_IVA_ABB = [
  { value: "igic7", label: "IGIC 7 %", aliquota: 7 },
  { value: "igic_exenta", label: "0 % (esente / no sujeto)", aliquota: 0 },
  { value: "iva", label: "IVA 21 %", aliquota: 21 },
] as const;
export const aliquotaPerTipo = (tipoIva: string) =>
  TIPI_IVA_ABB.find((t) => t.value === tipoIva)?.aliquota ?? 0;
export const tipoIvaValido = (v: unknown) =>
  TIPI_IVA_ABB.some((t) => t.value === v) ? String(v) : "igic7";
export const tipoIvaLabel = (v: string) => TIPI_IVA_ABB.find((t) => t.value === v)?.label ?? v;

// Imposta dal CAP: Canarie (35xxx, 38xxx) → IGIC 7 %; resto della Spagna →
// 0 % non soggetto (inversione del soggetto passivo); estero → 0 %.
// Senza CAP spagnolo vale il default del piano.
export function tipoIvaSuggerito(paese: string, cap: string | null | undefined, fallback: string) {
  if (paese !== "Spagna") return "igic_exenta";
  const c = String(cap ?? "").trim();
  if (/^(35|38)\d{3}$/.test(c)) return "igic7";
  if (/^\d{5}$/.test(c)) return "igic_exenta";
  return tipoIvaValido(fallback);
}

// Importi mensili: imponibile, aliquota e lordo (2 decimali)
export const round2 = (n: number) => Math.round(n * 100) / 100;
export function importiMensili(prezzo: number, tipoIva: string) {
  const p = round2(Math.max(0, prezzo));
  const iva = aliquotaPerTipo(tipoIva);
  return { prezzo: p, tipoIva, iva, totale: round2(p * (1 + iva / 100)) };
}

export const STATI_ADDEBITO = [
  { value: "previsto", label: "Previsto" },
  { value: "in_remessa", label: "In remessa" },
  { value: "incassato", label: "Incassato" },
  { value: "devuelto", label: "Devuelto" },
  { value: "annullato", label: "Annullato" },
] as const;
export const statoAddebitoLabel = (v: string) =>
  STATI_ADDEBITO.find((s) => s.value === v)?.label ?? v;
export const STATO_ADDEBITO_PILL: Record<string, string> = {
  previsto: "pill-wait",
  in_remessa: "pill-info",
  incassato: "pill-ok",
  devuelto: "pill-late",
  annullato: "pill-off",
};

export const STATI_REMESSA = [
  { value: "generata", label: "Generata" },
  { value: "inviata", label: "Caricata in banca" },
  { value: "incassata", label: "Incassata" },
] as const;
export const statoRemessaLabel = (v: string) =>
  STATI_REMESSA.find((s) => s.value === v)?.label ?? v;
export const STATO_REMESSA_PILL: Record<string, string> = {
  generata: "pill-wait",
  inviata: "pill-info",
  incassata: "pill-ok",
};

export interface Piano {
  id: number;
  prodotto: string;
  codice: string;
  nome: string;
  descrizione: string | null; // spagnolo
  descrizioneIt: string | null;
  descrizioneEn: string | null;
  prezzo: number;
  prezzoLibero: boolean;
  tipoIva: string;
  attivo: boolean;
  ordine: number;
}

export interface AddebitoMin {
  id: number;
  anno: number;
  mese: number;
  importo: number;
  descrizione: string;
  endToEndId: string;
  seq: string;
  stato: string;
  remessaId: number | null;
  remessa: { id: number; codice: string; dataAddebito: string; stato: string } | null;
  fatturaId: number | null;
  fattura: { id: number; numero: string | null; pagato: boolean; stato: string } | null;
  dataIncasso: string | null;
  dataDevoluzione: string | null;
  motivoDevoluzione: string | null;
  createdAt: string;
}

export interface Abbonamento {
  id: number;
  codice: string;
  prodotto: string;
  pianoId: number | null;
  piano: { id: number; codice: string; nome: string } | null;
  pianoNome: string;
  prezzo: number;
  tipoIva: string;
  iva: number;
  totale: number;
  intestatario: string;
  nif: string | null;
  email: string;
  telefono: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  paese: string;
  titolareConto: string;
  iban: string;
  bic: string | null;
  mandatoRef: string;
  mandatoFirmatoIl: string | null;
  mandatoLuogo: string | null;
  mandatoIp: string | null;
  mandatoUserAgent: string | null;
  contrattoTesto: string | null;
  contrattoVersione: string | null;
  lingua: string;
  stato: string;
  dataInizio: string | null;
  dataFine: string | null;
  sospesoIl: string | null;
  cancellatoIl: string | null;
  tokenFirma: string | null;
  tokenScadenza: string | null;
  clienteId: number | null;
  cliente: { id: number; nome: string; paese: string } | null;
  origine: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  addebiti: AddebitoMin[];
  // calcolati
  ultimoAddebito: AddebitoMin | null;
  devoluciones: number;
  linkFirma: string | null;
}

export interface AddebitoRiga extends AddebitoMin {
  abbonamentoId: number;
  abbonamento: {
    id: number;
    codice: string;
    prodotto: string;
    pianoNome: string;
    intestatario: string;
    titolareConto: string;
    iban: string;
    mandatoRef: string;
    mandatoFirmatoIl: string | null;
    stato: string;
    email: string;
  };
}

export interface Remessa {
  id: number;
  codice: string;
  msgId: string;
  dataAddebito: string;
  numero: number;
  totale: number;
  versione: string;
  nomeFile: string;
  stato: string;
  inviataIl: string | null;
  incassataIl: string | null;
  note: string | null;
  createdAt: string;
  addebiti?: AddebitoRiga[];
}

// Il modulo pubblico lo dice al cliente in parole: «IGIC 7 %» ecc.
export const IMPOSTA_LABEL: Record<Lingua, Record<string, string>> = {
  es: { igic7: "IGIC 7 %", igic_exenta: "sin IGIC (no sujeto / exento)", iva: "IVA 21 %" },
  it: { igic7: "IGIC 7 %", igic_exenta: "senza IGIC (non soggetto / esente)", iva: "IVA 21 %" },
  en: { igic7: "IGIC 7 %", igic_exenta: "no IGIC (not subject / exempt)", iva: "VAT 21 %" },
};

export const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
export const labelCls = "text-xs font-medium text-gray-600 block mb-1";

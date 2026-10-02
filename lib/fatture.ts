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
}

export type StatoFattura = "pagato" | "acconto" | "attesa" | "annullata";

export const totalePagato = (f: { acconti?: { importo: number }[] }) =>
  (f.acconti ?? []).reduce((s, a) => s + a.importo, 0);
export const residuo = (f: { importo: number; acconti?: { importo: number }[] }) =>
  Math.max(0, f.importo - totalePagato(f));
export const statoCalcolato = (f: {
  pagato: boolean;
  importo: number;
  annullata?: boolean;
  acconti?: { importo: number }[];
}): StatoFattura => {
  // Annullata: resta nel registro ma non è né incassata né da incassare
  if (f.annullata) return "annullata";
  if (f.pagato) return "pagato";
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

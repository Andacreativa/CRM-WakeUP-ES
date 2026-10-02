// Tipi e costanti dei contratti, comuni a lista, scheda e form.

export interface ClienteAnag {
  id: number;
  nome: string;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  partitaIva: string | null;
}

export interface Contratto {
  id: number;
  numero: string;
  preventivoId: number | null;
  preventivo: { id?: number; numero: string } | null;
  clienteId: number | null;
  cliente: ClienteAnag | null;
  nomeClienteFallback: string | null;
  rappresentanteLegale: string;
  dataDecorrenza: string;
  durataMesi: number;
  importoMensile: number;
  numeroRate: number;
  totaleContratto: number;
  status: string;
  oggetto: string;
  voci: string;
  lingua: string;
  note?: string | null;
  createdAt: string;
}

// La scheda completa (GET /api/contratti/[id])
export interface ContrattoDettaglio extends Contratto {
  richiesteFattura: {
    id: number;
    codice: string;
    mese: number;
    anno: number;
    totale: number;
    validazione: string;
    emessa: boolean;
    fatturaId: number | null;
    fattura: { id: number; numero: string | null; pagato: boolean } | null;
  }[];
  fatture: {
    id: number;
    numero: string | null;
    data: string | null;
    mese: number;
    anno: number;
    importo: number;
    pagato: boolean;
  }[];
}

export type TipoVoce = "mensile" | "una_tantum";
export interface VoceContratto {
  id: string;
  servizio: string;
  descrizione: string;
  tipo?: TipoVoce;
  quantita?: number;
  prezzoUnitario?: number;
}

export const STATI_CONTRATTO = ["bozza", "inviato", "firmato"] as const;
export const STATO_CONTRATTO_COLORI: Record<string, { bg: string; text: string }> = {
  bozza: { bg: "#9ca3af", text: "#ffffff" },
  inviato: { bg: "#fef3c7", text: "#b45309" }, // in attesa di firma: giallo tenue come gli altri "in attesa"
  firmato: { bg: "#22c55e", text: "#ffffff" },
};
export const statoContrattoLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const nomeClienteContratto = (c: {
  cliente: { nome: string } | null;
  nomeClienteFallback: string | null;
}) => c.cliente?.nome ?? c.nomeClienteFallback ?? "—";

// Cliente come lo vuole il testo del contratto, anche quando è solo un nome
export const clientePerContratto = (c: Contratto): ClienteAnag =>
  c.cliente ?? {
    id: 0,
    nome: c.nomeClienteFallback ?? "—",
    via: null,
    cap: null,
    citta: null,
    provincia: null,
    partitaIva: null,
  };

export const dataFineContratto = (c: { dataDecorrenza: string; durataMesi: number }) => {
  const d = new Date(c.dataDecorrenza);
  d.setMonth(d.getMonth() + c.durataMesi);
  return d;
};

export const uid = () => Math.random().toString(36).slice(2, 9);
export const nuovaVoce = (): VoceContratto => ({ id: uid(), servizio: "", descrizione: "" });

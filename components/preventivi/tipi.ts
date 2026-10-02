// Tipi e costanti dei preventivi, comuni a lista, scheda e form.

export interface Preventivo {
  id: number;
  numero: string;
  nomeCliente: string;
  emailCliente: string | null;
  aziendaCliente: string | null;
  azienda: string;
  oggetto: string;
  voci: string;
  iva: number;
  subtotale: number;
  totale: number;
  feeCommerciale: number;
  leadId?: number | null;
  status: string;
  note: string | null;
  condizioni: string | null;
  dataScadenza: string | null;
  lingua: string;
  createdAt: string;
}

// La scheda completa (GET /api/preventivi/[id])
export interface PreventivoDettaglio extends Preventivo {
  lead: {
    id: number;
    codice: string | null;
    nome: string;
    azienda: string | null;
    stato: string;
  } | null;
  contratti: {
    id: number;
    numero: string;
    status: string;
    totaleContratto: number;
    dataDecorrenza: string;
  }[];
}

export type Lingua = "it" | "es" | "en";
export type TipoVoce = "mensile" | "una_tantum";

export interface VocePreventivo {
  id: string;
  servizio: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  tipo: TipoVoce;
}

export const STATUS_OPTIONS = [
  { value: "attesa", label: "In Attesa", bg: "#f59e0b", text: "#ffffff", border: "#f59e0b" },
  { value: "accettato", label: "Accettato", bg: "#22c55e", text: "#ffffff", border: "#22c55e" },
  { value: "rifiutato", label: "Rifiutato", bg: "#ef4444", text: "#ffffff", border: "#ef4444" },
];

export const statusStyle = (s: string) =>
  STATUS_OPTIONS.find((o) => o.value === s) ?? STATUS_OPTIONS[0];

// Stato = pill piena (design system): verde, rosso, oppure giallo tenue
export const pillPreventivo = (s: string) =>
  s === "accettato" ? "pill-ok" : s === "rifiutato" ? "pill-late" : "pill-wait";

// Ciclo del click sullo stato: attesa → accettato → rifiutato → attesa
export const prossimoStato = (s: string) =>
  s === "attesa" ? "accettato" : s === "accettato" ? "rifiutato" : "attesa";

export const linguaDi = (p: { lingua: string }): Lingua =>
  p.lingua === "es" ? "es" : p.lingua === "en" ? "en" : "it";

export const isPreventivoScaduto = (p: Preventivo) =>
  p.status !== "accettato" && !!p.dataScadenza && new Date(p.dataScadenza) < new Date();

export const DEFAULT_CONDIZIONI = `Saldo fattura entro 30 giorni dalla data di emissione.
Inclusa 1 revisione per asset prodotto.
Revisioni aggiuntive a € 80/ora.
Validità offerta: 30 giorni dalla data di emissione.
Lingua contratto: Italiano.`;

export const nuovaVoce = (): VocePreventivo => ({
  id: Math.random().toString(36).slice(2),
  servizio: "",
  descrizione: "",
  quantita: 1,
  prezzoUnitario: 0,
  tipo: "mensile",
});

export function parseVociPreventivo(json: string): VocePreventivo[] {
  try {
    const arr = JSON.parse(json) as Partial<VocePreventivo>[];
    return (Array.isArray(arr) ? arr : []).map((v) => ({
      id: Math.random().toString(36).slice(2),
      servizio: v.servizio ?? "",
      descrizione: v.descrizione ?? "",
      quantita: Number(v.quantita) || 1,
      prezzoUnitario: Number(v.prezzoUnitario) || 0,
      tipo: v.tipo === "una_tantum" ? "una_tantum" : "mensile",
    }));
  } catch {
    return [];
  }
}

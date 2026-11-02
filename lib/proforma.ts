// Tipi e calcoli comuni a lista, scheda e API delle proforma. Una proforma
// non è una fattura: niente incassi, niente VeriFactu, fuori dal fatturato.
// Gli importi si leggono come quelli della fattura (lib/fatture.ts), così il
// totale della proforma e quello della fattura che ne nasce coincidono.

import { leggiVoci, totaleVoci, type ClienteFattura } from "./fatture";
import { CAUSE_IGIC } from "./impostazioni";

export type StatoProforma = "aperta" | "convertita" | "annullata";

export interface Proforma {
  id: number;
  numero: string;
  data: string;
  validaFino: string | null;
  clienteId: number | null;
  cliente: ClienteFattura | null;
  mese: number;
  anno: number;
  descrizione: string | null;
  voci: string; // JSON, vedi leggiVoci
  importo: number; // imponibile
  tipoIva: string;
  iva: number;
  causaIgic: string | null;
  commercialeId: number | null;
  note: string | null;
  stato: StatoProforma;
  annullataIl: string | null;
  convertitaIl: string | null;
  fatturaId: number | null;
  fattura: { id: number; numero: string | null; stato: string } | null;
  inviata: boolean;
  dataInvio: string | null;
  createdAt: string;
}
export interface ProformaDettaglio extends Proforma {
  commercialeRef: {
    id: number;
    nome: string;
    cognome: string | null;
    email: string | null;
  } | null;
}

// Aperta e oltre la validità: si mostra «Scaduta», ma resta aperta (si può
// ancora convertire o annullare)
export const scadutaProforma = (
  p: { stato: string; validaFino: string | null },
  oggi = new Date(),
) => p.stato === "aperta" && !!p.validaFino && new Date(p.validaFino) < new Date(oggi.toDateString());

export const nomeFileProforma = (p: { numero: string }) =>
  `proforma_${p.numero.replace(/[^\w.-]+/g, "_")}.pdf`;

// ── Dati dal modulo (POST e PATCH dell'API) ───────────────────────────────
// Le stesse regole della fattura: righe con prezzo, IGIC 0 % o 7 %, a 0 % la
// causa (serve quando la proforma diventa fattura e va a VeriFactu).
const giornoUTC = (s: unknown): Date | null => {
  const t = String(s ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T00:00:00.000Z`) : null;
};

export function leggiDatiProforma(body: Record<string, unknown>) {
  const errori: string[] = [];
  const data = giornoUTC(body.data) ?? giornoUTC(new Date().toISOString())!;
  const validaFino = giornoUTC(body.validaFino);
  if (validaFino && validaFino < data) errori.push("La validità non può finire prima della data della proforma.");
  const clienteId = parseInt(String(body.clienteId ?? ""), 10) || null;
  if (!clienteId) errori.push("Scegli il cliente.");
  const voci = leggiVoci(body.voci);
  const importo = totaleVoci(voci);
  if (!voci.length || importo <= 0) errori.push("Scrivi almeno una riga con il suo prezzo.");
  const mese = parseInt(String(body.mese ?? ""), 10);
  const tipoIva = body.tipoIva === "igic7" ? "igic7" : "igic_exenta";
  const iva = tipoIva === "igic7" ? 7 : 0;
  const causa = String(body.causaIgic ?? "");
  const testo = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
  return {
    errori,
    dati: {
      data,
      validaFino,
      clienteId,
      mese: mese >= 1 && mese <= 12 ? mese : data.getUTCMonth() + 1,
      anno: data.getUTCFullYear(),
      descrizione: testo(body.descrizione, 500),
      voci: JSON.stringify(voci),
      importo,
      tipoIva,
      iva,
      causaIgic: iva === 0 && CAUSE_IGIC.includes(causa) ? causa : null,
      commercialeId: parseInt(String(body.commercialeId ?? ""), 10) || null,
      note: testo(body.note, 1000),
    },
  };
}

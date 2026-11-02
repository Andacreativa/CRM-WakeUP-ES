import { fmt } from "./constants";
import { compilaTesto, togliInciso, type ImpostazioniFatture } from "./impostazioni";
import { linkGmail } from "./utils";
import { lordo } from "./fatture";
import { nomeFileProforma, type ProformaDettaglio } from "./proforma";
import { corpoMessaggio, creaFatturaPDF, datiBonifico, type DatiPdf, type LogoPdf } from "./fattura-pdf";

// PDF ed email della proforma: lo stesso foglio e lo stesso messaggio della
// fattura (lib/fattura-pdf.ts), con titolo, numero e dicitura suoi. Niente QR:
// la proforma non va a VeriFactu.

type ProformaPdf = Pick<
  ProformaDettaglio,
  | "numero" | "data" | "validaFino" | "cliente" | "mese" | "anno" | "importo" | "tipoIva" | "iva"
  | "causaIgic" | "descrizione" | "voci"
>;

// La proforma nella forma che il PDF della fattura sa disegnare
const comeFattura = (p: ProformaPdf): DatiPdf => ({
  numero: p.numero,
  data: p.data,
  scadenza: p.validaFino,
  cliente: p.cliente,
  mese: p.mese,
  anno: p.anno,
  importo: p.importo,
  tipoIva: p.tipoIva,
  iva: p.iva,
  causaIgic: p.causaIgic,
  descrizione: p.descrizione,
  voci: p.voci,
  stato: "emessa",
  vfQr: null,
  tipoFattura: "F1",
  tipoRettifica: null,
});

export const creaProformaPDF = (p: ProformaPdf, cfg: ImpostazioniFatture, opts: { logo?: LogoPdf | null } = {}) =>
  creaFatturaPDF(comeFattura(p), cfg, { ...opts, proforma: true });

// Testi in Impostazioni › Email di invio proforma. Spagnolo per i clienti
// spagnoli, italiano per gli altri, come la fattura. {validita} è la data
// fino a cui vale; se manca, l'inciso fra virgole che la contiene sparisce.
export function messaggioProforma(
  p: {
    numero: string;
    data: string | Date;
    validaFino: string | Date | null;
    importo: number;
    tipoIva: string;
    iva: number;
    cliente: { nome: string; paese: string; email?: string | null } | null;
  },
  cfg: ImpostazioniFatture,
): { a: string; oggetto: string; testo: string; html: string } | null {
  if (!p.cliente?.email) return null;
  const es = (p.cliente.paese ?? "").toLowerCase() === "spagna";
  const loc = es ? "es-ES" : "it-IT";
  const giorno = (d: string | Date) => new Date(d).toLocaleDateString(loc, { timeZone: "UTC" });
  const v = {
    cliente: p.cliente.nome,
    numero: p.numero,
    data: giorno(p.data),
    importo: fmt(lordo(p)),
    validita: p.validaFino ? giorno(p.validaFino) : "",
    iban: cfg.iban,
    azienda: cfg.ragioneSociale,
  };
  let oggetto = es ? cfg.proformaOggettoEs : cfg.proformaOggettoIt;
  let testo = es ? cfg.proformaTestoEs : cfg.proformaTestoIt;
  if (!p.validaFino) {
    oggetto = togliInciso(oggetto, "{validita}");
    testo = togliInciso(testo, "{validita}");
  }
  return {
    a: p.cliente.email,
    oggetto: compilaTesto(oggetto, v),
    ...corpoMessaggio(
      testo,
      v,
      {
        importo: [es ? "Importe" : "Importo", v.importo],
        scadenza: v.validita ? [es ? "Válida hasta" : "Valida fino al", v.validita] : null,
        bonifico: datiBonifico(cfg, v.numero, es, "Proforma"),
      },
      cfg,
    ),
  };
}

// ── Azioni pronte per i bottoni (lista e scheda) ─────────────────────────
async function caricaProformaECfg(id: number): Promise<[ProformaDettaglio, ImpostazioniFatture]> {
  const [p, cfg] = await Promise.all([
    fetch(`/api/proforma/${id}`).then((r) => {
      if (!r.ok) throw new Error("Proforma non trovata");
      return r.json();
    }),
    fetch("/api/impostazioni/fatture").then((r) => r.json()),
  ]);
  return [p, cfg];
}

export async function scaricaProformaPDF(p: ProformaDettaglio, cfg: ImpostazioniFatture) {
  (await creaProformaPDF(p, cfg)).save(nomeFileProforma(p));
}

// Manda la proforma al cliente e la segna come inviata; restituisce la data
// d'invio (null se non parte). Con la casella aziendale collegata parte da lì
// con il PDF allegato; altrimenti si scarica il PDF e si apre Gmail.
export async function inviaProformaMail(id: number): Promise<string | null> {
  const [[p, cfg], posta] = await Promise.all([
    caricaProformaECfg(id),
    fetch("/api/mail")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{ configurata: boolean; mittente: string | null } | null>,
  ]);
  const msg = messaggioProforma(p, cfg);
  if (!msg) return null;

  if (posta?.configurata) {
    if (!confirm(`Inviare la proforma ${p.numero} a ${msg.a}?\n\nParte da ${posta.mittente} con il PDF allegato.`))
      return null;
    const doc = await creaProformaPDF(p, cfg);
    const pdf = doc.output("datauristring").split("base64,")[1] ?? "";
    const res = await fetch(`/api/proforma/${id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Invio non riuscito");
    return String(j.dataInvio);
  }

  if (
    !confirm(
      `Inviare la proforma ${p.numero} a ${msg.a}?\n\nSi scarica il PDF da allegare e si apre Gmail con il messaggio pronto.`,
    )
  )
    return null;
  await scaricaProformaPDF(p, cfg);
  window.open(linkGmail(msg.a, msg.oggetto, msg.testo), "_blank");
  const dataInvio = new Date().toISOString();
  await fetch(`/api/proforma/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviata: true, dataInvio }),
  });
  return dataInvio;
}

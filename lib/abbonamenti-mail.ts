import { prisma } from "@/lib/prisma";
import { inviaMail, mailConfigurata } from "@/lib/mail";
import { compilaTesto } from "@/lib/impostazioni";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { indirizzoRiga, pdfContrattoMandato } from "@/lib/mandato-pdf";
import { logoServer, pdfFatturaServer } from "@/lib/pdf-server";
import { messaggioFattura } from "@/lib/fattura-pdf";
import { fmt } from "@/lib/constants";
import { dataTesto, euroTesto, type AbbonamentoConRelazioni, type RichiestaPreventivo } from "@/lib/abbonamenti";
import { CAMBIO_CONTO_TESTI, DISDETTA_TESTI, LOCALE, MESI_L } from "@/lib/abbonamenti-testi";
import { DURATA_LINK_ACCESSO, linkArea } from "@/lib/area-token";
import { formattaIban, mascheraIban } from "@/lib/sepa";
import type { Modifica } from "@/lib/abbonamenti-area";
import { linguaValida, nomeProdotto, type Lingua } from "@/components/abbonamenti/tipi";

// Email degli abbonamenti: conferma della firma (contratto + mandato in
// PDF), link di firma, avviso all'agenzia, fattura della quota. Gli invii
// non bloccano mai l'operazione principale: l'esito torna a chi chiama.

export interface EsitoInvio {
  inviata: boolean;
  a: string | null;
  errore?: string;
}

const esito = async (a: string | null, fn: () => Promise<void>): Promise<EsitoInvio> => {
  if (!a) return { inviata: false, a: null, errore: "destinatario mancante" };
  if (!mailConfigurata()) return { inviata: false, a, errore: "posta non configurata" };
  try {
    await fn();
    return { inviata: true, a };
  } catch (e) {
    return { inviata: false, a, errore: e instanceof Error ? e.message : String(e) };
  }
};

export async function pdfMandato(a: AbbonamentoConRelazioni): Promise<{ buffer: Buffer; nomeFile: string }> {
  const [cfg, , cred] = await getCreditore(prisma);
  const buffer = await pdfContrattoMandato(a, cred, cfg.giornoAddebito, await logoServer(a.prodotto));
  return { buffer, nomeFile: `contrato_mandato_${a.codice}.pdf` };
}

type AbbonamentoMin = { intestatario: string; prodotto: string; pianoNome: string; totale: number; mandatoRef: string; codice: string; lingua: string };
const suffissoLingua = (lingua: Lingua): "Es" | "It" | "En" => (lingua === "it" ? "It" : lingua === "en" ? "En" : "Es");

const segnaposto = (a: AbbonamentoMin, azienda: string, extra: Record<string, string> = {}) => {
  const lingua = linguaValida(a.lingua);
  return {
    nombre: a.intestatario,
    producto: nomeProdotto(a.prodotto),
    plan: a.pianoNome,
    importe: `${euroTesto(a.totale, lingua)} €`,
    ref: a.mandatoRef,
    codigo: a.codice,
    azienda,
    ...extra,
  };
};

// Al cliente dopo la firma, con il PDF; all'agenzia l'avviso.
export async function inviaConfermaFirma(a: AbbonamentoConRelazioni, base: string) {
  const [cfg, , cred] = await getCreditore(prisma);
  const lingua = linguaValida(a.lingua);
  const oggetto = lingua === "it" ? cfg.confermaOggettoIt : lingua === "en" ? cfg.confermaOggettoEn : cfg.confermaOggettoEs;
  const testo = lingua === "it" ? cfg.confermaTestoIt : lingua === "en" ? cfg.confermaTestoEn : cfg.confermaTestoEs;
  const v = segnaposto(a, cred.nome);
  const cliente = await esito(a.email, async () => {
    const pdf = await pdfMandato(a);
    await inviaMail({
      a: a.email,
      oggetto: compilaTesto(oggetto, v),
      testo: compilaTesto(testo, v),
      nomeMittente: cred.nome,
      allegati: [{ filename: pdf.nomeFile, content: pdf.buffer, contentType: "application/pdf" }],
    });
  });
  const agenzia = await esito(cfg.notificaEmail.trim() || null, async () => {
    await inviaMail({
      a: cfg.notificaEmail.trim(),
      oggetto: `Nuovo abbonamento ${nomeProdotto(a.prodotto)} ${a.pianoNome} — ${a.intestatario}`,
      testo:
        `${a.intestatario} ha firmato l'abbonamento ${a.codice} (${nomeProdotto(a.prodotto)}, piano ${a.pianoNome}): ${fmt(a.totale)} al mese.\n` +
        `Mandato ${a.mandatoRef}, firmato il ${a.mandatoFirmatoIl?.toLocaleString("it-IT", { timeZone: "Europe/Madrid" }) ?? "—"}${a.mandatoIp ? ` da ${a.mandatoIp}` : ""}.\n` +
        `Email ${a.email}${a.telefono ? `, tel. ${a.telefono}` : ""}.\n\n` +
        `Scheda: ${base}/sales/abbonamenti/${a.id}\n`,
      nomeMittente: "Anda Finance",
    });
  });
  return { cliente, agenzia };
}

// Richiesta di preventivo dal modulo pubblico (piano Pro): solo all'agenzia,
// con il «rispondi» sull'email del cliente. Nel gestionale non resta nulla.
export async function inviaRichiestaPreventivo(r: RichiestaPreventivo & { prodotto: string; pianoNome: string }): Promise<EsitoInvio> {
  const [cfg] = await getCreditore(prisma);
  const prodotto = nomeProdotto(r.prodotto);
  return esito(cfg.notificaEmail.trim() || null, async () => {
    await inviaMail({
      a: cfg.notificaEmail.trim(),
      oggetto: `Richiesta preventivo ${prodotto} ${r.pianoNome} — ${r.intestatario.replace(/\s+/g, " ")}`,
      testo:
        `${r.intestatario} chiede un preventivo per ${prodotto}, piano ${r.pianoNome}.\n\n` +
        `Messaggio:\n${r.messaggio}\n\n` +
        `Email: ${r.email}\n` +
        `Telefono: ${r.telefono ?? "—"}\n` +
        `NIF: ${r.nif ?? "—"}\n` +
        `Indirizzo: ${indirizzoRiga(r) || "—"}\n` +
        `Lingua del modulo: ${r.lingua}\n\n` +
        `Per rispondere usa «Rispondi»: va a ${r.email}.\n`,
      nomeMittente: "Anda Finance",
      rispondiA: r.email,
    });
  });
}

// Link di firma per l'abbonamento creato da Sales
export async function inviaLinkFirma(a: AbbonamentoConRelazioni, base: string) {
  const [cfg, , cred] = await getCreditore(prisma);
  const lingua = linguaValida(a.lingua);
  const oggetto = lingua === "it" ? cfg.linkOggettoIt : lingua === "en" ? cfg.linkOggettoEn : cfg.linkOggettoEs;
  const testo = lingua === "it" ? cfg.linkTestoIt : lingua === "en" ? cfg.linkTestoEn : cfg.linkTestoEs;
  const link = a.tokenFirma ? `${base}/suscripcion/firma/${a.tokenFirma}` : "";
  const v = segnaposto(a, cred.nome, { link });
  return esito(a.email, async () => {
    if (!link) throw new Error("manca il link di firma");
    await inviaMail({
      a: a.email,
      oggetto: compilaTesto(oggetto, v),
      testo: compilaTesto(testo, v),
      nomeMittente: cred.nome,
    });
  });
}

// Fattura della quota al cliente, PDF fatto sul server; la segna inviata.
export async function inviaFatturaServer(fatturaId: number): Promise<EsitoInvio> {
  const pdf = await pdfFatturaServer(prisma, fatturaId);
  if (!pdf) return { inviata: false, a: null, errore: "fattura non trovata" };
  const [, fatt] = await getCreditore(prisma);
  const msg = messaggioFattura(pdf.fattura, fatt);
  const out = await esito(msg?.a ?? null, async () => {
    if (!msg) throw new Error("il cliente non ha un'email");
    await inviaMail({
      a: msg.a,
      oggetto: msg.oggetto,
      testo: msg.testo,
      html: msg.html,
      nomeMittente: fatt.ragioneSociale,
      allegati: [{ filename: pdf.nomeFile, content: pdf.buffer, contentType: "application/pdf" }],
    });
  });
  if (out.inviata) {
    await prisma.fattura.update({ where: { id: fatturaId }, data: { inviata: true, dataInvio: new Date() } });
  }
  return out;
}

// Fattura della quota di un abbonamento: all'email dell'abbonamento, nella
// sua lingua, con la data dell'addebito e il link all'area cliente (7
// giorni). Una fattura che non viene da un addebito prende il testo generico.
export async function inviaFatturaAbbonamento(fatturaId: number, base: string): Promise<EsitoInvio> {
  const ad = await prisma.addebitoSepa.findUnique({
    where: { fatturaId },
    include: { abbonamento: true, remessa: { select: { dataAddebito: true } } },
  });
  if (!ad) return inviaFatturaServer(fatturaId);
  const pdf = await pdfFatturaServer(prisma, fatturaId);
  if (!pdf) return { inviata: false, a: null, errore: "fattura non trovata" };
  const [cfg, , cred] = await getCreditore(prisma);
  const a = ad.abbonamento;
  const lingua = linguaValida(a.lingua);
  const L = suffissoLingua(lingua);
  const out = await esito(a.email, async () => {
    const link = await linkArea(base, a.email, lingua);
    const v = segnaposto(a, cred.nome, {
      numero: pdf.fattura.numero ?? "",
      fecha: pdf.fattura.data ? dataTesto(new Date(pdf.fattura.data), lingua) : "",
      importe: `${euroTesto(ad.importo, lingua)} €`,
      fecha_cargo: ad.remessa ? dataTesto(ad.remessa.dataAddebito, lingua) : "",
      iban: mascheraIban(a.iban),
      mes: `${MESI_L[lingua][ad.mese - 1]} ${ad.anno}`,
      link,
    });
    await inviaMail({
      a: a.email,
      oggetto: compilaTesto(cfg[`fatturaOggetto${L}`], v),
      testo: compilaTesto(cfg[`fatturaTesto${L}`], v),
      nomeMittente: cred.nome,
      allegati: [{ filename: pdf.nomeFile, content: pdf.buffer, contentType: "application/pdf" }],
    });
  });
  if (out.inviata) {
    await prisma.fattura.update({ where: { id: fatturaId }, data: { inviata: true, dataInvio: new Date() } });
  }
  return out;
}

export async function inviaFattureRemessa(ids: number[], base: string) {
  const out: { fatturaId: number; esito: EsitoInvio }[] = [];
  for (const id of ids) out.push({ fatturaId: id, esito: await inviaFatturaAbbonamento(id, base) });
  return out;
}

// Link di accesso all'area cliente chiesto dal modulo (60 minuti)
export async function inviaLinkAccessoArea(email: string, lingua: Lingua, base: string): Promise<EsitoInvio> {
  const [cfg, , cred] = await getCreditore(prisma);
  const L = suffissoLingua(lingua);
  return esito(email, async () => {
    const v = { link: await linkArea(base, email, lingua, DURATA_LINK_ACCESSO), azienda: cred.nome };
    await inviaMail({
      a: email,
      oggetto: compilaTesto(cfg[`areaOggetto${L}`], v),
      testo: compilaTesto(cfg[`areaTesto${L}`], v),
      nomeMittente: cred.nome,
    });
  });
}

// Dopo il cambio di conto dall'area: al cliente il PDF con il nuovo
// mandato, all'agenzia l'avviso con i due conti.
export async function inviaConfermaCambioConto(a: AbbonamentoConRelazioni, base: string, precedente: { mandatoRef: string; iban: string }) {
  const [cfg, , cred] = await getCreditore(prisma);
  const lingua = linguaValida(a.lingua);
  const t = CAMBIO_CONTO_TESTI[lingua];
  const v = segnaposto(a, cred.nome, { iban: mascheraIban(a.iban), refPrecedente: precedente.mandatoRef });
  const cliente = await esito(a.email, async () => {
    const pdf = await pdfMandato(a);
    await inviaMail({
      a: a.email,
      oggetto: compilaTesto(t.oggetto, v),
      testo: compilaTesto(t.testo, v),
      nomeMittente: cred.nome,
      allegati: [{ filename: pdf.nomeFile, content: pdf.buffer, contentType: "application/pdf" }],
    });
  });
  const agenzia = await esito(cfg.notificaEmail.trim() || null, async () => {
    await inviaMail({
      a: cfg.notificaEmail.trim(),
      oggetto: `Cambio conto ${nomeProdotto(a.prodotto)} — ${a.intestatario} (${a.codice})`,
      testo:
        `${a.intestatario} ha cambiato il conto dell'abbonamento ${a.codice} dall'area cliente.\n` +
        `Nuovo mandato ${a.mandatoRef}: ${formattaIban(a.iban)} (${a.titolareConto}), firmato il ${a.mandatoFirmatoIl?.toLocaleString("it-IT", { timeZone: "Europe/Madrid" }) ?? "—"}${a.mandatoIp ? ` da ${a.mandatoIp}` : ""}.\n` +
        `Mandato precedente ${precedente.mandatoRef}: ${mascheraIban(precedente.iban)}.\n` +
        `Gli addebiti già in remessa passano ancora sul conto precedente.\n\n` +
        `Scheda: ${base}/sales/abbonamenti/${a.id}\n`,
      nomeMittente: "Anda Finance",
    });
  });
  return { cliente, agenzia };
}

// Il cliente ha cambiato i dati di contatto dall'area: avviso all'agenzia
export async function inviaAvvisoDatiArea(a: AbbonamentoConRelazioni, modifiche: Modifica[], base: string): Promise<EsitoInvio> {
  const [cfg] = await getCreditore(prisma);
  return esito(cfg.notificaEmail.trim() || null, async () => {
    await inviaMail({
      a: cfg.notificaEmail.trim(),
      oggetto: `Dati aggiornati ${nomeProdotto(a.prodotto)} — ${a.intestatario} (${a.codice})`,
      testo:
        `${a.intestatario} ha aggiornato i dati dell'abbonamento ${a.codice} dall'area cliente:\n` +
        modifiche.map((m) => `- ${m.campo}: ${m.prima || "—"} → ${m.dopo || "—"}`).join("\n") +
        `\n\nSe cambia la sede può cambiare l'imposta delle prossime fatture: controlla la scheda.\n${base}/sales/abbonamenti/${a.id}\n`,
      nomeMittente: "Anda Finance",
    });
  });
}

// Dopo la disdetta dall'area: conferma al cliente con le date, avviso all'agenzia
export async function inviaConfermaDisdetta(a: AbbonamentoConRelazioni, base: string) {
  const [cfg, , cred] = await getCreditore(prisma);
  const lingua = linguaValida(a.lingua);
  const t = DISDETTA_TESTI[lingua];
  const fine = a.dataFine ?? new Date();
  const meseDopo = new Date(Date.UTC(fine.getUTCFullYear(), fine.getUTCMonth() + 1, 1));
  const v = segnaposto(a, cred.nome, {
    fecha_fin: dataTesto(fine, lingua),
    mes_siguiente: meseDopo.toLocaleDateString(LOCALE[lingua], { month: "long", year: "numeric", timeZone: "UTC" }),
    email: cred.email,
  });
  const cliente = await esito(a.email, async () => {
    await inviaMail({ a: a.email, oggetto: compilaTesto(t.oggetto, v), testo: compilaTesto(t.testo, v), nomeMittente: cred.nome });
  });
  const agenzia = await esito(cfg.notificaEmail.trim() || null, async () => {
    await inviaMail({
      a: cfg.notificaEmail.trim(),
      oggetto: `Disdetta ${nomeProdotto(a.prodotto)} — ${a.intestatario} (${a.codice})`,
      testo:
        `${a.intestatario} ha disdetto l'abbonamento ${a.codice} (${nomeProdotto(a.prodotto)}, piano ${a.pianoNome}) dall'area cliente.\n` +
        `Vale fino al ${fine.toLocaleDateString("it-IT", { timeZone: "UTC" })}: niente addebiti né fatture dal mese dopo. Riattivabile da Sales.\n\n` +
        `Scheda: ${base}/sales/abbonamenti/${a.id}\n`,
      nomeMittente: "Anda Finance",
    });
  });
  return { cliente, agenzia };
}

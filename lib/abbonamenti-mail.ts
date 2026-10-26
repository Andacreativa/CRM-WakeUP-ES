import { prisma } from "@/lib/prisma";
import { inviaMail, mailConfigurata } from "@/lib/mail";
import { compilaTesto } from "@/lib/impostazioni";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { pdfContrattoMandato } from "@/lib/mandato-pdf";
import { logoServer, pdfFatturaServer } from "@/lib/pdf-server";
import { messaggioFattura } from "@/lib/fattura-pdf";
import { fmt } from "@/lib/constants";
import { euroTesto, type AbbonamentoConRelazioni } from "@/lib/abbonamenti";
import { linguaValida, nomeProdotto } from "@/components/abbonamenti/tipi";

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
  const buffer = await pdfContrattoMandato(a, cred, cfg.giornoAddebito, await logoServer());
  return { buffer, nomeFile: `contrato_mandato_${a.codice}.pdf` };
}

const segnaposto = (a: AbbonamentoConRelazioni, azienda: string, extra: Record<string, string> = {}) => {
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
      nomeMittente: fatt.ragioneSociale,
      allegati: [{ filename: pdf.nomeFile, content: pdf.buffer, contentType: "application/pdf" }],
    });
  });
  if (out.inviata) {
    await prisma.fattura.update({ where: { id: fatturaId }, data: { inviata: true, dataInvio: new Date() } });
  }
  return out;
}

export async function inviaFattureRemessa(ids: number[]) {
  const out: { fatturaId: number; esito: EsitoInvio }[] = [];
  for (const id of ids) out.push({ fatturaId: id, esito: await inviaFatturaServer(id) });
  return out;
}

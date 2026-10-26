import type { Prisma, PrismaClient } from "@prisma/client";
import { getImpostazioniFatture, type ImpostazioniFatture } from "@/lib/impostazioni";
import { AREA_LINK_DEFAULT, CONFERMA_DEFAULT, CONTRATTO_DEFAULT, FATTURA_DEFAULT, LINK_DEFAULT } from "@/lib/abbonamenti-testi";
import { identificadorAcreedor, versionePainValida, type VersionePain } from "@/lib/sepa";

type Db = PrismaClient | Prisma.TransactionClient;

// Impostazioni degli abbonamenti e degli addebiti SEPA, salvate come JSON
// nella tabella Impostazione con chiave "abbonamenti" (come "fatture").
// I campi vuoti del creditore si prendono dalle impostazioni fatture.
export interface ImpostazioniAbbonamenti {
  creditorId: string; // identificador de acreedor; vuoto = calcolato dal NIF
  creditorNome: string; // vuoto = ragione sociale
  creditorIban: string; // vuoto = IBAN delle fatture
  creditorBic: string;
  giornoAddebito: number; // giorno del mese dell'addebito
  versione: VersionePain;
  batchBooking: boolean; // una sola entrata in banca per remessa
  fatturaAutomatica: boolean; // la remessa crea le fatture
  emailFattura: boolean; // ... e le manda per email all'email dell'abbonamento, con il link all'area
  notificaEmail: string; // avviso di ogni nuova firma
  luogoFirma: string; // luogo stampato sul mandato
  inizioMeseSuccessivo: boolean; // primo addebito il mese dopo la firma
  conceptoAddebito: string; // segnaposto: {azienda} {prodotto} {piano} {mese} {anno} {codice}
  contrattoEs: string;
  contrattoIt: string;
  contrattoEn: string;
  confermaOggettoEs: string;
  confermaTestoEs: string;
  confermaOggettoIt: string;
  confermaTestoIt: string;
  confermaOggettoEn: string;
  confermaTestoEn: string;
  linkOggettoEs: string;
  linkTestoEs: string;
  linkOggettoIt: string;
  linkTestoIt: string;
  linkOggettoEn: string;
  linkTestoEn: string;
  // Fattura della quota (all'email dell'abbonamento, con il link all'area)
  fatturaOggettoEs: string;
  fatturaTestoEs: string;
  fatturaOggettoIt: string;
  fatturaTestoIt: string;
  fatturaOggettoEn: string;
  fatturaTestoEn: string;
  // Link di accesso all'area cliente chiesto dal modulo
  areaOggettoEs: string;
  areaTestoEs: string;
  areaOggettoIt: string;
  areaTestoIt: string;
  areaOggettoEn: string;
  areaTestoEn: string;
}

export const IMPOSTAZIONI_ABBONAMENTI_DEFAULT: ImpostazioniAbbonamenti = {
  creditorId: "",
  creditorNome: "",
  creditorIban: "",
  creditorBic: "BBVAESMMXXX",
  giornoAddebito: 5,
  versione: "pain.008.001.08",
  batchBooking: true,
  fatturaAutomatica: true,
  emailFattura: true,
  notificaEmail: "info@andacreativa.com",
  luogoFirma: "Puerto de Santiago",
  inizioMeseSuccessivo: true,
  conceptoAddebito: "{prodotto} {piano} {mese} {anno}",
  contrattoEs: CONTRATTO_DEFAULT.es,
  contrattoIt: CONTRATTO_DEFAULT.it,
  contrattoEn: CONTRATTO_DEFAULT.en,
  confermaOggettoEs: CONFERMA_DEFAULT.es.oggetto,
  confermaTestoEs: CONFERMA_DEFAULT.es.testo,
  confermaOggettoIt: CONFERMA_DEFAULT.it.oggetto,
  confermaTestoIt: CONFERMA_DEFAULT.it.testo,
  confermaOggettoEn: CONFERMA_DEFAULT.en.oggetto,
  confermaTestoEn: CONFERMA_DEFAULT.en.testo,
  linkOggettoEs: LINK_DEFAULT.es.oggetto,
  linkTestoEs: LINK_DEFAULT.es.testo,
  linkOggettoIt: LINK_DEFAULT.it.oggetto,
  linkTestoIt: LINK_DEFAULT.it.testo,
  linkOggettoEn: LINK_DEFAULT.en.oggetto,
  linkTestoEn: LINK_DEFAULT.en.testo,
  fatturaOggettoEs: FATTURA_DEFAULT.es.oggetto,
  fatturaTestoEs: FATTURA_DEFAULT.es.testo,
  fatturaOggettoIt: FATTURA_DEFAULT.it.oggetto,
  fatturaTestoIt: FATTURA_DEFAULT.it.testo,
  fatturaOggettoEn: FATTURA_DEFAULT.en.oggetto,
  fatturaTestoEn: FATTURA_DEFAULT.en.testo,
  areaOggettoEs: AREA_LINK_DEFAULT.es.oggetto,
  areaTestoEs: AREA_LINK_DEFAULT.es.testo,
  areaOggettoIt: AREA_LINK_DEFAULT.it.oggetto,
  areaTestoIt: AREA_LINK_DEFAULT.it.testo,
  areaOggettoEn: AREA_LINK_DEFAULT.en.oggetto,
  areaTestoEn: AREA_LINK_DEFAULT.en.testo,
};

const CHIAVE = "abbonamenti";

export async function getImpostazioniAbbonamenti(db: Db): Promise<ImpostazioniAbbonamenti> {
  const row = await db.impostazione.findUnique({ where: { chiave: CHIAVE } });
  let saved: Partial<ImpostazioniAbbonamenti> = {};
  if (row) {
    try {
      saved = JSON.parse(row.valore) as Partial<ImpostazioniAbbonamenti>;
    } catch {
      saved = {};
    }
  }
  return { ...IMPOSTAZIONI_ABBONAMENTI_DEFAULT, ...saved };
}

export async function salvaImpostazioniAbbonamenti(
  db: Db,
  patch: Partial<ImpostazioniAbbonamenti>,
): Promise<ImpostazioniAbbonamenti> {
  const attuali = await getImpostazioniAbbonamenti(db);
  const next: ImpostazioniAbbonamenti = { ...attuali, ...sanifica(patch) };
  await db.impostazione.upsert({
    where: { chiave: CHIAVE },
    create: { chiave: CHIAVE, valore: JSON.stringify(next) },
    update: { valore: JSON.stringify(next) },
  });
  return next;
}

function sanifica(p: Partial<ImpostazioniAbbonamenti>): Partial<ImpostazioniAbbonamenti> {
  const out: Partial<ImpostazioniAbbonamenti> = {};
  for (const k of Object.keys(IMPOSTAZIONI_ABBONAMENTI_DEFAULT) as (keyof ImpostazioniAbbonamenti)[]) {
    if (p[k] === undefined) continue;
    const def = IMPOSTAZIONI_ABBONAMENTI_DEFAULT[k];
    if (typeof def === "number") {
      const n = Number(p[k]);
      (out as Record<string, unknown>)[k] = Number.isFinite(n) ? n : def;
    } else if (typeof def === "boolean") {
      (out as Record<string, unknown>)[k] = Boolean(p[k]);
    } else {
      (out as Record<string, unknown>)[k] = String(p[k] ?? "");
    }
  }
  if (out.giornoAddebito !== undefined) {
    out.giornoAddebito = Math.min(28, Math.max(1, Math.round(out.giornoAddebito)));
  }
  if (out.versione !== undefined) out.versione = versionePainValida(out.versione);
  if (out.creditorId !== undefined) out.creditorId = out.creditorId.toUpperCase().replace(/\s+/g, "");
  if (out.creditorIban !== undefined) out.creditorIban = out.creditorIban.toUpperCase().replace(/\s+/g, "");
  if (out.creditorBic !== undefined) out.creditorBic = out.creditorBic.toUpperCase().replace(/\s+/g, "");
  return out;
}

// Dati del creditore pronti per il fichero e per il mandato: i campi vuoti
// vengono dalle impostazioni fatture (ragione sociale, NIF, IBAN, sede).
export interface Creditore {
  nome: string;
  nif: string;
  identificador: string;
  iban: string;
  bic: string;
  via: string;
  cap: string;
  citta: string;
  provincia: string;
  paese: string;
  email: string;
}

export function risolviCreditore(abb: ImpostazioniAbbonamenti, fatt: ImpostazioniFatture): Creditore {
  return {
    nome: abb.creditorNome.trim() || fatt.ragioneSociale,
    nif: fatt.nif,
    identificador: abb.creditorId.trim() || identificadorAcreedor(fatt.nif),
    iban: abb.creditorIban.trim() || fatt.iban,
    bic: abb.creditorBic.trim() || fatt.bic,
    via: fatt.indirizzo,
    cap: fatt.cap,
    citta: fatt.citta,
    provincia: fatt.provincia,
    paese: fatt.paese,
    email: fatt.email,
  };
}

export async function getCreditore(db: Db): Promise<[ImpostazioniAbbonamenti, ImpostazioniFatture, Creditore]> {
  const [abb, fatt] = await Promise.all([getImpostazioniAbbonamenti(db), getImpostazioniFatture(db)]);
  return [abb, fatt, risolviCreditore(abb, fatt)];
}

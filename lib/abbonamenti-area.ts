import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ABBONAMENTO_INCLUDE,
  ErroreAbbonamento,
  dataAddebitoMese,
  mandatoRef as mandatoRefBase,
  primoDelMese,
  type AbbonamentoConRelazioni,
  type Db,
} from "@/lib/abbonamenti";
import { getCreditore, type ImpostazioniAbbonamenti } from "@/lib/abbonamenti-impostazioni";
import { bicValido, ibanValido, mascheraIban, pulisciBic, pulisciIban, testoSepa } from "@/lib/sepa";

// Area cliente (/suscripcion/area): quello che il cliente vede e può fare
// sui propri abbonamenti, riconosciuto dall'email del token (lib/area-token).
// Ogni lettura e ogni modifica filtra per email: niente dati di altri.

export const whereArea = (email: string): Prisma.AbbonamentoWhereInput => ({
  email: { equals: email.trim(), mode: "insensitive" },
  deletedAt: null,
  mandatoFirmatoIl: { not: null },
});

export async function abbonamentoArea(db: Db, id: number, email: string): Promise<AbbonamentoConRelazioni> {
  const a = await db.abbonamento.findFirst({ where: { id, ...whereArea(email) }, include: ABBONAMENTO_INCLUDE });
  if (!a) throw new ErroreAbbonamento("non_trovato", 404);
  return a;
}

// Prossima data di addebito: il mese in corso se non è ancora incassato
// (se è già in remessa, la data del fichero), altrimenti il mese dopo.
export function prossimoAddebito(
  a: {
    stato: string;
    dataInizio: Date | null;
    dataFine: Date | null;
    addebiti: { anno: number; mese: number; stato: string; remessa: { dataAddebito: Date } | null }[];
  },
  giorno: number,
  oggi = new Date(),
): Date | null {
  if (a.stato !== "attivo") return null;
  let anno = oggi.getUTCFullYear();
  let mese = oggi.getUTCMonth() + 1;
  for (let k = 0; k < 3; k++) {
    const primo = primoDelMese(anno, mese);
    if (a.dataFine && a.dataFine < primo) return null;
    const copre = !a.dataInizio || a.dataInizio <= primo;
    const ad = a.addebiti.find((x) => x.anno === anno && x.mese === mese);
    const chiuso = !!ad && (ad.stato === "incassato" || ad.stato === "devuelto" || ad.stato === "annullato");
    if (copre && !chiuso) {
      if (ad?.stato === "in_remessa" && ad.remessa) return ad.remessa.dataAddebito;
      return dataAddebitoMese(anno, mese, giorno, oggi);
    }
    mese++;
    if (mese > 12) {
      mese = 1;
      anno++;
    }
  }
  return null;
}

export type StatoFatturaArea = "pagata" | "pendiente" | "devuelta";

// La forma che esce verso il browser del cliente: IBAN mascherato, solo le
// fatture emesse (niente bozze né annullate), niente dati interni.
export function serializzaArea(a: AbbonamentoConRelazioni, cfg: ImpostazioniAbbonamenti, oggi = new Date()) {
  const fatture = a.addebiti
    .map((x) => {
      const f = x.fattura;
      if (!f || !x.fatturaId || f.stato !== "emessa" || f.annullata) return null;
      const stato: StatoFatturaArea = f.pagato ? "pagata" : x.stato === "devuelto" ? "devuelta" : "pendiente";
      return {
        id: x.fatturaId,
        numero: f.numero,
        data: f.data,
        anno: x.anno,
        mese: x.mese,
        importo: x.importo,
        stato,
        dataAddebito: x.remessa?.dataAddebito ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return {
    id: a.id,
    codice: a.codice,
    prodotto: a.prodotto,
    pianoNome: a.pianoNome,
    prezzo: a.prezzo,
    tipoIva: a.tipoIva,
    iva: a.iva,
    totale: a.totale,
    intestatario: a.intestatario,
    nif: a.nif,
    email: a.email,
    telefono: a.telefono,
    via: a.via,
    cap: a.cap,
    citta: a.citta,
    provincia: a.provincia,
    paese: a.paese,
    titolareConto: a.titolareConto,
    iban: mascheraIban(a.iban),
    bic: a.bic,
    mandatoRef: a.mandatoRef,
    mandatoFirmatoIl: a.mandatoFirmatoIl,
    lingua: a.lingua,
    stato: a.stato,
    dataInizio: a.dataInizio,
    dataFine: a.dataFine,
    prossimoAddebito: prossimoAddebito(a, cfg.giornoAddebito, oggi),
    fatture,
    mandatiPrecedenti: a.mandatiPrecedenti.map((m) => ({
      mandatoRef: m.mandatoRef,
      iban: mascheraIban(m.iban),
      firmatoIl: m.firmatoIl,
      sostituitoIl: m.sostituitoIl,
    })),
  };
}
export type AbbonamentoArea = ReturnType<typeof serializzaArea>;

export async function datiArea(db: Db, email: string, oggi = new Date()) {
  const [cfg, , cred] = await getCreditore(db);
  const lista = await db.abbonamento.findMany({ where: whereArea(email), include: ABBONAMENTO_INCLUDE, orderBy: { createdAt: "asc" } });
  return {
    email,
    giornoAddebito: cfg.giornoAddebito,
    creditore: {
      nome: cred.nome,
      nif: cred.nif,
      identificador: cred.identificador,
      email: cred.email,
      citta: cred.citta,
      indirizzo: [cred.via, [cred.cap, cred.citta].filter(Boolean).join(" "), cred.provincia].filter(Boolean).join(", "),
    },
    abbonamenti: lista.map((a) => serializzaArea(a, cfg, oggi)),
  };
}

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface Modifica {
  campo: "email" | "telefono" | "via" | "cap" | "citta" | "provincia";
  prima: string | null;
  dopo: string | null;
}

// Dati di contatto modificabili dal cliente: email, telefono, indirizzo.
// Nome, NIF e paese stanno sul contratto e si cambiano scrivendo
// all'agenzia. Il cliente CRM segue solo nei campi dove aveva lo stesso
// valore dell'abbonamento (non si sovrascrive un dato messo a mano).
export async function aggiornaDatiArea(db: Db, id: number, email: string, body: Record<string, unknown>) {
  const a = await abbonamentoArea(db, id, email);
  const nuovo = {
    email: str(body.email, 160).toLowerCase(),
    telefono: str(body.telefono, 40) || null,
    via: str(body.via, 140) || null,
    cap: str(body.cap, 16) || null,
    citta: str(body.citta, 80) || null,
    provincia: str(body.provincia, 80) || null,
  };
  if (!nuovo.email) throw new ErroreAbbonamento("email_obbligatoria");
  if (!EMAIL_RE.test(nuovo.email)) throw new ErroreAbbonamento("email_non_valida");
  const campi: Modifica["campo"][] = ["email", "telefono", "via", "cap", "citta", "provincia"];
  const modifiche: Modifica[] = campi
    .filter((k) => (a[k] ?? null) !== (nuovo[k] ?? null))
    .map((k) => ({ campo: k, prima: a[k] ?? null, dopo: nuovo[k] ?? null }));
  if (!modifiche.length) return { a, modifiche };
  const agg = await db.abbonamento.update({ where: { id: a.id }, data: nuovo, include: ABBONAMENTO_INCLUDE });
  if (a.clienteId) {
    const c = await db.cliente.findUnique({ where: { id: a.clienteId } });
    if (c) {
      const dataC: Record<string, string | null> = {};
      for (const m of modifiche) {
        const attuale = c[m.campo] ?? null;
        const uguale = m.campo === "email" ? (attuale ?? "").toLowerCase() === (m.prima ?? "").toLowerCase() : attuale === m.prima;
        if (uguale) dataC[m.campo] = m.dopo;
      }
      if (Object.keys(dataC).length) await db.cliente.update({ where: { id: c.id }, data: dataC });
    }
  }
  return { a: agg, modifiche };
}

// Cambio del conto = nuovo mandato SEPA: il vecchio finisce nel registro
// (MandatoSepaStorico) con i dati della sua firma, il nuovo prende un
// riferimento progressivo e la firma di adesso (data, IP, browser). Gli
// addebiti «previsti» non portano l'IBAN e seguono il nuovo conto; quelli
// già in remessa passano ancora sul vecchio.
export async function cambiaContoArea(
  id: number,
  email: string,
  body: Record<string, unknown>,
  firma: { ip: string | null; userAgent: string | null },
  oggi = new Date(),
) {
  if (body.accettoMandato !== true) throw new ErroreAbbonamento("consensi");
  const titolareConto = str(body.titolareConto, 140);
  const iban = pulisciIban(body.iban);
  const bic = pulisciBic(body.bic) || null;
  if (!titolareConto) throw new ErroreAbbonamento("titolare_obbligatorio");
  if (!iban) throw new ErroreAbbonamento("iban_obbligatorio");
  if (!ibanValido(iban)) throw new ErroreAbbonamento("iban_non_valido");
  if (bic && !bicValido(bic)) throw new ErroreAbbonamento("bic_non_valido");
  const [cfg, , cred] = await getCreditore(prisma);
  return prisma.$transaction(async (tx) => {
    const a = await abbonamentoArea(tx, id, email);
    if (a.stato === "cancellato") throw new ErroreAbbonamento("abbonamento_cancellato", 409);
    if (a.iban === iban && a.titolareConto === titolareConto && (a.bic ?? null) === bic) {
      throw new ErroreAbbonamento("stesso_conto", 409);
    }
    const base = mandatoRefBase(a.prodotto, a.codice);
    let n = a.mandatiPrecedenti.length + 2;
    let ref = testoSepa(`${base}-${n}`, 35);
    while (await tx.abbonamento.findUnique({ where: { mandatoRef: ref }, select: { id: true } })) {
      n++;
      ref = testoSepa(`${base}-${n}`, 35);
    }
    await tx.mandatoSepaStorico.create({
      data: {
        abbonamentoId: a.id,
        mandatoRef: a.mandatoRef,
        titolareConto: a.titolareConto,
        iban: a.iban,
        bic: a.bic,
        firmatoIl: a.mandatoFirmatoIl,
        luogo: a.mandatoLuogo,
        ip: a.mandatoIp,
        userAgent: a.mandatoUserAgent,
        sostituitoIl: oggi,
        sostituitoIp: firma.ip,
        motivo: "cambio conto dall'area cliente",
      },
    });
    const agg = await tx.abbonamento.update({
      where: { id: a.id },
      data: {
        titolareConto,
        iban,
        bic,
        mandatoRef: ref,
        mandatoFirmatoIl: oggi,
        mandatoLuogo: cfg.luogoFirma || cred.citta,
        mandatoIp: firma.ip,
        mandatoUserAgent: firma.userAgent?.slice(0, 300) ?? null,
      },
      include: ABBONAMENTO_INCLUDE,
    });
    if (a.clienteId) {
      const c = await tx.cliente.findUnique({ where: { id: a.clienteId }, select: { iban: true } });
      if (c && (!c.iban || pulisciIban(c.iban) === a.iban)) {
        await tx.cliente.update({ where: { id: a.clienteId }, data: { iban } });
      }
    }
    return { a: agg, precedente: { mandatoRef: a.mandatoRef, iban: a.iban } };
  });
}

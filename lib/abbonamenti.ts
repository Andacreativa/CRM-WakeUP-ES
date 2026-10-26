import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/richieste";
import { normPiva } from "@/lib/doppioni";
import { PAESI, pulisciPiva } from "@/lib/constants";
import {
  compilaTesto,
  prossimoNumeroFattura,
  type ImpostazioniFatture,
} from "@/lib/impostazioni";
import {
  getCreditore,
  type Creditore,
  type ImpostazioniAbbonamenti,
} from "@/lib/abbonamenti-impostazioni";
import { LOCALE, MESI_L } from "@/lib/abbonamenti-testi";
import {
  bicValido,
  giornoLavorativo,
  ibanValido,
  nifSpagnoloValido,
  pain008,
  problemiPain,
  pulisciBic,
  pulisciIban,
  testoSepa,
  ymd,
  type AddebitoPain,
} from "@/lib/sepa";
import {
  IMPOSTA_LABEL,
  aliquotaPerTipo,
  linguaValida,
  nomeProdotto,
  prodottoValido,
  tipoIvaSuggerito,
  tipoIvaValido,
  PRODOTTI,
  type Lingua,
} from "@/components/abbonamenti/tipi";

// Abbonamenti boogo / cobrea: piani, creazione e firma, addebiti mensili e
// remesse SEPA. Le costanti e i tipi del browser stanno in
// components/abbonamenti/tipi.ts; le impostazioni in
// lib/abbonamenti-impostazioni.ts; le email in lib/abbonamenti-mail.ts.

export type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

// ── Piani ────────────────────────────────────────────────────────────────
// Prezzi della presentazione Boogo (ottobre 2026) e della proposta Cobrea:
// Base 20, Medium 40, Pro «da 60» (concordato). La configurazione iniziale
// resta fuori: si preventiva e si fattura a mano.
const PIANI_DEFAULT: Record<string, { codice: string; nome: string; prezzo: number; prezzoLibero: boolean; ordine: number; descrizione: string }[]> = {
  boogo: [
    { codice: "base", nome: "Base", prezzo: 20, prezzoLibero: false, ordine: 1, descrizione: "Para empezar: sitio de reservas y panel." },
    { codice: "medium", nome: "Medium", prezzo: 40, prezzoLibero: false, ordine: 2, descrizione: "Más módulos, más reservas y la administración incluida." },
    { codice: "pro", nome: "Pro", prezzo: 60, prezzoLibero: true, ordine: 3, descrizione: "Para quien usa muchos módulos y un volumen alto de reservas." },
  ],
  cobrea: [
    { codice: "base", nome: "Base", prezzo: 20, prezzoLibero: false, ordine: 1, descrizione: "Administración completa: facturas con VeriFactu, presupuestos, gastos, banco, vencimientos, envío al gestor y asistente." },
    { codice: "medium", nome: "Medium", prezzo: 40, prezzoLibero: false, ordine: 2, descrizione: "Base más los módulos comercial (clientes, presupuestos, contratos) y agenda con citas." },
    { codice: "pro", nome: "Pro", prezzo: 60, prezzoLibero: true, ordine: 3, descrizione: "Todos los módulos, también gestión del trabajo y WhatsApp, y módulos a medida." },
  ],
};

// Se un prodotto non ha piani, nascono quelli standard (idempotente).
export async function assicuraPiani(db: Db) {
  for (const p of PRODOTTI) {
    const n = await db.pianoAbbonamento.count({ where: { prodotto: p.value } });
    if (n > 0) continue;
    await db.pianoAbbonamento.createMany({
      data: PIANI_DEFAULT[p.value].map((x) => ({ ...x, prodotto: p.value, tipoIva: "igic7", attivo: true })),
      skipDuplicates: true,
    });
  }
}

export async function listaPiani(db: Db, prodotto?: string, soloAttivi = false) {
  await assicuraPiani(db);
  return db.pianoAbbonamento.findMany({
    where: { ...(prodotto ? { prodotto } : {}), ...(soloAttivi ? { attivo: true } : {}) },
    orderBy: [{ prodotto: "asc" }, { ordine: "asc" }, { id: "asc" }],
  });
}

// ── Codici ───────────────────────────────────────────────────────────────
async function prossimoCodice(tx: Db, tabella: "abbonamento" | "remessaSepa", prefix: string) {
  const rows =
    tabella === "abbonamento"
      ? await tx.abbonamento.findMany({ where: { codice: { startsWith: prefix } }, select: { codice: true } })
      : await tx.remessaSepa.findMany({ where: { codice: { startsWith: prefix } }, select: { codice: true } });
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.codice.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
export const nextCodiceAbbonamento = (tx: Db, anno: number) => prossimoCodice(tx, "abbonamento", `AB-${anno}-`);
export const nextCodiceRemessa = (tx: Db, anno: number) => prossimoCodice(tx, "remessaSepa", `REM-${anno}-`);
// Riferimento del mandato (max 35 caratteri SEPA): ANDA-BOOGO-AB-2026-0001
export const mandatoRef = (prodotto: string, codice: string) =>
  testoSepa(`ANDA-${prodotto.toUpperCase()}-${codice}`, 35);
export const endToEndId = (codice: string, anno: number, mese: number) =>
  `${codice}-${anno}${String(mese).padStart(2, "0")}`;
export const nuovoToken = () => randomBytes(24).toString("hex");
// Due firme (o due remesse) nello stesso istante non devono prendere lo
// stesso numero: chi arriva secondo aspetta la fine della transazione.
export const bloccaCodici = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(20261026)`;

// ── Importi e imposta ────────────────────────────────────────────────────
export function importiAbbonamento(prezzo: number, tipoIva: string) {
  const p = round2(Math.max(0, prezzo));
  const iva = aliquotaPerTipo(tipoIva);
  return { prezzo: p, tipoIva, iva, totale: round2(p * (1 + iva / 100)) };
}

export const euroTesto = (n: number, lingua: Lingua) =>
  n.toLocaleString(LOCALE[lingua], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dataTesto = (d: Date, lingua: Lingua) =>
  d.toLocaleDateString(LOCALE[lingua], { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

// ── Dati del modulo (comuni a modulo pubblico e form Sales) ──────────────
export interface DatiAbbonamento {
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
  lingua: Lingua;
}
export interface ErroreCampo {
  campo: string;
  codice: "obbligatorio" | "email" | "nif" | "iban" | "bic";
}

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const strNull = (v: unknown, max = 200) => str(v, max) || null;
const emailValida = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// Legge e controlla i dati dell'intestatario e del conto. Con conto=false
// (abbonamento creato da Sales, firma dopo) il conto può mancare.
export function leggiDatiAbbonamento(
  body: Record<string, unknown>,
  opz: { conto: boolean },
): { dati: DatiAbbonamento; errori: ErroreCampo[] } {
  const paese = PAESI.includes(str(body.paese)) ? str(body.paese) : "Spagna";
  const dati: DatiAbbonamento = {
    intestatario: str(body.intestatario, 140),
    nif: pulisciPiva(String(body.nif ?? "").replace(/[.\-\s]/g, "")),
    email: str(body.email, 160).toLowerCase(),
    telefono: strNull(body.telefono, 40),
    via: strNull(body.via, 140),
    cap: strNull(body.cap, 16),
    citta: strNull(body.citta, 80),
    provincia: strNull(body.provincia, 80),
    paese,
    titolareConto: str(body.titolareConto, 140),
    iban: pulisciIban(body.iban),
    bic: pulisciBic(body.bic) || null,
    lingua: linguaValida(body.lingua),
  };
  const errori: ErroreCampo[] = [];
  if (!dati.intestatario) errori.push({ campo: "intestatario", codice: "obbligatorio" });
  if (!dati.email) errori.push({ campo: "email", codice: "obbligatorio" });
  else if (!emailValida(dati.email)) errori.push({ campo: "email", codice: "email" });
  if (paese === "Spagna") {
    if (!dati.nif) errori.push({ campo: "nif", codice: "obbligatorio" });
    else if (!nifSpagnoloValido(dati.nif.replace(/^ES/, ""))) errori.push({ campo: "nif", codice: "nif" });
  }
  if (opz.conto) {
    if (!dati.titolareConto) errori.push({ campo: "titolareConto", codice: "obbligatorio" });
    if (!dati.iban) errori.push({ campo: "iban", codice: "obbligatorio" });
    else if (!ibanValido(dati.iban)) errori.push({ campo: "iban", codice: "iban" });
    if (dati.bic && !bicValido(dati.bic)) errori.push({ campo: "bic", codice: "bic" });
  } else {
    if (dati.iban && !ibanValido(dati.iban)) errori.push({ campo: "iban", codice: "iban" });
    if (dati.bic && !bicValido(dati.bic)) errori.push({ campo: "bic", codice: "bic" });
  }
  return { dati, errori };
}

// ── Cliente CRM: stessa P.IVA, poi stessa email, altrimenti nuovo ────────
export async function agganciaCliente(tx: Db, d: DatiAbbonamento, tipoIva: string): Promise<number> {
  const piva = normPiva(d.nif);
  if (piva.length >= 8) {
    const tutti = await tx.cliente.findMany({
      where: { partitaIva: { not: null } },
      select: { id: true, partitaIva: true },
    });
    const hit = tutti.find((c) => normPiva(c.partitaIva) === piva);
    if (hit) return hit.id;
  }
  if (d.email) {
    const perEmail = await tx.cliente.findFirst({
      where: { email: { equals: d.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (perEmail) return perEmail.id;
  }
  const c = await tx.cliente.create({
    data: {
      nome: d.intestatario,
      paese: d.paese,
      email: d.email || null,
      telefono: d.telefono,
      partitaIva: d.nif,
      via: d.via,
      cap: d.cap,
      citta: d.citta,
      provincia: d.provincia,
      iban: d.iban || null,
      tipoImposta: tipoIva === "igic7" ? "IGIC 7%" : "IGIC Exenta",
      note: "Creato dall'abbonamento (modulo di sottoscrizione)",
    },
    select: { id: true },
  });
  return c.id;
}

// ── Date ─────────────────────────────────────────────────────────────────
export const primoDelMese = (anno: number, mese: number) => new Date(Date.UTC(anno, mese - 1, 1));
export const ultimoDelMese = (anno: number, mese: number) => new Date(Date.UTC(anno, mese, 0));
export function primoMeseAddebito(firmatoIl: Date, meseSuccessivo: boolean) {
  const y = firmatoIl.getUTCFullYear();
  const m = firmatoIl.getUTCMonth() + 1;
  return meseSuccessivo ? new Date(Date.UTC(y, m, 1)) : primoDelMese(y, m);
}
// Giorno di addebito del mese (il giorno scelto, spostato al lunedì se
// cade nel weekend) e mai prima di domani.
export function dataAddebitoMese(anno: number, mese: number, giorno: number, oggi = new Date()) {
  const ultimo = ultimoDelMese(anno, mese).getUTCDate();
  let d = giornoLavorativo(new Date(Date.UTC(anno, mese - 1, Math.min(Math.max(1, giorno), ultimo))));
  const domani = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate() + 1));
  if (d < domani) d = giornoLavorativo(domani);
  return d;
}

// ── Testo del contratto ──────────────────────────────────────────────────
export function testoContratto(
  cfg: ImpostazioniAbbonamenti,
  cred: Creditore,
  a: {
    prodotto: string;
    pianoNome: string;
    prezzo: number;
    tipoIva: string;
    totale: number;
    intestatario: string;
    nif: string | null;
    lingua: string;
  },
  data: Date,
) {
  const lingua = linguaValida(a.lingua);
  const tpl = lingua === "it" ? cfg.contrattoIt : lingua === "en" ? cfg.contrattoEn : cfg.contrattoEs;
  return compilaTesto(tpl, {
    prodotto: nomeProdotto(a.prodotto),
    piano: a.pianoNome,
    prezzo: euroTesto(a.prezzo, lingua),
    imposta: IMPOSTA_LABEL[lingua][a.tipoIva] ?? "",
    totale: euroTesto(a.totale, lingua),
    giornoAddebito: String(cfg.giornoAddebito),
    azienda: cred.nome,
    nif: cred.nif,
    indirizzo: [cred.via, [cred.cap, cred.citta].filter(Boolean).join(" "), cred.provincia].filter(Boolean).join(", "),
    email: cred.email,
    intestatario: a.intestatario,
    nifCliente: a.nif || "—",
    data: dataTesto(data, lingua),
  });
}

// ── Lettura ──────────────────────────────────────────────────────────────
export const ADDEBITO_INCLUDE = {
  remessa: { select: { id: true, codice: true, dataAddebito: true, stato: true } },
  fattura: { select: { id: true, numero: true, pagato: true, stato: true } },
} satisfies Prisma.AddebitoSepaInclude;

export const ABBONAMENTO_INCLUDE = {
  piano: { select: { id: true, codice: true, nome: true } },
  cliente: { select: { id: true, nome: true, paese: true } },
  addebiti: { orderBy: [{ anno: "desc" }, { mese: "desc" }], include: ADDEBITO_INCLUDE },
} satisfies Prisma.AbbonamentoInclude;

export type AbbonamentoConRelazioni = Prisma.AbbonamentoGetPayload<{ include: typeof ABBONAMENTO_INCLUDE }>;

export const ADDEBITO_RIGA_INCLUDE = {
  ...ADDEBITO_INCLUDE,
  abbonamento: {
    select: {
      id: true, codice: true, prodotto: true, pianoNome: true, intestatario: true, titolareConto: true,
      iban: true, mandatoRef: true, mandatoFirmatoIl: true, stato: true, email: true,
    },
  },
} satisfies Prisma.AddebitoSepaInclude;

// Indirizzo pubblico dell'app per i link nelle email e nei QR
export function baseUrl(request?: Request) {
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  if (request) return new URL(request.url).origin;
  return "";
}

export function serializzaAbbonamento(a: AbbonamentoConRelazioni, base = "") {
  const ultimoAddebito = a.addebiti.find((x) => x.stato !== "annullato") ?? null;
  const devoluciones = a.addebiti.filter((x) => x.stato === "devuelto").length;
  const linkFirma =
    a.stato === "in_attesa" && a.tokenFirma ? `${base}/suscripcion/firma/${a.tokenFirma}` : null;
  return { ...a, ultimoAddebito, devoluciones, linkFirma };
}

// ── Creazione (modulo pubblico o Sales) ──────────────────────────────────
export interface NuovoAbbonamento {
  prodotto: string;
  pianoId?: number | null;
  pianoCodice?: string | null;
  prezzo?: number | null; // solo da Sales: prezzo concordato
  tipoIva?: string | null; // solo da Sales
  dati: DatiAbbonamento;
  origine: "modulo" | "manuale";
  note?: string | null;
  dataInizio?: Date | null;
  // Firma contestuale (modulo pubblico): ip e browser di chi accetta
  firma?: { ip: string | null; userAgent: string | null } | null;
}

export class ErroreAbbonamento extends Error {
  status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.status = status;
  }
}

export async function creaAbbonamento(
  tx: Tx,
  n: NuovoAbbonamento,
  ctx: { cfg: ImpostazioniAbbonamenti; cred: Creditore; oggi?: Date },
): Promise<AbbonamentoConRelazioni> {
  const oggi = ctx.oggi ?? new Date();
  if (!prodottoValido(n.prodotto)) throw new ErroreAbbonamento("Prodotto sconosciuto");
  await bloccaCodici(tx);
  await assicuraPiani(tx);
  const piano = n.pianoId
    ? await tx.pianoAbbonamento.findUnique({ where: { id: n.pianoId } })
    : await tx.pianoAbbonamento.findUnique({
        where: { prodotto_codice: { prodotto: n.prodotto, codice: String(n.pianoCodice ?? "") } },
      });
  if (!piano || piano.prodotto !== n.prodotto) throw new ErroreAbbonamento("Piano non trovato");
  if (!piano.attivo) throw new ErroreAbbonamento("Piano non più in vendita");
  if (n.origine === "modulo" && piano.prezzoLibero)
    throw new ErroreAbbonamento("Questo piano si attiva con un preventivo: contattaci");
  const prezzoBase = n.prezzo != null && Number.isFinite(n.prezzo) ? n.prezzo : piano.prezzo;
  if (n.origine === "modulo" && prezzoBase !== piano.prezzo) throw new ErroreAbbonamento("Prezzo non valido");
  const tipoIva = n.tipoIva ? tipoIvaValido(n.tipoIva) : tipoIvaSuggerito(n.dati.paese, n.dati.cap, piano.tipoIva);
  const importi = importiAbbonamento(prezzoBase, tipoIva);
  const codice = await nextCodiceAbbonamento(tx, oggi.getUTCFullYear());
  const clienteId = await agganciaCliente(tx, n.dati, tipoIva);
  const firmato = !!n.firma;
  const base = {
    codice,
    prodotto: n.prodotto,
    pianoId: piano.id,
    pianoNome: piano.nome,
    ...importi,
    intestatario: n.dati.intestatario,
    nif: n.dati.nif,
    email: n.dati.email,
    telefono: n.dati.telefono,
    via: n.dati.via,
    cap: n.dati.cap,
    citta: n.dati.citta,
    provincia: n.dati.provincia,
    paese: n.dati.paese,
    titolareConto: n.dati.titolareConto || n.dati.intestatario,
    iban: n.dati.iban,
    bic: n.dati.bic,
    mandatoRef: mandatoRef(n.prodotto, codice),
    lingua: n.dati.lingua,
    clienteId,
    origine: n.origine,
    note: n.note ?? null,
  };
  const contratto = testoContratto(ctx.cfg, ctx.cred, { ...base, totale: importi.totale }, oggi);
  const data: Prisma.AbbonamentoUncheckedCreateInput = firmato
    ? {
        ...base,
        stato: "attivo",
        mandatoFirmatoIl: oggi,
        mandatoLuogo: ctx.cfg.luogoFirma || ctx.cred.citta,
        mandatoIp: n.firma?.ip ?? null,
        mandatoUserAgent: n.firma?.userAgent?.slice(0, 300) ?? null,
        contrattoTesto: contratto,
        contrattoVersione: `${n.dati.lingua}-${ymd(oggi)}`,
        dataInizio: n.dataInizio ?? primoMeseAddebito(oggi, ctx.cfg.inizioMeseSuccessivo),
      }
    : {
        ...base,
        stato: "in_attesa",
        contrattoTesto: contratto, // anteprima: si rigenera alla firma
        dataInizio: n.dataInizio ?? null,
        tokenFirma: nuovoToken(),
        tokenScadenza: new Date(oggi.getTime() + 30 * 86_400_000),
      };
  return tx.abbonamento.create({ data, include: ABBONAMENTO_INCLUDE });
}

// ── Firma dal link (abbonamento creato da Sales) ─────────────────────────
export async function firmaConToken(
  tx: Tx,
  a: AbbonamentoConRelazioni,
  dati: DatiAbbonamento,
  firma: { ip: string | null; userAgent: string | null },
  ctx: { cfg: ImpostazioniAbbonamenti; cred: Creditore; oggi?: Date },
): Promise<AbbonamentoConRelazioni> {
  const oggi = ctx.oggi ?? new Date();
  if (a.stato !== "in_attesa") throw new ErroreAbbonamento("Abbonamento già firmato", 409);
  if (a.tokenScadenza && a.tokenScadenza < oggi) throw new ErroreAbbonamento("Link scaduto", 410);
  // Il prezzo e il piano restano quelli concordati; l'intestatario può
  // correggere i propri dati e mette il conto
  const tipoIva = a.tipoIva;
  const contratto = testoContratto(
    ctx.cfg,
    ctx.cred,
    { prodotto: a.prodotto, pianoNome: a.pianoNome, prezzo: a.prezzo, tipoIva, totale: a.totale, intestatario: dati.intestatario, nif: dati.nif, lingua: dati.lingua },
    oggi,
  );
  const clienteId = a.clienteId ?? (await agganciaCliente(tx, dati, tipoIva));
  return tx.abbonamento.update({
    where: { id: a.id },
    data: {
      intestatario: dati.intestatario,
      nif: dati.nif,
      email: dati.email,
      telefono: dati.telefono,
      via: dati.via,
      cap: dati.cap,
      citta: dati.citta,
      provincia: dati.provincia,
      paese: dati.paese,
      titolareConto: dati.titolareConto || dati.intestatario,
      iban: dati.iban,
      bic: dati.bic,
      lingua: dati.lingua,
      clienteId,
      stato: "attivo",
      mandatoFirmatoIl: oggi,
      mandatoLuogo: ctx.cfg.luogoFirma || ctx.cred.citta,
      mandatoIp: firma.ip,
      mandatoUserAgent: firma.userAgent?.slice(0, 300) ?? null,
      contrattoTesto: contratto,
      contrattoVersione: `${dati.lingua}-${ymd(oggi)}`,
      dataInizio: a.dataInizio ?? primoMeseAddebito(oggi, ctx.cfg.inizioMeseSuccessivo),
      tokenFirma: null,
      tokenScadenza: null,
    },
    include: ABBONAMENTO_INCLUDE,
  });
}

// ── Stato ────────────────────────────────────────────────────────────────
export async function cambiaStato(
  db: Db,
  id: number,
  stato: "attivo" | "sospeso" | "cancellato",
  opz: { dataFine?: Date | null; oggi?: Date } = {},
) {
  const oggi = opz.oggi ?? new Date();
  const a = await db.abbonamento.findUnique({ where: { id } });
  if (!a || a.deletedAt) throw new ErroreAbbonamento("Abbonamento non trovato", 404);
  if (stato === "attivo" && !a.mandatoFirmatoIl)
    throw new ErroreAbbonamento("Senza mandato firmato non si attiva: manda il link di firma", 409);
  const data: Prisma.AbbonamentoUncheckedUpdateInput = { stato };
  if (stato === "sospeso") data.sospesoIl = oggi;
  if (stato === "attivo") {
    data.sospesoIl = null;
    data.cancellatoIl = null;
    data.dataFine = null;
  }
  if (stato === "cancellato") {
    data.cancellatoIl = oggi;
    const fine = opz.dataFine ?? ultimoDelMese(oggi.getUTCFullYear(), oggi.getUTCMonth() + 1);
    data.dataFine = fine;
    // Gli addebiti previsti dopo la fine non partono più
    await db.addebitoSepa.updateMany({
      where: {
        abbonamentoId: id,
        stato: "previsto",
        OR: [{ anno: { gt: fine.getUTCFullYear() } }, { anno: fine.getUTCFullYear(), mese: { gt: fine.getUTCMonth() + 1 } }],
      },
      data: { stato: "annullato" },
    });
  }
  return db.abbonamento.update({ where: { id }, data, include: ABBONAMENTO_INCLUDE });
}

// ── Addebiti del mese ────────────────────────────────────────────────────
export function conceptoAddebito(
  cfg: ImpostazioniAbbonamenti,
  cred: Creditore,
  a: { codice: string; prodotto: string; pianoNome: string; lingua: string },
  anno: number,
  mese: number,
) {
  const lingua = linguaValida(a.lingua);
  return testoSepa(
    compilaTesto(cfg.conceptoAddebito, {
      azienda: cred.nome,
      prodotto: nomeProdotto(a.prodotto),
      piano: a.pianoNome,
      mese: MESI_L[lingua][mese - 1],
      anno: String(anno),
      codice: a.codice,
    }),
    140,
  );
}

// Crea gli addebiti «previsti» del mese per gli abbonamenti attivi che lo
// coprono e non li hanno ancora. Idempotente: lo usano il cron del giorno 1
// e il bottone in Finance.
export async function generaAddebitiMese(db: Db, anno: number, mese: number) {
  const [cfg, , cred] = await getCreditore(db);
  const inizioMese = primoDelMese(anno, mese);
  const fineMese = ultimoDelMese(anno, mese);
  const attivi = await db.abbonamento.findMany({
    where: {
      deletedAt: null,
      stato: "attivo",
      mandatoFirmatoIl: { not: null },
      AND: [
        { OR: [{ dataInizio: null }, { dataInizio: { lte: fineMese } }] },
        { OR: [{ dataFine: null }, { dataFine: { gte: inizioMese } }] },
      ],
    },
    include: { addebiti: { where: { anno, mese }, select: { id: true } } },
  });
  const daFare = attivi.filter((a) => a.addebiti.length === 0 && a.iban && a.totale > 0);
  if (daFare.length) {
    await db.addebitoSepa.createMany({
      data: daFare.map((a) => ({
        abbonamentoId: a.id,
        anno,
        mese,
        importo: a.totale,
        descrizione: conceptoAddebito(cfg, cred, a, anno, mese),
        endToEndId: endToEndId(a.codice, anno, mese),
        seq: "RCUR",
      })),
      skipDuplicates: true,
    });
  }
  return { creati: daFare.length, giaFatti: attivi.length - daFare.length, attivi: attivi.length };
}

// ── Remessa ──────────────────────────────────────────────────────────────
export interface EsitoRemessa {
  remessa: { id: number; codice: string; nomeFile: string; numero: number; totale: number; dataAddebito: Date };
  fattureIds: number[];
  saltati: { id: number; motivo: string }[];
}

// Fattura della quota: numerata subito (VeriFactu spento) oppure bozza da
// emettere dal pannello, come per le richieste.
async function creaFatturaAddebito(
  tx: Tx,
  ad: { anno: number; mese: number; importo: number },
  a: { prodotto: string; pianoNome: string; prezzo: number; tipoIva: string; iva: number; clienteId: number | null; lingua: string },
  fatt: ImpostazioniFatture,
  dataAddebito: Date,
  oggi: Date,
) {
  const bozza = fatt.vfModo !== "spento";
  const data = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()));
  const numero = bozza ? null : await prossimoNumeroFattura(tx, data.getUTCFullYear(), fatt);
  const lingua = linguaValida(a.lingua);
  const descrizione = `${nomeProdotto(a.prodotto)} ${a.pianoNome} — ${MESI_L[lingua][ad.mese - 1]} ${ad.anno}`;
  const f = await tx.fattura.create({
    data: {
      numero,
      data,
      stato: bozza ? "bozza" : "emessa",
      emessaIl: bozza ? null : data,
      descrizione,
      voci: JSON.stringify([{ descrizione, quantita: 1, prezzo: a.prezzo }]),
      clienteId: a.clienteId,
      azienda: "Spagna",
      mese: ad.mese,
      anno: ad.anno,
      importo: a.prezzo,
      tipoIva: a.tipoIva,
      iva: a.iva,
      pagato: false,
      inviata: false,
      origine: "finance",
      metodo: "Domiciliación SEPA",
      scadenza: dataAddebito,
      causaIgic: a.tipoIva === "igic_exenta" ? fatt.vfCausaSpagna || null : null,
    },
    select: { id: true },
  });
  return f.id;
}

export async function creaRemessa(opz: {
  anno: number;
  mese: number;
  dataAddebito?: Date | null;
  addebitoIds?: number[] | null;
  oggi?: Date;
}): Promise<EsitoRemessa> {
  const oggi = opz.oggi ?? new Date();
  return prisma.$transaction(
    async (tx) => {
      await bloccaCodici(tx);
      const [cfg, fatt, cred] = await getCreditore(tx);
      const candidati = await tx.addebitoSepa.findMany({
        where: {
          stato: "previsto",
          anno: opz.anno,
          mese: opz.mese,
          ...(opz.addebitoIds?.length ? { id: { in: opz.addebitoIds } } : {}),
          abbonamento: { deletedAt: null },
        },
        include: { abbonamento: true },
        orderBy: { id: "asc" },
      });
      const saltati: EsitoRemessa["saltati"] = [];
      const buoni = candidati.filter((ad) => {
        const a = ad.abbonamento;
        if (a.stato !== "attivo") return saltati.push({ id: ad.id, motivo: `abbonamento ${a.stato}` }), false;
        if (!a.mandatoFirmatoIl) return saltati.push({ id: ad.id, motivo: "mandato non firmato" }), false;
        if (!ibanValido(a.iban)) return saltati.push({ id: ad.id, motivo: "IBAN non valido" }), false;
        if (!(ad.importo > 0)) return saltati.push({ id: ad.id, motivo: "importo zero" }), false;
        return true;
      });
      if (!buoni.length) throw new ErroreAbbonamento("Nessun addebito previsto da includere nella remessa", 409);

      const dataAddebito = opz.dataAddebito
        ? dataAddebitoMese(opz.dataAddebito.getUTCFullYear(), opz.dataAddebito.getUTCMonth() + 1, opz.dataAddebito.getUTCDate(), oggi)
        : dataAddebitoMese(opz.anno, opz.mese, cfg.giornoAddebito, oggi);
      const codice = await nextCodiceRemessa(tx, oggi.getUTCFullYear());
      const msgId = testoSepa(`${codice}-${oggi.toISOString().replace(/[-:]/g, "").slice(0, 15)}`, 35);
      const addebiti: AddebitoPain[] = buoni.map((ad) => ({
        endToEndId: ad.endToEndId,
        importo: ad.importo,
        mandatoRef: ad.abbonamento.mandatoRef,
        dataFirma: ad.abbonamento.mandatoFirmatoIl as Date,
        seq: "RCUR",
        debitore: {
          nome: ad.abbonamento.titolareConto || ad.abbonamento.intestatario,
          iban: ad.abbonamento.iban,
          bic: ad.abbonamento.bic,
          paese: ad.abbonamento.paese,
          via: ad.abbonamento.via,
          cap: ad.abbonamento.cap,
          citta: ad.abbonamento.citta,
        },
        concepto: ad.descrizione,
      }));
      const opzioni = {
        versione: cfg.versione,
        msgId,
        creazione: oggi,
        creditore: {
          nome: cred.nome,
          iban: cred.iban,
          bic: cred.bic,
          identificador: cred.identificador,
          paese: cred.paese,
          via: cred.via,
          cap: cred.cap,
          citta: cred.citta,
        },
        dataAddebito,
        batchBooking: cfg.batchBooking,
        addebiti,
      };
      const problemi = problemiPain(opzioni);
      if (problemi.length) throw new ErroreAbbonamento(`Fichero non generabile: ${problemi.join("; ")}`, 422);
      const xml = pain008(opzioni);
      const totale = round2(addebiti.reduce((s, a) => s + a.importo, 0));
      const remessa = await tx.remessaSepa.create({
        data: {
          codice,
          msgId,
          dataAddebito,
          numero: addebiti.length,
          totale,
          versione: cfg.versione,
          nomeFile: `adeudos_sepa_${codice}_${ymd(dataAddebito)}.xml`,
          xml,
          stato: "generata",
        },
      });
      const fattureIds: number[] = [];
      for (const ad of buoni) {
        let fatturaId: number | null = ad.fatturaId;
        if (cfg.fatturaAutomatica && !fatturaId) {
          fatturaId = await creaFatturaAddebito(tx, ad, ad.abbonamento, fatt, dataAddebito, oggi);
          fattureIds.push(fatturaId);
        }
        await tx.addebitoSepa.update({
          where: { id: ad.id },
          data: { stato: "in_remessa", remessaId: remessa.id, seq: "RCUR", fatturaId },
        });
      }
      return {
        remessa: { id: remessa.id, codice, nomeFile: remessa.nomeFile, numero: addebiti.length, totale, dataAddebito },
        fattureIds,
        saltati,
      };
    },
    { timeout: 60_000 },
  );
}

// Remessa caricata in banca / incassata. «Incassata» segna incassati tutti
// gli addebiti ancora in remessa e pagate le loro fatture.
export async function segnaRemessa(db: Db, id: number, stato: "generata" | "inviata" | "incassata", oggi = new Date()) {
  const r = await db.remessaSepa.findUnique({ where: { id }, include: { addebiti: { select: { id: true, stato: true, fatturaId: true } } } });
  if (!r) throw new ErroreAbbonamento("Remessa non trovata", 404);
  if (stato === "incassata") {
    const inRemessa = r.addebiti.filter((a) => a.stato === "in_remessa");
    await db.addebitoSepa.updateMany({
      where: { id: { in: inRemessa.map((a) => a.id) } },
      data: { stato: "incassato", dataIncasso: r.dataAddebito },
    });
    const fatture = inRemessa.map((a) => a.fatturaId).filter((x): x is number => !!x);
    if (fatture.length) {
      await db.fattura.updateMany({ where: { id: { in: fatture }, annullata: false }, data: { pagato: true } });
    }
  }
  return db.remessaSepa.update({
    where: { id },
    data: {
      stato,
      inviataIl: stato === "generata" ? null : (r.inviataIl ?? oggi),
      incassataIl: stato === "incassata" ? oggi : null,
    },
  });
}

// Annulla una remessa non ancora caricata in banca: gli addebiti tornano
// previsti; le fatture bozza spariscono, quelle emesse restano (si annullano
// dal pannello Fatture, con il loro numero).
export async function annullaRemessa(db: Db, id: number) {
  const r = await db.remessaSepa.findUnique({ where: { id }, include: { addebiti: { include: { fattura: { select: { id: true, stato: true } } } } } });
  if (!r) throw new ErroreAbbonamento("Remessa non trovata", 404);
  if (r.stato !== "generata") throw new ErroreAbbonamento("La remessa è già stata caricata in banca: non si annulla", 409);
  const emesse = r.addebiti.filter((a) => a.fattura && a.fattura.stato === "emessa").length;
  for (const ad of r.addebiti) {
    const bozza = ad.fattura && ad.fattura.stato === "bozza" ? ad.fattura.id : null;
    await db.addebitoSepa.update({
      where: { id: ad.id },
      data: { stato: "previsto", remessaId: null, ...(bozza ? { fatturaId: null } : {}) },
    });
    if (bozza) await db.fattura.delete({ where: { id: bozza } });
  }
  await db.remessaSepa.delete({ where: { id } });
  return { emesse };
}

// Singolo addebito: incassato / devuelto / di nuovo previsto / annullato
export async function segnaAddebito(
  db: Db,
  id: number,
  stato: "previsto" | "incassato" | "devuelto" | "annullato",
  opz: { motivo?: string | null; oggi?: Date } = {},
) {
  const oggi = opz.oggi ?? new Date();
  const ad = await db.addebitoSepa.findUnique({ where: { id }, include: { remessa: { select: { dataAddebito: true } } } });
  if (!ad) throw new ErroreAbbonamento("Addebito non trovato", 404);
  if ((stato === "incassato" || stato === "devuelto") && !ad.remessaId)
    throw new ErroreAbbonamento("L'addebito non è ancora in una remessa", 409);
  if (stato === "previsto" && ad.remessaId)
    throw new ErroreAbbonamento("L'addebito è in una remessa: annulla la remessa oppure segnalo devuelto", 409);
  const data: Prisma.AddebitoSepaUncheckedUpdateInput = { stato };
  if (stato === "incassato") {
    data.dataIncasso = ad.remessa?.dataAddebito ?? oggi;
    data.dataDevoluzione = null;
    data.motivoDevoluzione = null;
  }
  if (stato === "devuelto") {
    data.dataDevoluzione = oggi;
    data.motivoDevoluzione = opz.motivo?.trim() || null;
    data.dataIncasso = null;
  }
  if (ad.fatturaId) {
    await db.fattura.updateMany({ where: { id: ad.fatturaId, annullata: false }, data: { pagato: stato === "incassato" } });
  }
  return db.addebitoSepa.update({ where: { id }, data, include: ADDEBITO_RIGA_INCLUDE });
}

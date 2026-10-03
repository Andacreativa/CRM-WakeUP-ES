import type { Prisma, PrismaClient } from "@prisma/client";
import { PAESI_CODICE } from "../constants";
import type { ImpostazioniFatture } from "../impostazioni";
import {
  busta,
  dataRegistro,
  destinatarioDa,
  erroriAlta,
  regimePer,
  registroAlta,
  registroAnulacion,
  type Ambiente,
  type CausaIgic,
  type DatiAlta,
  type RegistroPrecedente,
  type SistemaInformatico,
  type TipoFattura,
} from "./registro";
import { urlQr } from "./qr";
import { certificato, leggiRisposta, spedisci } from "./invio";

// La catena dei registri sul database: ogni registro nasce legato a quello
// di prima (impronta), resta in coda finché l'AEAT non risponde e non si
// modifica più. Qui si decide anche lo stato VeriFactu della fattura.

type Tx = Prisma.TransactionClient;
type Db = PrismaClient;

// Errori che l'utente può correggere (dati mancanti, stato sbagliato)
export class ErroreFattura extends Error {
  constructor(
    public errori: string[],
    public status = 422,
  ) {
    super(errori.join(" "));
  }
}

// null = VeriFactu spento: le fatture si registrano a mano come prima
export function ambienteAttivo(cfg: ImpostazioniFatture): Ambiente | null {
  if (cfg.vfModo === "prova") return "prova";
  if (cfg.vfModo === "produzione") {
    // Doppia sicura: l'invio vero parte solo dove è stato acceso apposta
    if (process.env.VERIFACTU_PRODUZIONE !== "1")
      throw new ErroreFattura(
        ["VeriFactu è impostato su produzione ma questo ambiente non è abilitato all'invio vero."],
        409,
      );
    return "produzione";
  }
  return null;
}

const sistemaDa = (cfg: ImpostazioniFatture): SistemaInformatico => ({
  // Programma sviluppato dall'azienda per uso proprio: il produttore è lei
  nombreRazon: cfg.ragioneSociale,
  nif: cfg.nif,
  nombreSistema: cfg.vfNombreSistema,
  idSistema: cfg.vfIdSistema,
  version: cfg.vfVersion,
  numeroInstalacion: cfg.vfNumeroInstalacion,
});

// Codice ISO del paese del cliente. PAESI_CODICE è il prefisso della partita
// IVA (vuoto fuori dall'UE): qui serve il paese anche per quelli
const PAESE_ISO: Record<string, string> = { ...PAESI_CODICE, Svizzera: "CH", "Stati Uniti": "US" };

// Un solo registro alla volta: la catena non ammette due «ultimi»
// (la funzione restituisce void: $executeRaw non prova a leggerne il risultato)
export const blocca = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(10072023)`;

async function precedente(tx: Tx, ambiente: Ambiente): Promise<RegistroPrecedente | null> {
  const r = await tx.registroVerifactu.findFirst({ where: { ambiente }, orderBy: { id: "desc" } });
  return r
    ? { nifEmittente: r.nifEmittente, numSerie: r.numSerie, dataFattura: r.dataFattura, huella: r.huella }
    : null;
}

// Registro di emissione (o di correzione dei dati, se subsanacion)
export async function creaRegistroAlta(
  tx: Tx,
  fatturaId: number,
  cfg: ImpostazioniFatture,
  ambiente: Ambiente,
  opts: { subsanacion?: boolean; rechazoPrevio?: "N" | "S" | "X" } = {},
) {
  await blocca(tx);
  const f = await tx.fattura.findUnique({
    where: { id: fatturaId },
    include: { cliente: true, rettificaDi: true },
  });
  if (!f) throw new ErroreFattura(["Fattura non trovata."], 404);
  if (!f.numero || !f.data) throw new ErroreFattura(["La fattura non ha numero o data."]);
  if (!f.cliente) throw new ErroreFattura(["La fattura non ha un cliente."]);
  if (f.tipoFattura !== "F1" && (!f.rettificaDi?.numero || !f.rettificaDi.data))
    throw new ErroreFattura(["La rettificativa deve indicare la fattura che corregge."]);

  const dati: DatiAlta = {
    nifEmittente: cfg.nif.trim(),
    nombreRazonEmittente: cfg.ragioneSociale.trim(),
    numSerie: f.numero,
    dataFattura: dataRegistro(f.data),
    tipoFattura: f.tipoFattura as TipoFattura,
    tipoRettifica: f.tipoFattura !== "F1" ? (f.tipoRettifica === "S" ? "S" : "I") : undefined,
    rettificate:
      f.tipoFattura !== "F1" && f.rettificaDi
        ? [{ numSerie: f.rettificaDi.numero!, dataFattura: dataRegistro(f.rettificaDi.data!) }]
        : undefined,
    rettificato:
      f.tipoFattura !== "F1" && f.tipoRettifica === "S" && f.rettificaDi
        ? {
            base: f.rettificaDi.importo,
            cuota: Math.round(f.rettificaDi.importo * (Number(f.rettificaDi.iva) || 0)) / 100,
          }
        : undefined,
    descrizione: (f.descrizione || cfg.vfDescrizioneDefault || "").trim(),
    destinatario: destinatarioDa(f.cliente, PAESE_ISO[f.cliente.paese] ?? ""),
    claveRegimen: regimePer(f.causaIgic, cfg.vfClaveRegimen),
    imponibile: f.importo,
    aliquota: Number(f.iva) || 0,
    causa: (f.causaIgic as CausaIgic | null) ?? null,
    subsanacion: opts.subsanacion,
    rechazoPrevio: opts.rechazoPrevio,
  };
  const errori = erroriAlta(dati);
  if (errori.length) throw new ErroreFattura(errori);

  const prec = await precedente(tx, ambiente);
  const reg = registroAlta(dati, sistemaDa(cfg), prec);
  const riga = await tx.registroVerifactu.create({
    data: {
      fatturaId,
      ambiente,
      tipo: "alta",
      subsanacion: !!opts.subsanacion,
      nifEmittente: dati.nifEmittente,
      numSerie: dati.numSerie,
      dataFattura: dati.dataFattura,
      huellaPrecedente: prec?.huella ?? null,
      huella: reg.huella,
      generatoIl: reg.generatoIl,
      xml: reg.xml,
    },
  });
  await tx.fattura.update({
    where: { id: fatturaId },
    data: {
      vfStato: "in_coda",
      vfQr: urlQr(ambiente, {
        nif: dati.nifEmittente,
        numSerie: dati.numSerie,
        dataFattura: dati.dataFattura,
        importeTotal: reg.importeTotal!,
      }),
    },
  });
  return riga;
}

// La fattura risulta all'AEAT se almeno un suo registro di emissione è passato
const risultaAllAeat = (tx: Tx, fatturaId: number, ambiente: Ambiente) =>
  tx.registroVerifactu
    .count({
      where: { fatturaId, ambiente, tipo: "alta", stato: { in: ["accettato", "accettato_con_errori"] } },
    })
    .then((n) => n > 0);

// Dopo un rifiuto o un'accettazione con errori si rimanda il registro con i
// dati corretti (subsanación). RechazoPrevio: X = la fattura non è mai
// arrivata all'AEAT, S = c'è ma l'ultima correzione è stata rifiutata.
export async function creaRegistroCorrezione(
  tx: Tx,
  fatturaId: number,
  cfg: ImpostazioniFatture,
  ambiente: Ambiente,
) {
  const ultimo = await tx.registroVerifactu.findFirst({
    where: { fatturaId, ambiente },
    orderBy: { id: "desc" },
  });
  if (!ultimo || ultimo.stato === "in_coda")
    throw new ErroreFattura(["Il registro è ancora in coda: non c'è niente da correggere."], 409);
  if (ultimo.stato === "accettato")
    throw new ErroreFattura(["L'AEAT ha accettato il registro: per correggere serve una rettificativa."], 409);
  const rifiutato = ultimo.stato === "rifiutato";
  if (ultimo.tipo === "anulacion") return creaRegistroAnulacion(tx, fatturaId, cfg, ambiente, rifiutato);
  const esiste = await risultaAllAeat(tx, fatturaId, ambiente);
  return creaRegistroAlta(tx, fatturaId, cfg, ambiente, {
    subsanacion: true,
    rechazoPrevio: rifiutato ? (esiste ? "S" : "X") : "N",
  });
}

// Registro di annullamento: la fattura è stata emessa per errore
export async function creaRegistroAnulacion(
  tx: Tx,
  fatturaId: number,
  cfg: ImpostazioniFatture,
  ambiente: Ambiente,
  rechazoPrevio = false,
) {
  await blocca(tx);
  const f = await tx.fattura.findUnique({ where: { id: fatturaId } });
  if (!f) throw new ErroreFattura(["Fattura non trovata."], 404);
  if (!f.numero || !f.data) throw new ErroreFattura(["La fattura non ha numero o data."]);
  const prec = await precedente(tx, ambiente);
  const dati = { nifEmittente: cfg.nif.trim(), numSerie: f.numero, dataFattura: dataRegistro(f.data) };
  // «Senza registro previo» solo se l'emissione non è mai passata e non è
  // nemmeno in coda (in coda parte prima di questo annullamento)
  const inArrivo = await tx.registroVerifactu.count({
    where: { fatturaId, ambiente, tipo: "alta", stato: "in_coda" },
  });
  const sinRegistroPrevio = !inArrivo && !(await risultaAllAeat(tx, fatturaId, ambiente));
  const reg = registroAnulacion({ ...dati, sinRegistroPrevio, rechazoPrevio }, sistemaDa(cfg), prec);
  const riga = await tx.registroVerifactu.create({
    data: {
      fatturaId,
      ambiente,
      tipo: "anulacion",
      ...dati,
      huellaPrecedente: prec?.huella ?? null,
      huella: reg.huella,
      generatoIl: reg.generatoIl,
      xml: reg.xml,
    },
  });
  await tx.fattura.update({
    where: { id: fatturaId },
    data: { vfStato: "in_coda", annullata: true, annullataIl: new Date() },
  });
  // Annullata una rettificativa per sostituzione, la fattura che sostituiva torna valida
  if (f.tipoRettifica === "S" && f.rettificaDiId) {
    await tx.fattura.update({
      where: { id: f.rettificaDiId },
      data: { annullata: false, annullataIl: null },
    });
  }
  return riga;
}

// ── Invio della coda ───────────────────────────────────────────────────────
// Controllo di flusso dell'AEAT: fra un invio e l'altro passa il tempo che
// l'ultima risposta ha indicato (60 secondi all'inizio).
const CHIAVE_FLUSSO = "verifactu";
type Flusso = Partial<Record<Ambiente, { prossimoInvio: string }>>;

async function leggiFlusso(db: Db): Promise<Flusso> {
  const row = await db.impostazione.findUnique({ where: { chiave: CHIAVE_FLUSSO } });
  try {
    return row ? (JSON.parse(row.valore) as Flusso) : {};
  } catch {
    return {};
  }
}

export interface EsitoCoda {
  inCoda: number; // registri ancora da inviare dopo questo giro
  inviati: number;
  attesa: number; // secondi prima di poter riprovare (0 = subito)
  errore: string | null;
}

export async function statoCoda(db: Db, ambiente: Ambiente): Promise<EsitoCoda> {
  const inCoda = await db.registroVerifactu.count({ where: { ambiente, stato: "in_coda" } });
  const prossimo = (await leggiFlusso(db))[ambiente]?.prossimoInvio;
  const attesa = prossimo ? Math.max(0, Math.ceil((new Date(prossimo).getTime() - Date.now()) / 1000)) : 0;
  return { inCoda, inviati: 0, attesa, errore: certificato() ? null : "Certificato dell'azienda non configurato" };
}

export async function inviaCoda(db: Db, cfg: ImpostazioniFatture, ambiente: Ambiente): Promise<EsitoCoda> {
  const stato = await statoCoda(db, ambiente);
  if (!stato.inCoda || stato.errore || stato.attesa > 0) return stato;

  const registri = await db.registroVerifactu.findMany({
    where: { ambiente, stato: "in_coda" },
    orderBy: { id: "asc" },
    take: 1000,
  });
  const ids = registri.map((r) => r.id);
  // Un registro che riparte dopo un invio fallito viaggia come «incidenza»
  const incidenza = registri.some((r) => r.tentativi > 0);
  const xml = busta(
    { nombreRazon: cfg.ragioneSociale.trim(), nif: cfg.nif.trim() },
    registri.map((r) => r.xml),
    incidenza,
  );

  const fallito = async (errore: string): Promise<EsitoCoda> => {
    await db.registroVerifactu.updateMany({
      where: { id: { in: ids } },
      data: { tentativi: { increment: 1 }, ultimoErrore: errore.slice(0, 500) },
    });
    return { inCoda: registri.length, inviati: 0, attesa: 0, errore };
  };

  let body: string;
  try {
    const res = await spedisci(ambiente, xml);
    body = res.body;
    if (!body.trim()) return fallito(`L'AEAT ha risposto ${res.status} senza contenuto`);
  } catch (e) {
    return fallito(e instanceof Error ? e.message : String(e));
  }
  const risposta = leggiRisposta(body);
  if (risposta.errore) return fallito(`AEAT: ${risposta.errore}`);

  const flusso = await leggiFlusso(db);
  flusso[ambiente] = { prossimoInvio: new Date(Date.now() + risposta.attesa * 1000).toISOString() };
  await db.impostazione.upsert({
    where: { chiave: CHIAVE_FLUSSO },
    create: { chiave: CHIAVE_FLUSSO, valore: JSON.stringify(flusso) },
    update: { valore: JSON.stringify(flusso) },
  });

  const daAbbinare = [...registri];
  const adesso = new Date();
  let inviati = 0;
  for (const riga of risposta.righe) {
    const tipo = riga.operazione === "Anulacion" ? "anulacion" : "alta";
    const i = daAbbinare.findIndex((r) => r.numSerie === riga.numSerie && r.tipo === tipo);
    if (i < 0) continue;
    const [reg] = daAbbinare.splice(i, 1);
    // Già registrato (3000): vale lo stato con cui l'AEAT lo ha
    const esito =
      riga.stato === "Incorrecto" && riga.duplicato
        ? riga.duplicato === "Correcta"
          ? "Correcto"
          : riga.duplicato === "AceptadaConErrores"
            ? "AceptadoConErrores"
            : "Incorrecto"
        : riga.stato;
    const statoReg =
      esito === "Correcto" ? "accettato" : esito === "AceptadoConErrores" ? "accettato_con_errori" : "rifiutato";
    await db.registroVerifactu.update({
      where: { id: reg.id },
      data: {
        stato: statoReg,
        csv: risposta.csv,
        codiceErrore: esito === "Correcto" ? null : riga.codiceErrore,
        descrizioneErrore: esito === "Correcto" ? null : riga.descrizioneErrore,
        risposta: riga.xml,
        tentativi: { increment: 1 },
        ultimoErrore: null,
        inviatoIl: adesso,
      },
    });
    const accettato = statoReg !== "rifiutato";
    await db.fattura.update({
      where: { id: reg.fatturaId },
      data:
        reg.tipo === "anulacion"
          ? { vfStato: accettato ? "annullata" : "rifiutata" }
          : {
              vfStato:
                statoReg === "accettato" ? "accettata" : accettato ? "accettata_con_errori" : "rifiutata",
              ...(accettato ? { presentata: true, presentataIl: adesso } : {}),
            },
    });
    inviati++;
  }
  if (daAbbinare.length) {
    await db.registroVerifactu.updateMany({
      where: { id: { in: daAbbinare.map((r) => r.id) } },
      data: { tentativi: { increment: 1 }, ultimoErrore: "L'AEAT non ha risposto per questo registro" },
    });
  }
  return { inCoda: daAbbinare.length, inviati, attesa: risposta.attesa, errore: null };
}

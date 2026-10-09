import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  RICHIESTA_INCLUDE,
  calcolaImporti,
  nextCodiceRichiesta,
  serializzaRichiesta,
} from "@/lib/richieste";
import {
  ANTICIPO_GIORNI,
  CANALI,
  FATTURAZIONI,
  PROPRIETA,
  STATI_RINNOVO,
} from "@/components/rinnovi/tipi";

// Rinnovi dei siti web: helper di API, scheda e cron. Le costanti stanno
// in components/rinnovi/tipi.ts perché servono anche al browser.

export const statoRinnovoValido = (v: unknown) =>
  STATI_RINNOVO.some((s) => s.value === v) ? String(v) : "attivo";
export const fatturazioneValida = (v: unknown) =>
  FATTURAZIONI.some((s) => s.value === v) ? String(v) : "rinnovo";
export const proprietaValida = (v: unknown) =>
  PROPRIETA.some((s) => s.value === v) ? String(v) : "nostra";
export const canaleValido = (v: unknown) =>
  CANALI.some((s) => s.value === v) ? String(v) : "anda";

// Dominio pulito: minuscolo, senza protocollo, www e barre.
export const pulisciDominio = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

export const RINNOVO_INCLUDE = {
  cliente: {
    select: { id: true, nome: true, paese: true, smh: true, tipoImposta: true },
  },
  richieste: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: "desc" }],
    include: RICHIESTA_INCLUDE,
  },
} satisfies Prisma.RinnovoSitoInclude;

export type RinnovoConRelazioni = Prisma.RinnovoSitoGetPayload<{
  include: typeof RINNOVO_INCLUDE;
}>;

const UN_GIORNO = 86_400_000;

// Le scadenze sono salvate a mezzanotte UTC: si confrontano per giorno,
// non per istante, così non slittano col fuso.
const giornoUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const oggiUTC = (oggi: Date) => Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
export const giorniAllaScadenza = (scadenza: Date, oggi = new Date()) =>
  Math.round((giornoUTC(scadenza) - oggiUTC(oggi)) / UN_GIORNO);
const stessoGiorno = (a: Date | null | undefined, b: Date) =>
  !!a && giornoUTC(a) === giornoUTC(b);

// Scadenza spostata di un anno (stesso giorno e mese).
export const scadenzaSuccessiva = (scadenza: Date) =>
  new Date(Date.UTC(scadenza.getUTCFullYear() + 1, scadenza.getUTCMonth(), scadenza.getUTCDate()));

export const dataItUTC = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

// Si fattura da qui solo il rinnovo «a parte» di un sito attivo con un prezzo.
export const fatturabile = (r: { fatturazione: string; stato: string; importo: number }) =>
  r.fatturazione === "rinnovo" && r.stato === "attivo" && r.importo > 0;

export function serializzaRinnovo(r: RinnovoConRelazioni, oggi = new Date()) {
  const richieste = r.richieste.map(serializzaRichiesta);
  // La richiesta del ciclo in corso è quella che copre la scadenza attuale
  const richiestaCorrente =
    richieste.find((x) => stessoGiorno(x.rinnovoScadenza, r.scadenza)) ?? null;
  const giorni = giorniAllaScadenza(r.scadenza, oggi);
  const fatt = fatturabile(r);
  const daFatturare = fatt && !richiestaCorrente && giorni <= ANTICIPO_GIORNI;
  return { ...r, richieste, richiestaCorrente, giorni, fatturabile: fatt, daFatturare };
}

export type RinnovoSerializzato = ReturnType<typeof serializzaRinnovo>;

type Tx = Prisma.TransactionClient;

// Crea la richiesta di fattura per la scadenza attuale del rinnovo. Mese e
// anno sono quelli della data di invio (scadenza − anticipo, mai nel
// passato): è il mese in cui la fattura va fatta, come per i contratti.
// Non controlla i doppioni: lo fa chi chiama.
export async function creaRichiestaRinnovo(
  tx: Tx,
  r: {
    id: number;
    dominio: string;
    clienteId: number | null;
    nomeCliente: string | null;
    scadenza: Date;
    importo: number;
    cliente: { tipoImposta: string | null } | null;
  },
  oggi = new Date(),
) {
  let invio = new Date(r.scadenza.getTime() - ANTICIPO_GIORNI * UN_GIORNO);
  if (giornoUTC(invio) < oggiUTC(oggi)) {
    invio = new Date(oggiUTC(oggi));
  }
  const mese = invio.getUTCMonth() + 1;
  const anno = invio.getUTCFullYear();
  const descrizione = `Rinnovo sito web ${r.dominio} — scadenza ${dataItUTC(r.scadenza)}`;
  const voci = [{ descrizione, importo: r.importo }];
  const tipoIva = r.cliente?.tipoImposta === "IGIC 7%" ? "igic7" : "igic_exenta";
  return tx.richiestaFattura.create({
    data: {
      codice: await nextCodiceRichiesta(tx, anno),
      clienteId: r.clienteId,
      nomeCliente: r.clienteId ? null : r.nomeCliente,
      azienda: "Spagna",
      descrizione,
      voci: JSON.stringify(voci),
      ...calcolaImporti(voci, 0, tipoIva),
      tipoIva,
      mese,
      anno,
      dataInvio: invio,
      serieCodice: r.dominio,
      ricorrenza: "annuale",
      validazione: "in_attesa",
      origine: "rinnovo",
      rinnovoId: r.id,
      rinnovoScadenza: r.scadenza,
    },
    include: RICHIESTA_INCLUDE,
  });
}

// Richieste per tutti i rinnovi fatturabili che entrano nell'anticipo e non
// hanno ancora la richiesta della loro scadenza. Usata dal bottone «Genera
// richieste» e dal cron giornaliero: è idempotente. I rinnovi SMH restano
// fuori: la loro richiesta si fa in Northstar.
export async function generaRichiesteInScadenza(oggi = new Date()) {
  const limite = new Date(oggiUTC(oggi) + ANTICIPO_GIORNI * UN_GIORNO);
  const candidati = await prisma.rinnovoSito.findMany({
    where: {
      deletedAt: null,
      fatturazione: "rinnovo",
      canale: "anda",
      stato: "attivo",
      importo: { gt: 0 },
      scadenza: { lte: limite },
      OR: [{ clienteId: { not: null } }, { nomeCliente: { not: null } }],
    },
    include: RINNOVO_INCLUDE,
    orderBy: { scadenza: "asc" },
  });
  const daFare = candidati.filter(
    (r) => !r.richieste.some((x) => stessoGiorno(x.rinnovoScadenza, r.scadenza)),
  );
  const create = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const r of daFare) out.push(await creaRichiestaRinnovo(tx, r, oggi));
    return out;
  });
  return {
    create: create.map((x) => ({ id: x.id, codice: x.codice, rinnovoId: x.rinnovoId })),
    giaFatte: candidati.length - daFare.length,
  };
}

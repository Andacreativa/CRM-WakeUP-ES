import type { Prisma, RichiestaFattura } from "@prisma/client";

// «Da questa in poi» sulle richieste di fattura (fatture da emettere).
//
// Le rate di una serie ricorrente condividono `serieCodice` (il codice della
// prima richiesta, il numero del contratto o il dominio del rinnovo). Quando
// si modifica una rata che ha altre rate dopo di sé, il modulo chiede se la
// modifica vale «Solo questa» o «Da questa in poi»: `allineaSuccessive` è la
// seconda risposta. Stessa funzione, già provata, di Northstar
// (planned-invoices-serie.js); qui adattata a Prisma.
//
// Cosa si copia: tutto quello che il modulo salva (voci, importo, IVA,
// cliente, azienda, responsabile, note), TRANNE quando cade la rata: mese,
// anno e data di invio restano quelli di ogni rata. Le spunte (validazione,
// fatta, incassata) non passano dal modulo e non si toccano.
//
// Cosa non si tocca mai: le rate già fatte (fatturata, collegata a una
// fattura o incassata). Quella fattura è uscita con quell'importo:
// riscriverne la richiesta sarebbe una bugia sul passato.
//
// «Successive» si decide sulla posizione di PRIMA del salvataggio (`prima`),
// perché chi salva può aver spostato anche il mese della rata che modifica.
//
// Questo file importa solo tipi: il test (tests/serie-da-questa-in-poi.test.mjs)
// lo carica direttamente in Node su un database di prova separato.

export type PosizioneRata = Pick<
  RichiestaFattura,
  "id" | "serieCodice" | "anno" | "mese" | "serieIndice" | "createdAt"
>;

// Ordine delle rate: per periodo (anno, mese); a parità di periodo per numero
// di rata, poi per data di creazione, poi per id.
export function confrontaRate(a: PosizioneRata, b: PosizioneRata): number {
  const pa = a.anno * 12 + a.mese;
  const pb = b.anno * 12 + b.mese;
  if (pa !== pb) return pa - pb;
  if (a.serieIndice != null && b.serieIndice != null && a.serieIndice !== b.serieIndice) {
    return a.serieIndice - b.serieIndice;
  }
  const ca = a.createdAt ? a.createdAt.getTime() : 0;
  const cb = b.createdAt ? b.createdAt.getTime() : 0;
  if (ca !== cb) return ca - cb;
  return a.id - b.id;
}

// Le rate della stessa serie che vengono DOPO `prima` (non cancellate), in ordine.
export async function rateSuccessive(
  db: Prisma.TransactionClient,
  prima: PosizioneRata,
): Promise<RichiestaFattura[]> {
  if (!prima.serieCodice) return [];
  const altre = await db.richiestaFattura.findMany({
    where: { serieCodice: prima.serieCodice, deletedAt: null, id: { not: prima.id } },
  });
  return altre.filter((r) => confrontaRate(r, prima) > 0).sort(confrontaRate);
}

export async function contaSuccessive(
  db: Prisma.TransactionClient,
  prima: PosizioneRata,
): Promise<number> {
  return (await rateSuccessive(db, prima)).length;
}

// Già fatta: fatturata (anche con la spunta a mano), collegata a una fattura
// o incassata.
export const giaFatta = (r: Pick<RichiestaFattura, "emessa" | "incassata" | "fatturaId">) =>
  r.emessa || r.incassata || r.fatturaId != null;

// Quello che NON passa mai alle altre rate, qualunque cosa arrivi in `campi`:
// quando cade la rata, la sua identità nella serie, le spunte di stato e i
// collegamenti.
const NON_COPIABILI = new Set<string>([
  "id",
  "codice",
  "mese",
  "anno",
  "dataInvio",
  "serieCodice",
  "serieIndice",
  "serieTotale",
  "ricorrenza",
  "validazione",
  "validataIl",
  "emessa",
  "emessaIl",
  "incassata",
  "fatturaId",
  "fattura",
  "origine",
  "legacyFatturaId",
  "rinnovoId",
  "rinnovo",
  "rinnovoScadenza",
  "createdAt",
  "updatedAt",
  "deletedAt",
]);

export interface EsitoSerie {
  successive: number; // quante rate vengono dopo (fatte comprese)
  aggiornate: number;
  saltate: number; // già fatturate, collegate o incassate: lasciate com'erano
  messaggio: string; // da accodare a «Richiesta aggiornata.»
}

const plurale = (n: number, uno: string, tanti: string) => (n === 1 ? uno : tanti);

export function messaggioSerie(successive: number, aggiornate: number, saltate: number) {
  if (!successive) return "Era l'ultima rata della serie: nessun'altra da aggiornare.";
  const lasciate = saltate
    ? `${saltate} già ${plurale(
        saltate,
        "fatturata o incassata lasciata com'era",
        "fatturate o incassate lasciate com'erano",
      )}`
    : "";
  if (!aggiornate) return `Nessuna rata successiva da aggiornare: ${lasciate}.`;
  return (
    `Stessa modifica su ${aggiornate} ${plurale(aggiornate, "rata successiva", "rate successive")}` +
    (lasciate ? `; ${lasciate}` : "") +
    "."
  );
}

// `campi` è quello che la route ha appena scritto sulla rata (gli stessi
// `data` dell'update): da qui si tolgono i campi non copiabili.
export async function allineaSuccessive(
  db: Prisma.TransactionClient,
  prima: PosizioneRata,
  campi: Prisma.RichiestaFatturaUncheckedUpdateInput,
): Promise<EsitoSerie> {
  const dopo = await rateSuccessive(db, prima);
  const daCopiare: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campi)) {
    if (!NON_COPIABILI.has(k) && v !== undefined) daCopiare[k] = v;
  }

  const daAggiornare = dopo.filter((r) => !giaFatta(r));
  const saltate = dopo.length - daAggiornare.length;
  if (daAggiornare.length && Object.keys(daCopiare).length) {
    await db.richiestaFattura.updateMany({
      where: { id: { in: daAggiornare.map((r) => r.id) } },
      data: daCopiare as Prisma.RichiestaFatturaUncheckedUpdateManyInput,
    });
  }

  return {
    successive: dopo.length,
    aggiornate: daAggiornare.length,
    saltate,
    messaggio: messaggioSerie(dopo.length, daAggiornare.length, saltate),
  };
}

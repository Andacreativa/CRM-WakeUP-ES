// Prova di `allineaSuccessive` (lib/richieste-serie.ts): «Da questa in poi»
// sulle richieste di fattura. Gira su un DATABASE DI PROVA SEPARATO, creato
// sullo stesso server Neon di DATABASE_URL (quello di sviluppo) con la sola
// struttura delle tabelle (pg_dump --schema-only | psql) e cancellato alla
// fine: non tocca i dati di nessuna app e non serve riavviare il server.
// Si rifiuta di partire se DATABASE_URL punta alla produzione.
//
// Uso:  node --experimental-strip-types --disable-warning=ExperimentalWarning \
//         --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
//         tests/serie-da-questa-in-poi.test.mjs [--modulo=<altro file .ts>]
//
// `--modulo` serve alla contro-prova: una copia volutamente rotta della
// funzione deve far FALLIRE il test.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const qui = path.dirname(fileURLToPath(import.meta.url));
const radice = path.resolve(qui, "..");
dotenv.config({ path: path.join(radice, ".env"), quiet: true });

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const modulo = path.resolve(qui, arg("modulo") ?? "../lib/richieste-serie.ts");
const DB_PROVA = "qa_serie_da_questa_in_poi";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL mancante in .env");
  process.exit(2);
}
const base = new URL(process.env.DATABASE_URL);
const prod = process.env.DATABASE_URL_PROD ? new URL(process.env.DATABASE_URL_PROD) : null;
if (prod && prod.host === base.host) {
  console.error("DATABASE_URL punta alla produzione: il test non parte.");
  process.exit(2);
}
const urlProva = new URL(base);
urlProva.pathname = `/${DB_PROVA}`;

const nuovoClient = (url) =>
  new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
const admin = nuovoClient(base.toString());

// pg_dump e psql: in PATH, oppure in PG_BIN, oppure nel libpq di Homebrew.
const pgBin = (nome) => {
  for (const dir of [process.env.PG_BIN, "/opt/homebrew/opt/libpq/bin", "/usr/local/opt/libpq/bin"]) {
    if (dir && existsSync(path.join(dir, nome))) return path.join(dir, nome);
  }
  return nome;
};

console.log(`DB di prova: ${DB_PROVA} su ${base.host} (funzione: ${path.relative(radice, modulo)})`);
await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_PROVA}" WITH (FORCE)`);
await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_PROVA}"`);

let prisma;
let esito = 0;
try {
  // Stesso schema del DB di sviluppo (solo struttura, nessun dato) sul database
  // vuoto. Non si usa `prisma migrate deploy` perché la prima migrazione del
  // repo non crea tutte le tabelle (l'init vero è registrato solo nel DB).
  const schema = execFileSync(pgBin("pg_dump"), [
    "--schema-only", "--no-owner", "--no-privileges", base.toString(),
  ], { stdio: "pipe", maxBuffer: 64 * 1024 * 1024 });
  execFileSync(pgBin("psql"), [
    urlProva.toString(), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-",
  ], { input: schema, stdio: "pipe" });
  prisma = nuovoClient(urlProva.toString());
  const { allineaSuccessive, contaSuccessive } = await import(pathToFileURL(modulo).href);

  // ── Dati finti: serie di 5 rate (giugno–ottobre), la 1 fatturata, la 4 incassata ──
  const ANNO = 2026;
  const c1 = await prisma.cliente.create({ data: { nome: "QA Cliente uno" } });
  const c2 = await prisma.cliente.create({ data: { nome: "QA Cliente due" } });
  const fatturaEmessa = await prisma.fattura.create({
    data: { numero: "QA-1", mese: 6, anno: ANNO, importo: 100 },
  });
  const bozza = await prisma.fattura.create({
    data: { mese: 8, anno: ANNO, importo: 100, stato: "bozza" },
  });
  const rata = (i, extra = {}) => ({
    codice: `RF-QA-000${i}`,
    clienteId: c1.id,
    azienda: "Spagna",
    descrizione: "Canone",
    voci: JSON.stringify([{ descrizione: "Canone", importo: 100 }]),
    imponibile: 100,
    tipoIva: "igic_exenta",
    iva: 0,
    totale: 100,
    mese: 5 + i,
    anno: ANNO,
    dataInvio: new Date(Date.UTC(ANNO, 4 + i, 15, 12)),
    serieCodice: "RF-QA-0001",
    serieIndice: i,
    serieTotale: 5,
    ricorrenza: "mensile",
    responsabile: "Uno",
    note: "vecchia",
    validazione: i === 3 ? "ok" : "in_attesa",
    createdAt: new Date(Date.UTC(ANNO, 0, 1, 0, 0, i)),
    ...extra,
  });
  await prisma.richiestaFattura.createMany({
    data: [
      rata(1, { emessa: true, fatturaId: fatturaEmessa.id }), // prima della 2, e già fatturata
      rata(2),
      rata(3),
      rata(4, { incassata: true }), // dopo, ma già incassata
      rata(5),
      rata(6, { deletedAt: new Date() }), // cancellata: non conta
      rata(7, { serieCodice: "RF-QA-ALTRA", serieIndice: null, serieTotale: null }), // un'altra serie
    ],
  });
  const per = (codice) => prisma.richiestaFattura.findUnique({ where: { codice } });

  // ── A. rata 2, «Da questa in poi» ──
  const prima = await per("RF-QA-0002");
  assert.equal(await contaSuccessive(prisma, prima), 3, "dalla rata 2 vengono dopo 3 rate (3, 4, 5)");
  const campi = {
    clienteId: c2.id,
    nomeCliente: null,
    contrattoId: null,
    azienda: "Italia",
    aziendaNota: null,
    descrizione: "Canone, Extra",
    voci: JSON.stringify([
      { descrizione: "Canone", importo: 100 },
      { descrizione: "Extra", importo: 50 },
    ]),
    imponibile: 150,
    tipoIva: "igic7",
    iva: 7,
    totale: 160.5,
    responsabile: "Due",
    note: "nuova",
    // questi tre NON devono passare alle altre rate
    mese: 12,
    anno: ANNO + 1,
    dataInvio: new Date(Date.UTC(ANNO + 1, 11, 1, 12)),
  };
  // Come la route: salva la rata stessa, poi allinea le successive con la rata com'era
  const esitoA = await prisma.$transaction(async (tx) => {
    await tx.richiestaFattura.update({ where: { id: prima.id }, data: campi });
    return allineaSuccessive(tx, prima, campi);
  });

  const r3 = await per("RF-QA-0003");
  const r5 = await per("RF-QA-0005");
  for (const r of [r3, r5]) {
    assert.equal(r.imponibile, 150, `${r.codice}: importo allineato`);
    assert.equal(JSON.parse(r.voci).length, 2, `${r.codice}: voce aggiunta`);
    assert.equal(r.tipoIva, "igic7", `${r.codice}: tipo IVA allineato`);
    assert.equal(r.iva, 7, `${r.codice}: IVA allineata`);
    assert.equal(r.totale, 160.5, `${r.codice}: totale allineato`);
    assert.equal(r.clienteId, c2.id, `${r.codice}: cliente allineato`);
    assert.equal(r.azienda, "Italia", `${r.codice}: azienda allineata`);
    assert.equal(r.responsabile, "Due", `${r.codice}: responsabile allineato`);
    assert.equal(r.note, "nuova", `${r.codice}: note allineate`);
    assert.equal(r.anno, ANNO, `${r.codice}: anno della rata invariato`);
    assert.equal(r.dataInvio.getUTCDate(), 15, `${r.codice}: giorno di invio invariato`);
  }
  assert.equal(r3.mese, 8, "rata 3: mese invariato");
  assert.equal(r5.mese, 10, "rata 5: mese invariato");
  assert.equal(r3.dataInvio.getUTCMonth() + 1, 8, "rata 3: mese della data di invio invariato");
  assert.equal(r3.validazione, "ok", "rata 3: spunta di validazione intatta");
  assert.equal(r3.serieIndice, 3, "rata 3: numero di rata intatto");

  const intatta = async (codice, perche) => {
    const r = await per(codice);
    assert.equal(r.imponibile, 100, `${codice} (${perche}): importo intatto`);
    assert.equal(r.note, "vecchia", `${codice} (${perche}): note intatte`);
    assert.equal(r.clienteId, c1.id, `${codice} (${perche}): cliente intatto`);
  };
  await intatta("RF-QA-0001", "prima e fatturata");
  await intatta("RF-QA-0004", "incassata");
  await intatta("RF-QA-0006", "cancellata");
  await intatta("RF-QA-0007", "altra serie");
  assert.equal((await per("RF-QA-0004")).incassata, true, "rata 4: spunta incassata intatta");

  assert.equal(esitoA.successive, 3, "A: 3 rate successive");
  assert.equal(esitoA.aggiornate, 2, "A: aggiornate 2");
  assert.equal(esitoA.saltate, 1, "A: saltata 1 (la incassata)");
  assert.match(esitoA.messaggio, /2 rate successive; 1 già fatturata o incassata/, "A: messaggio");
  console.log("OK  A. rata 2 «Da questa in poi»:", esitoA.messaggio);

  // ── B. una rata collegata a una fattura (anche bozza, non ancora emessa) non si tocca ──
  // La rata 2 qui sopra è finita a dicembre dell'anno dopo (il modulo salva anche
  // il mese): la si rimette a luglio, altrimenti sarebbe lei a venire dopo la 5.
  await prisma.richiestaFattura.update({ where: { id: prima.id }, data: { mese: 7, anno: ANNO } });
  await prisma.richiestaFattura.update({ where: { codice: "RF-QA-0003" }, data: { fatturaId: bozza.id } });
  const esitoB = await allineaSuccessive(prisma, await per("RF-QA-0002"), { note: "seconda" });
  assert.equal(esitoB.aggiornate, 1, "B: aggiornata solo la 5");
  assert.equal(esitoB.saltate, 2, "B: saltate la 3 (collegata) e la 4 (incassata)");
  assert.equal((await per("RF-QA-0005")).note, "seconda", "B: rata 5 aggiornata");
  assert.equal((await per("RF-QA-0003")).note, "nuova", "B: rata 3 collegata intatta");
  console.log("OK  B. rata collegata a una bozza saltata:", esitoB.messaggio);

  // ── C. ultima rata: niente da aggiornare, e lo dice ──
  const esitoC = await allineaSuccessive(prisma, await per("RF-QA-0005"), { note: "ancora" });
  assert.equal(esitoC.successive, 0, "C: nessuna successiva");
  assert.equal(esitoC.aggiornate, 0, "C: nessuna aggiornata");
  assert.match(esitoC.messaggio, /ultima rata/, "C: messaggio dell'ultima rata");
  assert.equal(await contaSuccessive(prisma, await per("RF-QA-0005")), 0, "C: il conteggio per la finestrella è 0");
  console.log("OK  C. ultima rata:", esitoC.messaggio);

  // ── D. riga senza serie: la funzione non fa niente ──
  const esitoD = await allineaSuccessive(prisma, { ...prima, serieCodice: null }, { note: "x" });
  assert.equal(esitoD.aggiornate, 0, "D: senza serie niente");
  assert.equal((await per("RF-QA-0005")).note, "seconda", "D: rata 5 non toccata");

  // ── E. tutte le successive già fatte: 0 aggiornate, N saltate ──
  await prisma.richiestaFattura.update({ where: { codice: "RF-QA-0005" }, data: { emessa: true } });
  const esitoE = await allineaSuccessive(prisma, await per("RF-QA-0002"), { note: "terza" });
  assert.equal(esitoE.aggiornate, 0, "E: nessuna aggiornata");
  assert.equal(esitoE.saltate, 3, "E: 3 saltate");
  assert.match(esitoE.messaggio, /Nessuna rata successiva da aggiornare: 3 già/, "E: messaggio");
  console.log("OK  E. tutte già fatte:", esitoE.messaggio);

  // ── F. stesso mese: l'ordine lo dà il numero di rata ──
  await prisma.richiestaFattura.createMany({
    data: [
      rata(8, { serieCodice: "RF-QA-MESE", serieIndice: 1, serieTotale: 2, mese: 3 }),
      rata(9, { serieCodice: "RF-QA-MESE", serieIndice: 2, serieTotale: 2, mese: 3 }),
    ],
  });
  assert.equal(await contaSuccessive(prisma, await per("RF-QA-0008")), 1, "F: dalla 1 di 2 viene dopo la 2");
  assert.equal(await contaSuccessive(prisma, await per("RF-QA-0009")), 0, "F: la 2 di 2 è l'ultima");

  console.log("OK  allineaSuccessive: tutti i controlli superati");
} catch (e) {
  console.error("FAIL", e.message);
  if (e.stdout || e.stderr) console.error(String(e.stdout || ""), String(e.stderr || ""));
  esito = 1;
} finally {
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_PROVA}" WITH (FORCE)`);
  await admin.$disconnect();
  console.log("pulizia: database di prova cancellato");
}
process.exit(esito);

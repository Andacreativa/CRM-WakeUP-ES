// Prova di scripts/collega-rettificativa.mjs su un database usa e getta creato
// sullo stesso server Neon di DATABASE_URL (sviluppo) con la sola struttura
// delle tabelle, cancellato alla fine. Si rifiuta se DATABASE_URL è la prod.
// Uso: node tests/collega-rettificativa.test.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const qui = path.dirname(fileURLToPath(import.meta.url));
const radice = path.resolve(qui, "..");
dotenv.config({ path: path.join(radice, ".env"), quiet: true });
const script = path.join(radice, "scripts", "collega-rettificativa.mjs");
const DB_PROVA = "qa_collega_rettificativa";

const base = new URL(process.env.DATABASE_URL);
const prod = process.env.DATABASE_URL_PROD ? new URL(process.env.DATABASE_URL_PROD) : null;
if (prod && prod.host === base.host) {
  console.error("DATABASE_URL punta alla produzione: il test non parte.");
  process.exit(2);
}
const urlProva = new URL(base);
urlProva.pathname = `/${DB_PROVA}`;
const nuovoClient = (url) => new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
const admin = nuovoClient(base.toString());
const pgBin = (nome) => {
  for (const dir of [process.env.PG_BIN, "/opt/homebrew/opt/libpq/bin", "/usr/local/opt/libpq/bin"]) {
    if (dir && existsSync(path.join(dir, nome))) return path.join(dir, nome);
  }
  return nome;
};

// Lancia lo script sul DB di prova; torna { status, out }
const lancia = (...args) => {
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      env: { ...process.env, DATABASE_URL: urlProva.toString() },
      stdio: "pipe",
      encoding: "utf8",
    });
    return { status: 0, out };
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
let falliti = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "ok " : "KO "} ${msg}`);
  if (!cond) falliti++;
};

console.log(`DB di prova: ${DB_PROVA} su ${base.host}`);
await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_PROVA}" WITH (FORCE)`);
await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_PROVA}"`);
let prisma;
try {
  const schema = execFileSync(pgBin("pg_dump"), ["--schema-only", "--no-owner", "--no-privileges", base.toString()], {
    stdio: "pipe",
    maxBuffer: 64 * 1024 * 1024,
  });
  execFileSync(pgBin("psql"), [urlProva.toString(), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: schema,
    stdio: "pipe",
  });
  prisma = nuovoClient(urlProva.toString());

  // ── Dati finti ────────────────────────────────────────────────────────────
  const c1 = await prisma.cliente.create({ data: { nome: "QA Judo" } });
  const c2 = await prisma.cliente.create({ data: { nome: "QA Altro" } });
  const emessa = (numero, importo, clienteId, extra = {}) => ({
    numero, importo, clienteId, mese: 10, anno: 2026, stato: "emessa", tipoIva: "igic_exenta", iva: 0,
    data: new Date("2026-10-06"), scadenza: new Date("2026-11-05"), emessaIl: new Date(), ...extra,
  });
  // Caso vero: F da 750 senza incassi, R da 375 incassata (acconto da banca)
  const f1 = await prisma.fattura.create({ data: emessa("QA-F1", 750, c1.id) });
  const r1 = await prisma.fattura.create({
    data: emessa("QA-R1", 375, c1.id, { pagato: true, data: new Date("2026-11-06"), mese: 11 }),
  });
  await prisma.acconto.create({ data: { fatturaId: r1.id, importo: 375, data: new Date("2026-11-06"), note: "Incasso da banca" } });
  // Casi da rifiutare
  const f2 = await prisma.fattura.create({ data: emessa("QA-F2", 100, c1.id) });
  await prisma.acconto.create({ data: { fatturaId: f2.id, importo: 50, data: new Date() } });
  await prisma.fattura.create({ data: emessa("QA-R2", 80, c1.id) });
  await prisma.fattura.create({ data: emessa("QA-F3", 100, c2.id) });
  await prisma.fattura.create({ data: emessa("QA-R3", 80, c1.id) });
  await prisma.fattura.create({ data: emessa("QA-F4", 100, c1.id) });
  await prisma.fattura.create({ data: { ...emessa("QA-R4", 80, c1.id), stato: "bozza", numero: null } });
  const leggi = (numero) => prisma.fattura.findFirst({ where: { numero }, include: { rettifiche: true } });

  // ── 1. Prova a vuoto: niente cambia ──────────────────────────────────────
  let r = lancia("--originale=QA-F1", "--rettificativa=QA-R1");
  check(r.status === 0, `prova a vuoto esce con 0 (${r.status})`);
  check(r.out.includes("niente scritto"), "prova a vuoto dice che non ha scritto");
  check(!(await leggi("QA-F1")).annullata && !(await leggi("QA-R1")).rettificaDiId, "prova a vuoto non ha toccato il DB");

  // ── 2. Applicazione: R collegata per sostituzione, F «Rettificata» ───────
  r = lancia("--originale=QA-F1", "--rettificativa=QA-R1", "--apply");
  check(r.status === 0, `--apply esce con 0 (${r.status})`);
  check(r.out.includes("OK: collegate"), "--apply conferma il collegamento");
  const f1d = await leggi("QA-F1");
  const r1d = await leggi("QA-R1");
  check(f1d.annullata && f1d.annullataIl, "F1 annullata con data");
  check(r1d.rettificaDiId === f1.id && r1d.tipoRettifica === "S" && r1d.tipoFattura === "R1", "R1 collegata, S, R1");
  check(r1d.pagato && r1d.importo === 375 && !r1d.annullata, "R1 resta incassata da 375, non annullata");
  // sostituita() di lib/fatture.ts: annullata + rettifica S emessa non annullata
  check(f1d.rettifiche.some((x) => x.stato === "emessa" && x.tipoRettifica === "S" && !x.annullata), "F1 risulta «sostituita» per lib/fatture.ts");

  // ── 3. Seconda volta: rifiuta (già collegate) ────────────────────────────
  r = lancia("--originale=QA-F1", "--rettificativa=QA-R1", "--apply");
  check(r.status === 1 && r.out.includes("già annullata"), "ripetere lo script viene rifiutato");

  // ── 4. Rifiuti: incassi sull'originale, clienti diversi, R non emessa, motivo sbagliato ──
  r = lancia("--originale=QA-F2", "--rettificativa=QA-R2", "--apply");
  check(r.status === 1 && r.out.includes("ha incassi"), "originale con incassi rifiutata");
  check(!(await leggi("QA-F2")).annullata && !(await leggi("QA-R2")).rettificaDiId, "rifiuto non scrive nulla");
  r = lancia("--originale=QA-F3", "--rettificativa=QA-R3", "--apply");
  check(r.status === 1 && r.out.includes("clienti diversi"), "clienti diversi rifiutati");
  r = lancia("--originale=QA-F4", "--rettificativa=QA-R1", "--apply");
  check(r.status === 1 && r.out.includes("già collegata"), "R già collegata rifiutata");
  r = lancia("--originale=QA-F4", "--rettificativa=QA-NON-ESISTE", "--apply");
  check(r.status === 1 && r.out.includes("non trovata"), "numero inesistente rifiutato");
  r = lancia("--originale=QA-F4", "--rettificativa=QA-R3", "--motivo=R9");
  check(r.status === 2, "motivo non valido rifiutato");
  // ── 5. Motivo scelto ──────────────────────────────────────────────────────
  r = lancia("--originale=QA-F4", "--rettificativa=QA-R3", "--motivo=R4", "--apply");
  check(r.status === 0 && (await leggi("QA-R3")).tipoFattura === "R4", "--motivo=R4 rispettato");
} finally {
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_PROVA}" WITH (FORCE)`);
  await admin.$disconnect();
}
console.log(falliti ? `\n${falliti} controlli falliti` : "\nTutti i controlli passano");
process.exit(falliti ? 1 : 0);

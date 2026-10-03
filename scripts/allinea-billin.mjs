// Allinea il registro a Billin, da dove le fatture sono state emesse finora:
//   1) imponibile delle fatture al 7 % registrate col totale (IGIC incluso);
//   2) data delle fatture registrate col giorno sbagliato;
//   3) email e indirizzo dei clienti, solo dove in anagrafica mancano.
// Billin si legge soltanto (BILLIN_CLIENT_ID / BILLIN_CLIENT_SECRET nel .env).
// Stampa cosa farebbe; senza --apply non scrive.
// Uso: node scripts/allinea-billin.mjs [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

// ── Billin, in sola lettura ────────────────────────────────────────────────
const API = "https://api.billin.net";
const tok = await fetch(`${API}/v1/auth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grantType: "client_credentials",
    clientId: process.env.BILLIN_CLIENT_ID,
    clientSecret: process.env.BILLIN_CLIENT_SECRET,
  }),
});
if (!tok.ok) {
  console.log(`Billin non risponde al login (${tok.status}): controllare le chiavi API nel .env.`);
  process.exit(1);
}
const { accessToken } = await tok.json();
const tutte = async (path, extra = "") => {
  const out = [];
  for (let off = 0; ; off += 100) {
    const r = await fetch(`${API}${path}?limit=100&offset=${off}${extra}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    const j = await r.json();
    out.push(...j.items);
    if (out.length >= j.count || j.items.length === 0) return out;
  }
};
const billin = [
  ...(await tutte("/v1/invoices")),
  ...(await tutte("/v1/invoices", "&query[getVerifactuInvoices]=true")),
];
const contatti = await tutte("/v1/contacts");
console.log(`Billin: ${billin.length} fatture, ${contatti.length} contatti\n`);

const round2 = (n) => Math.round(n * 100) / 100;
const numero = (f) => f.identifier ?? `${f.serialCode ?? ""}${f.code ?? ""}`;
const base = (f) => round2((f.lines ?? []).reduce((s, l) => s + (l.taxBase ?? l.subtotal ?? 0), 0));
const perNumero = new Map(billin.map((f) => [numero(f), f]));

// ── 1 e 2: fatture ─────────────────────────────────────────────────────────
const nostre = await prisma.fattura.findMany({
  where: { origine: { not: "sales" }, stato: "emessa", numero: { not: null }, vfStato: null },
  select: {
    id: true,
    numero: true,
    importo: true,
    tipoIva: true,
    data: true,
    commercialeId: true,
    _count: { select: { commissioni: true } },
  },
  orderBy: { id: "asc" },
});
const importi = [];
const date = [];
const altre = [];
for (const f of nostre) {
  const b = perNumero.get(f.numero);
  if (!b) continue;
  const netto = base(b);
  const lordo = round2(b.total?.totalAmount ?? netto);
  if (Math.abs(f.importo - netto) > 0.01) {
    // Registrata col totale: l'imponibile è quello senza IGIC
    if (f.tipoIva === "igic7" && Math.abs(f.importo - lordo) < 0.01) importi.push({ f, netto, lordo });
    else altre.push(`${f.numero}: da noi ${f.importo} €, in Billin ${netto} € (stato ${b.status})`);
  }
  if (f.data && b.issuedDate) {
    const giusta = new Date(`${b.issuedDate}T00:00:00.000Z`);
    if (f.data.getTime() !== giusta.getTime()) date.push({ f, giusta });
  }
}

console.log(`1) Imponibile delle fatture al 7 % registrate col totale: ${importi.length}`);
for (const { f, netto, lordo } of importi) {
  console.log(
    `   ${f.numero}: ${f.importo} € → ${netto} € (totale con IGIC ${lordo} €)` +
      (f._count.commissioni ? "  ATTENZIONE: ha una commissione calcolata sul vecchio importo" : ""),
  );
}
console.log(`\n2) Date da allineare a Billin: ${date.length}`);
for (const { f, giusta } of date) {
  console.log(`   ${f.numero}: ${f.data.toISOString()} → ${giusta.toISOString()}`);
}
if (altre.length) {
  console.log("\n   Importi diversi che NON tocco (da guardare a mano):");
  for (const a of altre) console.log(`   ${a}`);
}

// ── 3: anagrafica ──────────────────────────────────────────────────────────
const norm = (s) => String(s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const senzaPrefisso = (s) => norm(s).replace(/^[A-Z]{2}(?=[A-Z0-9]{8,})/, "");
const perPiva = new Map();
for (const c of contatti) {
  if (!c.vatNumber) continue;
  perPiva.set(norm(c.vatNumber), c);
  perPiva.set(senzaPrefisso(c.vatNumber), c);
}
const clienti = await prisma.cliente.findMany({
  select: { id: true, nome: true, partitaIva: true, email: true, via: true, cap: true, citta: true },
  orderBy: { nome: "asc" },
});
// Una casella PEC riceve solo posta certificata: non va bene per «Invia via mail»
const pec = (e) => /@(.*\.)?(pec|legalmail|postacert|arubapec|pecimprese)\./i.test(e) || /@pec\./i.test(e);
const anagrafica = [];
const casellePec = [];
for (const c of clienti) {
  if (!c.partitaIva) continue;
  const b = perPiva.get(norm(c.partitaIva)) ?? perPiva.get(senzaPrefisso(c.partitaIva));
  if (!b) continue;
  const a = b.address ?? {};
  const email = b.email ? String(b.email).trim() : "";
  if (!c.email && email && pec(email)) casellePec.push(`${c.nome}: ${email}`);
  const patch = {
    ...(!c.email && email && !pec(email) ? { email } : {}),
    ...(!c.via && a.postalAddress ? { via: String(a.postalAddress).trim() } : {}),
    ...(!c.cap && a.postalCode ? { cap: String(a.postalCode).trim() } : {}),
    ...(!c.citta && a.city ? { citta: String(a.city).trim() } : {}),
  };
  if (Object.keys(patch).length) anagrafica.push({ c, patch });
}
console.log(`\n3) Clienti da completare con i dati di Billin: ${anagrafica.length}`);
for (const { c, patch } of anagrafica) {
  console.log(`   ${c.nome}: ${Object.entries(patch).map(([k, v]) => `${k} = ${v}`).join(" · ")}`);
}

if (casellePec.length) {
  console.log("\n   Email di Billin che NON copio perché sono caselle PEC:");
  for (const x of casellePec) console.log(`   ${x}`);
}

if (!apply) {
  console.log("\nNiente scritto. Per applicare: --apply");
} else {
  for (const { f, netto } of importi) {
    await prisma.fattura.update({ where: { id: f.id }, data: { importo: netto } });
  }
  for (const { f, giusta } of date) {
    await prisma.fattura.update({ where: { id: f.id }, data: { data: giusta } });
  }
  for (const { c, patch } of anagrafica) {
    await prisma.cliente.update({ where: { id: c.id }, data: patch });
  }
  console.log(
    `\nApplicato: ${importi.length} importi, ${date.length} date, ${anagrafica.length} clienti completati.`,
  );
}
await prisma.$disconnect();

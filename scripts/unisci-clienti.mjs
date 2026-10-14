// Unisce due anagrafiche dello stesso cliente (es. «ASD JUDO AZZANESE» creato
// dall'import accanto a «Judo Azzanese»): fatture, richieste, contratti,
// rinnovi, referenti e lead del doppione passano al cliente che resta; i
// campi vuoti di quello che resta si completano col doppione (con --prendi
// si prende dal doppione anche un campo già pieno); il doppione, ormai
// vuoto, si elimina e i suoi dati restano stampati qui sotto.
// Senza --tieni/--togli elenca i probabili doppioni. Senza --apply non scrive.
// Uso: node scripts/unisci-clienti.mjs
//      node scripts/unisci-clienti.mjs --tieni=72 --togli=95 [--nome="ASD Judo Azzanese"] [--prendi=partitaIva,via] [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const apply = process.argv.includes("--apply");
const tieniId = arg("tieni") ? parseInt(arg("tieni"), 10) : null;
const togliId = arg("togli") ? parseInt(arg("togli"), 10) : null;
const nuovoNome = arg("nome")?.trim() || null;
const prendi = new Set((arg("prendi") ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

// Stesse regole di lib/doppioni.ts
const FORME = new Set([
  "srl", "srls", "sas", "snc", "spa", "sl", "slu", "sa", "scp", "ltd", "limited", "di", "de", "e", "c",
  "sociedad", "limitada", "societa", "responsabilita", "unipersonale",
  "asd", "ssd", "ssdrl", "ssdarl", "aps", "ets", "odv", "onlus",
  "associazione", "sportiva", "dilettantistica",
]);
const normNome = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !FORME.has(t))
    .join(" ");
const normPiva = (s) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(IT|ES|FR|DE|PT|GB|IE|NL|BE|LU|AT|PIVA)(?=[A-Z0-9]{8,})/, "");

const RELAZIONI = ["fattura", "richiestaFattura", "contratto", "rinnovoSito", "contatto", "lead"];
const NOMI = {
  fattura: "fatture",
  richiestaFattura: "richieste",
  contratto: "contratti",
  rinnovoSito: "rinnovi",
  contatto: "referenti",
  lead: "lead",
};
const CAMPI = ["paese", "email", "telefono", "partitaIva", "via", "cap", "citta", "provincia", "iban", "tipoImposta", "note"];

const conteggi = async (id) => {
  const out = {};
  for (const m of RELAZIONI) out[m] = await prisma[m].count({ where: { clienteId: id } });
  return out;
};
const riassunto = (n) =>
  RELAZIONI.filter((m) => n[m]).map((m) => `${n[m]} ${NOMI[m]}`).join(", ") || "niente collegato";
const vuoto = (v) => v == null || String(v).trim() === "";

if (!tieniId || !togliId) {
  // ── Elenco dei probabili doppioni ──────────────────────────────────────
  const clienti = await prisma.cliente.findMany({ orderBy: { id: "asc" } });
  const gruppi = new Map();
  for (const c of clienti) {
    const chiavi = [];
    const p = normPiva(c.partitaIva);
    if (p.length >= 8) chiavi.push(`piva:${p}`);
    const n = normNome(c.nome);
    if (n.length >= 3) chiavi.push(`nome:${n}`);
    for (const k of chiavi) gruppi.set(k, [...(gruppi.get(k) ?? []), c]);
  }
  const visti = new Set();
  let n = 0;
  for (const [k, cs] of gruppi) {
    if (cs.length < 2) continue;
    const firma = cs.map((c) => c.id).join(",");
    if (visti.has(firma)) continue;
    visti.add(firma);
    n++;
    console.log(`${k.startsWith("piva") ? "Stessa P.IVA" : "Stesso nome"} (${k.slice(5)}):`);
    for (const c of cs) {
      console.log(
        `   #${c.id} ${c.nome} · P.IVA ${c.partitaIva ?? "—"} · ${c.paese} · creato ${c.createdAt.toISOString().slice(0, 10)} · ${riassunto(await conteggi(c.id))}`,
      );
    }
  }
  console.log(n ? `\n${n} gruppi di probabili doppioni.` : "Nessun probabile doppione.");
  await prisma.$disconnect();
  process.exit(0);
}

// ── Unione di due clienti ────────────────────────────────────────────────
const [tieni, togli] = await Promise.all([
  prisma.cliente.findUnique({ where: { id: tieniId } }),
  prisma.cliente.findUnique({ where: { id: togliId } }),
]);
if (!tieni || !togli || tieniId === togliId) {
  console.error("Clienti non trovati (o uguali): controlla --tieni e --togli.");
  process.exit(1);
}
console.log(`Resta:    #${tieni.id} ${tieni.nome}`);
console.log(`Doppione: #${togli.id} ${togli.nome}\n`);

const patch = {};
const conflitti = [];
if (nuovoNome && nuovoNome !== tieni.nome) patch.nome = nuovoNome;
for (const k of CAMPI) {
  const a = tieni[k];
  const b = togli[k];
  if (vuoto(b) || String(a ?? "").trim() === String(b).trim()) continue;
  if (k === "note" && !vuoto(a)) patch.note = `${a}\n${b}`;
  else if (vuoto(a) || prendi.has(k)) patch[k] = b;
  else conflitti.push(`${k}: resta «${a}», il doppione ha «${b}» (per prenderlo: --prendi=${k})`);
}
if (togli.smh && !tieni.smh) patch.smh = true;

console.log("Campi del cliente che resta:");
if (Object.keys(patch).length === 0) console.log("   nessuna modifica");
for (const [k, v] of Object.entries(patch)) console.log(`   ${k}: «${tieni[k] ?? ""}» → «${v}»`);
if (conflitti.length) {
  console.log("\nValori diversi (resta quello del cliente che resta):");
  for (const c of conflitti) console.log(`   ${c}`);
}

const nTogli = await conteggi(togliId);
console.log(`\nDal doppione passano: ${riassunto(nTogli)}`);
const fatture = await prisma.fattura.findMany({
  where: { clienteId: togliId },
  select: { numero: true, data: true, importo: true, origine: true, annullata: true },
  orderBy: { id: "asc" },
});
for (const f of fatture) {
  console.log(
    `   fattura ${f.numero ?? "(senza numero)"} · ${f.data?.toISOString().slice(0, 10) ?? "—"} · ${f.importo} €${f.origine === "sales" ? " · vecchia sales" : ""}${f.annullata ? " · annullata" : ""}`,
  );
}
console.log(`Il cliente che resta ha già: ${riassunto(await conteggi(tieniId))}`);
console.log(`\nDati del doppione #${togli.id} (poi eliminato):\n${JSON.stringify(togli, null, 2)}`);

if (!apply) {
  console.log("\nNiente scritto. Per applicare: --apply");
} else {
  await prisma.$transaction(async (tx) => {
    for (const m of RELAZIONI) {
      await tx[m].updateMany({ where: { clienteId: togliId }, data: { clienteId: tieniId } });
    }
    if (Object.keys(patch).length) await tx.cliente.update({ where: { id: tieniId }, data: patch });
    const resto = {};
    for (const m of RELAZIONI) resto[m] = await tx[m].count({ where: { clienteId: togliId } });
    if (Object.values(resto).some(Boolean)) throw new Error(`Il doppione ha ancora: ${riassunto(resto)}`);
    await tx.cliente.delete({ where: { id: togliId } });
  });
  console.log(`\nApplicato: #${togli.id} unito in #${tieni.id}. Ora #${tieni.id} ha: ${riassunto(await conteggi(tieniId))}`);
}
await prisma.$disconnect();

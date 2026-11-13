// Decisioni prese con l'utente il 2026-11-13 dopo il controllo fatture e
// altri ingressi contro la banca:
//  1. via gli altri ingressi registrati a mano che la banca ha poi creato
//     di nuovo (cashback gennaio #1 e febbraio #2, rimborso AEAT #58);
//  2. F202641 (Hoopygang, 800 €) senza data: 20/4/2026 come le vicine;
//  3. le 5 fatture 2025 di Il Calice sono in mano agli avvocati: restano
//     da incassare ma escono dalle scadute (scadenza tolta, annotata in un
//     sollecito «altro» così resta traccia);
//  4. le richieste «legacy» di Sales segnate incassate senza fattura si
//     collegano alla fattura vera già pagata (dopo aver unito i clienti
//     doppi con scripts/unisci-clienti.mjs: Gelidus → Zulianello,
//     Abitare Cattai → Cattai Aldo).
// Salva un JSON di quello che tocca. Senza --apply non scrive.
// Uso: node scripts/sistema-controllo-incassi.mjs [--apply]
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);
const eur = (n) => (n ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €";
const dd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
const it = (d) => (d ? new Date(d).toLocaleDateString("it-IT", { timeZone: "UTC" }) : "—");
let errori = 0;
const salva = { altriIngressi: [], fattura641: null, calice: [], richieste: [] };

// 1. altri ingressi doppi (a mano)
console.log("=== 1. Altri ingressi a mano doppi della banca ===");
const ALTRI = [
  { id: 1, importo: 60, fonte: "BBVA" },
  { id: 2, importo: 60, fonte: "BBVA" },
  { id: 58, importo: 45.6, fonte: "Devoluzione AEAT" },
];
const altri = await prisma.altroIngresso.findMany({ where: { id: { in: ALTRI.map((a) => a.id) } }, include: { abbinamentiBancari: true } });
const altriVia = [];
for (const a of ALTRI) {
  const r = altri.find((x) => x.id === a.id);
  if (!r) { console.log(`  #${a.id}: non c'è più`); continue; }
  if (Math.abs(r.importo - a.importo) > 0.001 || !r.fonte.startsWith(a.fonte) || r.abbinamentiBancari.length) { console.log(`  !! #${a.id} non è quello atteso (${r.importo} ${r.fonte}, link ${r.abbinamentiBancari.length}): salto`); errori++; continue; }
  console.log(`  CANCELLO #${r.id} ${r.anno}-${String(r.mese).padStart(2, "0")} ${eur(r.importo)} ${r.fonte} · ${r.descrizione ?? ""}`);
  altriVia.push(r);
}
salva.altriIngressi = altriVia;

// 2. F202641 senza data
console.log("\n=== 2. F202641 senza data ===");
const f641 = await prisma.fattura.findFirst({ where: { numero: "F202641" }, include: { cliente: { select: { nome: true } } } });
const DATA_641 = new Date(Date.UTC(2026, 3, 20));
if (!f641) { console.log("  non trovata"); errori++; }
else if (f641.data) console.log(`  ha già la data ${dd(f641.data)}: non tocco`);
else { console.log(`  F202641 #${f641.id} ${f641.cliente?.nome} ${eur(f641.importo)}: data → ${dd(DATA_641)} (mese ${f641.mese}/${f641.anno}, scadenza ${dd(f641.scadenza)} invariata)`); salva.fattura641 = { id: f641.id, data: null }; }

// 3. Il Calice: fuori dalle scadute
console.log("\n=== 3. Il Calice 2025: in mano agli avvocati, fuori dalle scadute ===");
const calice = await prisma.fattura.findMany({
  where: { numero: { in: ["F20255", "F20256", "F202512", "F202522", "F202524"] }, pagato: false, annullata: false },
  include: { cliente: { select: { nome: true } }, solleciti: true, acconti: true },
  orderBy: { data: "asc" },
});
const NOTA_CALICE = (f) => `Pratica passata agli avvocati: tolta dalle scadenze (scadenza originale ${it(f.scadenza)})`;
for (const f of calice) {
  if (!/Calice/i.test(f.cliente?.nome ?? "")) { console.log(`  !! ${f.numero} non è di Il Calice: salto`); errori++; continue; }
  const gia = f.solleciti.some((s) => /avvocati/i.test(s.nota ?? ""));
  if (!f.scadenza && gia) { console.log(`  ${f.numero} #${f.id}: già fuori dalle scadute, nota presente`); continue; }
  console.log(`  ${f.numero} #${f.id} ${dd(f.data)} ${eur(f.importo)}${f.acconti.length ? ` (acconti ${eur(f.acconti.reduce((s, a) => s + a.importo, 0))})` : ""}: scadenza ${dd(f.scadenza)} → nessuna${gia ? ", nota già presente" : ", + nota «avvocati»"}`);
  salva.calice.push({ id: f.id, numero: f.numero, scadenza: f.scadenza, aggiungiNota: !gia });
}
if (calice.length !== 5) { console.log(`  !! attese 5 fatture, trovate ${calice.length}`); errori++; }
// (le fatture già sistemate restano fuori da salva.calice: il riepilogo conta solo quelle da fare)

// 4. richieste legacy → fattura vera
console.log("\n=== 4. Richieste legacy → fattura vera ===");
const MAPPA = { "RF-2026-0002": "F202654", "RF-2026-0004": "F202663", "RF-2026-0005": "F202662", "RF-2026-0007": "F202667", "RF-2026-0009": "F202668", "RF-2026-0010": "F202675", "RF-2026-0012": "F202679", "RF-2026-0015": "F202688" };
const rich = await prisma.richiestaFattura.findMany({ where: { codice: { in: Object.keys(MAPPA) } }, include: { cliente: { select: { id: true, nome: true } } }, orderBy: { codice: "asc" } });
const fatt = await prisma.fattura.findMany({ where: { numero: { in: Object.values(MAPPA) }, stato: "emessa", annullata: false, origine: { not: "sales" } }, include: { cliente: { select: { id: true, nome: true } }, richiesta: { select: { codice: true } } } });
for (const codice of Object.keys(MAPPA)) {
  const r = rich.find((x) => x.codice === codice);
  const f = fatt.find((x) => x.numero === MAPPA[codice]);
  if (!r || !f) { console.log(`  !! ${codice} → ${MAPPA[codice]}: ${!r ? "richiesta" : "fattura"} non trovata`); errori++; continue; }
  if (r.fatturaId) { console.log(`  ${codice} già collegata alla fattura #${r.fatturaId}`); continue; }
  if (f.richiesta) { console.log(`  !! ${MAPPA[codice]} ha già la richiesta ${f.richiesta.codice}: salto`); errori++; continue; }
  if (Math.abs(r.totale - f.importo) > 0.011 && Math.abs(r.imponibile - f.importo) > 0.011) { console.log(`  !! ${codice} ${eur(r.totale)} ≠ ${MAPPA[codice]} ${eur(f.importo)}: salto`); errori++; continue; }
  if (r.clienteId !== f.clienteId) { console.log(`  !! ${codice} cliente #${r.clienteId} ${r.cliente?.nome} ≠ fattura cliente #${f.clienteId} ${f.cliente?.nome}: prima unisci i clienti (scripts/unisci-clienti.mjs); salto`); errori++; continue; }
  console.log(`  ${codice} ${r.cliente?.nome} ${eur(r.totale)} → ${f.numero} #${f.id}`);
  salva.richieste.push({ id: r.id, codice, fatturaId: f.id });
}

console.log(`\nRiepilogo: ${altriVia.length} altri ingressi da cancellare, F202641 ${salva.fattura641 ? "da datare" : "ok"}, ${salva.calice.length} fatture Il Calice da togliere dalle scadute, ${salva.richieste.length} richieste da collegare${errori ? `, ${errori} casi SALTATI` : ""}`);
if (!apply) { console.log("\nProva finita: nessuna scrittura. Aggiungi --apply per applicare."); await prisma.$disconnect(); process.exit(0); }

const dir = `${process.env.HOME}/Desktop/APP/leo_finance_backup`;
mkdirSync(dir, { recursive: true });
const file = `${dir}/controllo-incassi_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}_${host.split(".")[0]}.json`;
writeFileSync(file, JSON.stringify(salva, null, 2));
console.log(`\nSalvato prima di scrivere: ${file}`);
await prisma.$transaction(async (tx) => {
  if (altriVia.length) await tx.altroIngresso.deleteMany({ where: { id: { in: altriVia.map((a) => a.id) } } });
  if (salva.fattura641) await tx.fattura.update({ where: { id: salva.fattura641.id }, data: { data: DATA_641 } });
  for (const c of salva.calice) {
    await tx.fattura.update({ where: { id: c.id }, data: { scadenza: null } });
    if (c.aggiungiNota) await tx.sollecito.create({ data: { fatturaId: c.id, canale: "altro", nota: NOTA_CALICE(c) } });
  }
  for (const r of salva.richieste) await tx.richiestaFattura.update({ where: { id: r.id }, data: { fatturaId: r.fatturaId, emessa: true, incassata: true } });
});
console.log("Fatto.");
await prisma.$disconnect();

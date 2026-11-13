// I «TRASPASO» verso la carta aziendale (…0244) sono ricariche dal conto
// alla carta: giroconti, non spese (regola dell'utente, 2026-11-13).
// Questo script:
//  1. toglie le spese «Carta Aziendale» nate dai TRASPASO o abbinate a
//     essi; se la spesa è una «quota mensile» la riaggancia all'ADEUDO
//     MENSUAL dello stesso mese rimasto da abbinare, invece di cancellarla;
//  2. mette i movimenti TRASPASO in «escluso»;
//  3. aggiorna la regola salvata in Banca › Impostazioni (TRASPASO →
//     escludi; l'addebito mensile resta «Carta Aziendale»).
// Con --anche-2025 cancella anche i «Caricamento Carta Aziendale» a mano
// del 2025 (stessa natura, mai passati dalla banca).
// Prima salva in JSON quello che cancella. Senza --apply non scrive.
// Uso: node scripts/sistema-traspaso.mjs [--apply] [--anche-2025]
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const anche2025 = process.argv.includes("--anche-2025");
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

const eur = (n) => (n ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €";
const dd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
const NOTA = "Ricarica carta aziendale: giroconto, non spesa";

// ── 1+2. movimenti TRASPASO in uscita ──────────────────────────────────
const traspasi = await prisma.movimentoBancario.findMany({
  where: { importo: { lt: 0 }, concetto: { contains: "TRASPASO", mode: "insensitive" } },
  include: {
    abbinamenti: {
      include: {
        spesa: { include: { pagamentoMensile: { select: { id: true } }, righeCoperte: { select: { id: true } }, abbinamentiBancari: { select: { movimentoId: true } } } },
      },
    },
  },
  orderBy: { dataContabile: "asc" },
});

const daCancellare = []; // spese
const daRiagganciare = []; // { spesa, movimento ADEUDO }
const daEscludere = []; // movimenti
const abbinamentiVia = []; // id
let errori = 0;

console.log("=== Movimenti TRASPASO (uscite) ===");
for (const m of traspasi) {
  const spese = m.abbinamenti.map((a) => a.spesa).filter(Boolean);
  const altri = m.abbinamenti.filter((a) => !a.spesaId);
  if (altri.length) { console.log(`  !! mov #${m.id} ${dd(m.dataContabile)} ha collegamenti non a spese: salto`); errori++; continue; }
  const riga = `mov #${m.id} ${dd(m.dataContabile)} ${eur(m.importo)} stato=${m.stato}`;
  if (m.stato === "escluso" && !spese.length) { console.log(`  già escluso: ${riga}`); continue; }
  for (const s of spese) {
    const blocco = s.pagamentoMensile ? "è nel registro dipendenti" : s.righeCoperte.length ? "copre righe del registro" : s.abbinamentiBancari.length > 1 ? "è collegata a più movimenti" : null;
    if (blocco) { console.log(`  !! spesa #${s.id} ${blocco}: salto il movimento ${riga}`); errori++; continue; }
    // «Quota mensile carta» agganciata per sbaglio al TRASPASO: la riporto
    // sull'addebito mensile dello stesso mese ancora da abbinare
    const quota = /quota mensile/i.test(s.descrizione ?? "");
    const adeudo = quota
      ? await prisma.movimentoBancario.findFirst({
          where: {
            stato: "da_abbinare",
            importo: -s.importo,
            concetto: { contains: "ADEUDO MENSUAL DE TARJETA", mode: "insensitive" },
            dataContabile: { gte: new Date(Date.UTC(s.anno, s.mese - 1, 1)), lt: new Date(Date.UTC(s.anno, s.mese, 1)) },
          },
        })
      : null;
    if (adeudo) {
      daRiagganciare.push({ spesa: s, movimento: adeudo });
      console.log(`  ${riga}: spesa #${s.id} «${s.descrizione}» ${eur(s.importo)} → la riaggancio all'ADEUDO mov #${adeudo.id} ${dd(adeudo.dataContabile)}`);
    } else {
      daCancellare.push(s);
      console.log(`  ${riga}: CANCELLO spesa #${s.id} ${s.anno}-${String(s.mese).padStart(2, "0")} «${s.descrizione ?? ""}» ${eur(s.importo)} [${s.categoria}]${s.note ? " (" + s.note + ")" : ""}`);
    }
  }
  abbinamentiVia.push(...m.abbinamenti.map((a) => a.id));
  daEscludere.push(m);
  if (!spese.length) console.log(`  ${riga}: lo escludo`);
}

// ── 2025: «Caricamento Carta Aziendale» a mano ─────────────────────────
const caricamenti2025 = await prisma.spesa.findMany({
  where: { anno: 2025, categoria: "Carta Aziendale", fornitore: { contains: "Caricamento Carta", mode: "insensitive" }, abbinamentiBancari: { none: {} } },
  orderBy: { id: "asc" },
});
console.log(`\n=== «Caricamento Carta Aziendale» 2025 (a mano): ${caricamenti2025.length}, ${eur(caricamenti2025.reduce((s, x) => s + x.importo, 0))} ===`);
for (const s of caricamenti2025) console.log(`  spesa #${s.id} ${s.anno}-${String(s.mese).padStart(2, "0")} ${s.fornitore} ${eur(s.importo)}${anche2025 ? "  → CANCELLO" : "  (resta: senza --anche-2025)"}`);
if (anche2025) daCancellare.push(...caricamenti2025);

// ── 3. regola salvata ──────────────────────────────────────────────────
const row = await prisma.impostazione.findUnique({ where: { chiave: "banca" } });
let regoleNuove = null;
if (row) {
  const saved = JSON.parse(row.valore);
  const regole = Array.isArray(saved.regole) ? saved.regole : [];
  const out = [];
  let cambiata = false;
  for (const r of regole) {
    if (/escludi/.test(r.categoria) && /TRASPASO/.test(r.pattern)) { out.push(r); continue; }
    if (/TRASPASO/.test(r.pattern)) {
      const pattern = r.pattern.split("|").filter((p) => p !== "TRASPASO").join("|");
      if (!out.some((x) => x.categoria === "escludi" && /TRASPASO/.test(x.pattern))) out.push({ pattern: "TRASPASO", categoria: "escludi", fornitore: "" });
      out.push({ ...r, pattern });
      cambiata = true;
      continue;
    }
    out.push(r);
  }
  if (!out.some((x) => x.categoria === "escludi" && /TRASPASO/.test(x.pattern))) { out.unshift({ pattern: "TRASPASO", categoria: "escludi", fornitore: "" }); cambiata = true; }
  console.log(`\n=== Regola salvata in Banca › Impostazioni ===`);
  if (cambiata) { regoleNuove = { ...saved, regole: out }; for (const r of out) if (/TRASPASO|Carta Aziendale/.test(r.pattern + r.categoria)) console.log(`  ${r.pattern}  → ${r.categoria}${r.fornitore ? " / " + r.fornitore : ""}`); }
  else console.log("  già a posto");
} else console.log("\n=== Regola salvata: nessuna (vale il default del codice) ===");

// ── riepilogo ──────────────────────────────────────────────────────────
console.log(`\nRiepilogo: ${daEscludere.length} movimenti da escludere, ${daCancellare.length} spese da cancellare (${eur(daCancellare.reduce((s, x) => s + x.importo, 0))}), ${daRiagganciare.length} da riagganciare, regola ${regoleNuove ? "da aggiornare" : "ok"}${errori ? `, ${errori} casi saltati` : ""}`);

if (!apply) { console.log("\nProva finita: nessuna scrittura. Aggiungi --apply per applicare."); await prisma.$disconnect(); process.exit(0); }

// ── applicazione ───────────────────────────────────────────────────────
const dir = `${process.env.HOME}/Desktop/APP/leo_finance_backup`;
mkdirSync(dir, { recursive: true });
const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const file = `${dir}/traspaso_${ts}_${host.split(".")[0]}.json`;
writeFileSync(file, JSON.stringify({ daCancellare, daRiagganciare: daRiagganciare.map((x) => ({ spesaId: x.spesa.id, movimentoId: x.movimento.id })), daEscludere: daEscludere.map((m) => ({ id: m.id, stato: m.stato, nota: m.nota })), abbinamentiVia, regolePrima: row?.valore ?? null }, null, 2));
console.log(`\nSalvato prima di scrivere: ${file}`);

await prisma.$transaction(async (tx) => {
  if (abbinamentiVia.length) await tx.abbinamentoBancario.deleteMany({ where: { id: { in: abbinamentiVia } } });
  for (const { spesa, movimento } of daRiagganciare) {
    await tx.abbinamentoBancario.create({ data: { movimentoId: movimento.id, spesaId: spesa.id, importo: spesa.importo } });
    await tx.movimentoBancario.update({ where: { id: movimento.id }, data: { stato: "abbinato", nota: null } });
  }
  if (daCancellare.length) await tx.spesa.deleteMany({ where: { id: { in: daCancellare.map((s) => s.id) } } });
  for (const m of daEscludere) await tx.movimentoBancario.update({ where: { id: m.id }, data: { stato: "escluso", nota: NOTA } });
  if (regoleNuove) await tx.impostazione.update({ where: { chiave: "banca" }, data: { valore: JSON.stringify(regoleNuove) } });
});
console.log("Fatto.");
await prisma.$disconnect();

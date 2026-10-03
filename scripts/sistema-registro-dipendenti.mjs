// Banca → registro dipendenti (2026-10-03). Stampa tutto; scrive solo con --apply.
// 1. Regole banca salvate: ricarica carta virtuale 7737 = Commissioni di
//    Finn Kalbhenn (prima della regola "Carta Aziendale"); CLAUDE tra i software.
// 2. "Finn" da solo → "Finn Kalbhenn" (fonte degli altri ingressi, fornitore spese).
// 3. Quote soci per fattura (Spese "Soci" nate da una fattura, 42,5 % a
//    testa): si tolgono, il dividendo non si fa per fattura.
// 4. Spese "Soci" di un socio con "Rimborso" nella descrizione → Rimborsi
//    nel suo registro pagamenti.
// 5. Rimborsi con una specifica ("REEMBOLSO CLAUDE") a un socio → spesa
//    aziendale (costo pagato con la carta propria), fuori dal registro.
// 6. Ricariche della carta 7737 non collegate (anche escluse) → abbinate alle
//    commissioni di Finn ancora aperte che danno la stessa somma.
// Uso: node scripts/sistema-registro-dipendenti.mjs [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const nomeCompleto = (d) => `${d.nome}${d.cognome ? ` ${d.cognome}` : ""}`.trim();
const titolo = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const cent = (n) => Math.round(Math.abs(n) * 100);
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

const persone = await prisma.dipendente.findMany();
const finn = persone.find((p) => norm(nomeCompleto(p)) === "finn kalbhenn");
const soci = persone.filter((p) => p.tipo === "socio_dipendente");
const personaDi = (fornitore) => persone.find((p) => norm(nomeCompleto(p)) === norm(fornitore)) ?? null;

// ── 1. Regole banca ────────────────────────────────────────────────────
console.log("── 1. Regole banca");
const imp = await prisma.impostazione.findUnique({ where: { chiave: "banca" } });
if (!imp) {
  console.log("  nessuna impostazione salvata: valgono le regole di default (già aggiornate)\n");
} else {
  const cfg = JSON.parse(imp.valore || "{}");
  const regole = Array.isArray(cfg.regole) ? cfg.regole : [];
  let cambiate = false;
  if (!regole.some((r) => /7737/.test(r.pattern))) {
    const i = regole.findIndex((r) => /TARJETA VIRTUAL/.test(r.pattern));
    const nuova = { pattern: "TARJETA VIRTUAL.*7737", categoria: "Commissioni", fornitore: "Finn Kalbhenn" };
    regole.splice(i === -1 ? regole.length : i, 0, nuova);
    console.log(`  + regola "${nuova.pattern}" → Commissioni · Finn Kalbhenn (posizione ${i === -1 ? regole.length : i + 1})`);
    cambiate = true;
  }
  const sw = regole.find((r) => r.categoria === "Software" && /ANTHROPIC/.test(r.pattern));
  if (sw && !/CLAUDE/.test(sw.pattern)) {
    sw.pattern = sw.pattern.replace("ANTHROPIC", "ANTHROPIC|CLAUDE");
    console.log(`  ~ regola Software: aggiunto CLAUDE`);
    cambiate = true;
  }
  if (!cambiate) console.log("  già aggiornate");
  if (cambiate && apply) {
    await prisma.impostazione.update({ where: { chiave: "banca" }, data: { valore: JSON.stringify({ ...cfg, regole }) } });
  }
  console.log("");
}

// ── 2. Finn → Finn Kalbhenn ────────────────────────────────────────────
console.log("── 2. Finn → Finn Kalbhenn");
const ingFinn = await prisma.altroIngresso.count({ where: { fonte: "Finn" } });
const speFinn = await prisma.spesa.count({ where: { fornitore: { equals: "Finn", mode: "insensitive" } } });
console.log(`  altri ingressi con fonte "Finn": ${ingFinn} · spese con fornitore "Finn": ${speFinn}\n`);
if (apply) {
  await prisma.altroIngresso.updateMany({ where: { fonte: "Finn" }, data: { fonte: "Finn Kalbhenn" } });
  await prisma.spesa.updateMany({ where: { fornitore: { equals: "Finn", mode: "insensitive" } }, data: { fornitore: "Finn Kalbhenn" } });
}

// Elimina spese tenendo coerenti i movimenti bancari collegati
async function eliminaSpese(ids) {
  const abb = await prisma.abbinamentoBancario.findMany({ where: { spesaId: { in: ids } }, select: { movimentoId: true } });
  await prisma.spesa.deleteMany({ where: { id: { in: ids } } });
  for (const movimentoId of new Set(abb.map((a) => a.movimentoId))) {
    const resto = await prisma.abbinamentoBancario.count({ where: { movimentoId } });
    if (!resto) await prisma.movimentoBancario.update({ where: { id: movimentoId }, data: { stato: "da_abbinare" } });
  }
}

// ── 3. Quote soci per fattura ──────────────────────────────────────────
console.log("── 3. Quote soci per fattura (si tolgono)");
const quote = await prisma.spesa.findMany({
  where: { categoria: "Soci", fatturaId: { not: null } },
  include: {
    fattura: { select: { numero: true, cliente: { select: { nome: true } } } },
    abbinamentiBancari: { select: { movimentoId: true } },
    pagamentoMensile: { select: { id: true } },
  },
  orderBy: [{ anno: "asc" }, { mese: "asc" }],
});
let totQuote = 0;
for (const q of quote) {
  totQuote += q.importo;
  console.log(
    `  #${q.id} ${MESI[q.mese - 1]} ${q.anno} · ${q.fornitore} · ${q.importo.toFixed(2)} € · fattura ${q.fattura?.numero ?? "?"} ${q.fattura?.cliente?.nome ?? ""}${q.abbinamentiBancari.length ? " · COLLEGATA A UN MOVIMENTO (torna da rivedere)" : ""}${q.pagamentoMensile ? " · NEL REGISTRO" : ""}`,
  );
}
console.log(`  ${quote.length} spese, ${totQuote.toFixed(2)} €\n`);
if (apply && quote.length) await eliminaSpese(quote.map((q) => q.id));

// ── 4. Spese "Soci" che sono rimborsi ──────────────────────────────────
console.log("── 4. Spese Soci con \"Rimborso\" → Rimborsi nel registro");
const sociRimb = await prisma.spesa.findMany({
  where: {
    categoria: "Soci",
    fatturaId: null,
    pagamentoMensile: null,
    OR: [{ descrizione: { contains: "rimbors", mode: "insensitive" } }, { descrizione: { contains: "reembols", mode: "insensitive" } }],
  },
});
const daRegistrare = sociRimb.filter((s) => soci.some((p) => norm(nomeCompleto(p)) === norm(s.fornitore)));
for (const s of daRegistrare) console.log(`  #${s.id} ${MESI[s.mese - 1]} ${s.anno} · ${s.fornitore} · ${s.descrizione} · ${s.importo.toFixed(2)} €`);
console.log(`  ${daRegistrare.length} spese\n`);
if (apply) {
  for (const s of daRegistrare) {
    const p = personaDi(s.fornitore);
    await prisma.$transaction([
      prisma.spesa.update({ where: { id: s.id }, data: { categoria: "Rimborsi" } }),
      prisma.pagamentoMensile.create({
        data: { dipendenteId: p.id, anno: s.anno, mese: s.mese, voce: "rimborsi", importo: s.importo, note: s.descrizione, spesaId: s.id },
      }),
    ]);
  }
}

// ── 5. Rimborsi con una specifica → spesa aziendale ───────────────────
console.log("── 5. Rimborsi con una specifica → spesa aziendale");
// stesse parole di lib/banca.ts (PAROLE_RIMBORSO): non dicono COSA si rimborsa
const GENERICHE = new Set([
  "reembolso", "rembolso", "reembolsos", "rimborso", "rimborsi", "anticipo", "anticipos", "anticipi",
  "de", "del", "la", "las", "los", "el", "di", "y", "e", "gastos", "gasto", "spese", "socio", "socios", "socia",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre", "octubre",
  "noviembre", "diciembre", "gennaio", "febbraio", "aprile", "maggio", "giugno", "luglio", "settembre", "ottobre",
  "dicembre", "mes", "mese",
]);
const giaRegistrate = new Set(daRegistrare.map((s) => s.id));
const candidate = await prisma.spesa.findMany({
  where: {
    pagamentoMensile: null,
    categoria: { notIn: ["Rimborsi", "Benefit", "Commissioni"] },
    OR: [{ descrizione: { startsWith: "REEMBOLSO", mode: "insensitive" } }, { descrizione: { startsWith: "RIMBORSO", mode: "insensitive" } }],
  },
});
const aziendali = [];
for (const s of candidate) {
  if (giaRegistrate.has(s.id)) continue;
  const p = personaDi(s.fornitore);
  if (!p) continue;
  const nomeP = new Set(norm(nomeCompleto(p)).split(" "));
  const specifica = norm(s.descrizione)
    .split(" ")
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !GENERICHE.has(w) && !nomeP.has(w))
    .join(" ");
  if (!specifica) continue;
  const categoria = /claude|anthropic|openai|chatgpt|google|adobe|notion|canva|figma/.test(specifica) ? "Software" : "Costi Aziendali";
  aziendali.push({ s, p, specifica, categoria });
  console.log(`  #${s.id} ${MESI[s.mese - 1]} ${s.anno} · ${s.fornitore} · "${s.descrizione}" ${s.importo.toFixed(2)} € → ${categoria} · fornitore ${titolo(specifica)}`);
}
console.log(`  ${aziendali.length} spese\n`);
if (apply) {
  for (const { s, p, specifica, categoria } of aziendali) {
    await prisma.spesa.update({
      where: { id: s.id },
      data: { categoria, fornitore: titolo(specifica), descrizione: `${titolo(specifica)} · pagata con la carta di ${nomeCompleto(p)}` },
    });
  }
}

// ── 6. Ricariche carta 7737 → commissioni di Finn ──────────────────────
console.log("── 6. Ricariche carta 7737 → commissioni di Finn");
if (!finn) {
  console.log("  Finn Kalbhenn non è in anagrafica: salto\n");
} else {
  const ricariche = await prisma.movimentoBancario.findMany({
    where: {
      importo: { lt: 0 },
      stato: { in: ["da_abbinare", "escluso"] },
      abbinamenti: { none: {} },
      concetto: { contains: "TARJETA VIRTUAL", mode: "insensitive" },
      osservazioni: { contains: "7737" },
    },
    orderBy: { dataContabile: "asc" },
  });
  const aperte = await prisma.spesa.findMany({
    where: { pagamentoMensile: { voce: "commissioni", dipendenteId: finn.id }, abbinamentiBancari: { none: {} } },
    orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
  });
  const usate = new Set();
  const somma = (lista, cents) => {
    const n = Math.min(lista.length, 18);
    const scegli = (k, da, acc, tot) => {
      if (acc.length === k) return Math.abs(tot - cents) <= 1 ? acc : null;
      for (let i = da; i < n; i++) {
        const v = cent(lista[i].importo);
        if (tot + v > cents + 1) continue;
        const r = scegli(k, i + 1, [...acc, lista[i]], tot + v);
        if (r) return r;
      }
      return null;
    };
    for (let k = 1; k <= 5; k++) {
      const r = scegli(k, 0, [], 0);
      if (r) return r;
    }
    return [];
  };
  let collegate = 0;
  for (const m of ricariche) {
    const libere = aperte.filter((s) => !usate.has(s.id));
    const scelte = somma(libere, cent(m.importo));
    const data = m.dataContabile.toISOString().slice(0, 10);
    if (!scelte.length) {
      console.log(`  ${data} ${m.importo.toFixed(2)} € (${m.stato}): nessuna combinazione di commissioni aperte`);
      continue;
    }
    scelte.forEach((s) => usate.add(s.id));
    collegate++;
    console.log(
      `  ${data} ${m.importo.toFixed(2)} € (${m.stato}) → ${scelte.map((s) => `#${s.id} ${s.descrizione ?? ""} ${MESI[s.mese - 1]} ${s.anno} ${s.importo.toFixed(2)}`).join(" + ")}`,
    );
    if (apply) {
      await prisma.$transaction([
        prisma.abbinamentoBancario.createMany({ data: scelte.map((s) => ({ movimentoId: m.id, spesaId: s.id, importo: s.importo })) }),
        prisma.movimentoBancario.update({ where: { id: m.id }, data: { stato: "abbinato" } }),
      ]);
    }
  }
  console.log(`  ${collegate} ricariche collegate su ${ricariche.length}\n`);
}

console.log(apply ? "Fatto." : "Prova finita: rilancia con --apply per scrivere.");
await prisma.$disconnect();

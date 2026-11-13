// Banca → registro dipendenti: sistema i dati già presenti perché ogni
// pagamento alle persone sia una riga del registro, collegata al movimento
// bancario, senza doppioni.
// 1. Benefit prima di maggio 2026 (il Metropolitan parte da maggio): via
//    riga del registro e spesa.
// 2. Doppioni: spesa Stipendio / Seguridad Social fuori registro con lo
//    stesso mese, importo e persona di una riga del registro → il
//    collegamento bancario passa alla riga del registro, la spesa doppia va via.
// 3. Metropolitan registrato come «Ufficio» → benefit diviso in parti uguali
//    tra le persone con benefit (le righe già nel registro si collegano e
//    prendono l'importo della banca), collegamento bancario spostato.
// 4. IRPF del trimestre (addebito AEAT registrato come «Tasse») → righe IRPF
//    per persona e mese + resto «Altre ritenute (mod. 111)» nella spesa
//    originale. Se le righe superano l'addebito, non si tocca.
// 5. Regola e memoria banca: Metropolitan → categoria Benefit.
// Senza --apply non scrive.
// Uso: node scripts/sistema-registro-banca.mjs [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host} · ${apply ? "APPLICO" : "prova (senza --apply non scrive nulla)"}\n`);

const INIZIO_BENEFIT = 2026 * 12 + 5; // maggio 2026
const VOCI_PER_TIPO = {
  dipendente: ["stipendio", "seguridad", "irpf"],
  socio_dipendente: ["stipendio", "seguridad", "irpf", "rimborsi", "benefit"],
  commerciale: ["stipendio", "commissioni", "benefit"],
};
const haVoce = (d, v) => (VOCI_PER_TIPO[d.tipo] ?? VOCI_PER_TIPO.dipendente).includes(v);
const LABEL = { stipendio: "Stipendio", seguridad: "Seguridad Social", irpf: "IRPF", benefit: "Benefit" };
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const per = (m, a) => `${MESI[m - 1]} ${a}`;
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const cent = (n) => Math.round(Math.abs(n) * 100);
const eur = (n) => `${n.toFixed(2).replace(".", ",")} €`;
const nomeDi = (d) => `${d.nome}${d.cognome ? ` ${d.cognome}` : ""}`;
const dataIt = (d) => d.toLocaleDateString("it-IT", { timeZone: "UTC" });
const dividi = (importo, n) => {
  const tot = cent(importo);
  const base = Math.floor(tot / n);
  const extra = tot - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
};
const TX = { timeout: 60_000, maxWait: 20_000 };

const dipendenti = await prisma.dipendente.findMany({ orderBy: { id: "asc" } });
const nomi = new Map(dipendenti.map((d) => [d.id, nomeDi(d)]));
const INCLUDE_BANCA = { abbinamentiBancari: { include: { movimento: true } } };
const caricaRegistro = () =>
  prisma.pagamentoMensile.findMany({
    where: { voce: { in: ["stipendio", "seguridad", "irpf", "benefit"] } },
    include: { spesa: { include: INCLUDE_BANCA } },
    orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
  });
let registro = await caricaRegistro();
const inBanca = (pm) => (pm.spesa?.abbinamentiBancari.length ?? 0) > 0;
const speseFuori = await prisma.spesa.findMany({
  where: { anno: { gte: 2026 }, pagamentoMensile: null },
  include: INCLUDE_BANCA,
  orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
});
const totali = async () => {
  const rows = await prisma.spesa.groupBy({
    by: ["categoria"],
    where: { anno: 2026, categoria: { in: ["Stipendio", "Seguridad Social", "Tasse", "Benefit", "Ufficio"] } },
    _sum: { importo: true },
    _count: true,
  });
  return Object.fromEntries(rows.map((r) => [r.categoria, `${r._count} spese, ${eur(r._sum.importo ?? 0)}`]));
};
console.log("Totali 2026 prima:", await totali(), "\n");
const avvisi = [];

// ── 1. Benefit prima di maggio 2026 ──
const benefitVecchi = registro.filter((pm) => pm.voce === "benefit" && pm.anno * 12 + pm.mese < INIZIO_BENEFIT);
console.log(`1. Benefit prima di maggio 2026: ${benefitVecchi.length}`);
for (const pm of benefitVecchi) {
  if (inBanca(pm)) {
    avvisi.push(`benefit #${pm.id} ${per(pm.mese, pm.anno)} collegato alla banca: non toccato`);
    continue;
  }
  console.log(`   via: benefit ${nomi.get(pm.dipendenteId)} ${per(pm.mese, pm.anno)} ${eur(pm.importo)} (riga #${pm.id}, spesa #${pm.spesaId})`);
  if (apply) {
    await prisma.$transaction(async (tx) => {
      await tx.pagamentoMensile.delete({ where: { id: pm.id } });
      if (pm.spesaId) await tx.spesa.delete({ where: { id: pm.spesaId } });
    }, TX);
  }
}

// ── 2. Doppioni stipendio / Seguridad Social ──
console.log("\n2. Spese doppie di righe del registro (stipendio, Seguridad Social)");
const usati = new Set();
for (const e of speseFuori.filter((s) => s.categoria === "Stipendio" || s.categoria === "Seguridad Social")) {
  const voce = e.categoria === "Stipendio" ? "stipendio" : "seguridad";
  const testo = norm(`${e.fornitore} ${e.descrizione ?? ""}`);
  const stessi = registro.filter(
    (pm) => pm.voce === voce && pm.anno === e.anno && pm.mese === e.mese && cent(pm.importo) === cent(e.importo) && !usati.has(pm.id),
  );
  const perNome = stessi.filter((pm) => testo.includes(norm(nomi.get(pm.dipendenteId))));
  const tgss = voce === "seguridad" && /tgss|seguridad social/.test(norm(e.fornitore));
  const pm = perNome.length === 1 ? perNome[0] : !perNome.length && tgss && stessi.length === 1 ? stessi[0] : null;
  if (!pm) {
    if (stessi.length) avvisi.push(`spesa #${e.id} ${e.categoria} ${per(e.mese, e.anno)} ${eur(e.importo)}: non so a quale riga del registro corrisponde`);
    continue;
  }
  const eBanca = e.abbinamentiBancari[0] ?? null;
  if (eBanca && inBanca(pm)) {
    avvisi.push(`spesa #${e.id} e riga #${pm.id} entrambe collegate alla banca: non toccate`);
    continue;
  }
  if (!pm.spesaId) {
    avvisi.push(`riga #${pm.id} senza spesa: non toccata`);
    continue;
  }
  usati.add(pm.id);
  console.log(
    `   spesa #${e.id} ${e.categoria} «${e.fornitore}${e.descrizione ? ` · ${e.descrizione}` : ""}» ${per(e.mese, e.anno)} ${eur(e.importo)}` +
      ` = ${LABEL[voce]} ${nomi.get(pm.dipendenteId)} (riga #${pm.id}, spesa #${pm.spesaId})` +
      (eBanca ? ` · il collegamento BBVA del ${dataIt(eBanca.movimento.dataContabile)} passa alla riga del registro` : "") +
      ` → via la #${e.id}`,
  );
  if (apply) {
    await prisma.$transaction(async (tx) => {
      if (eBanca) {
        await tx.abbinamentoBancario.update({ where: { id: eBanca.id }, data: { spesaId: pm.spesaId } });
        await tx.pagamentoMensile.update({ where: { id: pm.id }, data: { data: eBanca.movimento.dataContabile } });
      }
      if (e.ricevutaPath && !pm.spesa?.ricevutaPath) {
        await tx.spesa.update({ where: { id: pm.spesaId }, data: { ricevutaPath: e.ricevutaPath } });
      }
      await tx.spesa.delete({ where: { id: e.id } });
    }, TX);
  }
}

// ── 3. Metropolitan → benefit ──
console.log("\n3. Metropolitan registrato come spesa → benefit nel registro");
const conBenefit = dipendenti.filter((d) => d.attivo && d.benefitMensili > 0 && haVoce(d, "benefit"));
console.log(`   persone con benefit: ${conBenefit.map(nomeDi).join(", ") || "nessuna"}`);
registro = await caricaRegistro();
for (const e of speseFuori.filter(
  (s) => norm(s.fornitore).includes("metropolitan") && s.categoria !== "Benefit" && s.anno * 12 + s.mese >= INIZIO_BENEFIT,
)) {
  if (!conBenefit.length) break;
  if (e.fatturaId) {
    avvisi.push(`Metropolitan #${e.id} legata a una fattura: non toccata`);
    continue;
  }
  const eBanca = e.abbinamentiBancari[0] ?? null;
  const parti = dividi(e.importo, conBenefit.length);
  const piano = conBenefit.map((d, i) => {
    const pm = registro.find((x) => x.voce === "benefit" && x.dipendenteId === d.id && x.anno === e.anno && x.mese === e.mese);
    return { d, importo: parti[i], pm: pm ?? null };
  });
  const bloccata = piano.find((x) => x.pm && (inBanca(x.pm) || !x.pm.spesaId));
  if (bloccata) {
    avvisi.push(`Metropolitan #${e.id} ${per(e.mese, e.anno)}: il benefit di ${nomeDi(bloccata.d)} è già collegato alla banca, non toccata`);
    continue;
  }
  console.log(
    `   spesa #${e.id} ${e.categoria} ${per(e.mese, e.anno)} ${eur(e.importo)}${eBanca ? ` (BBVA ${dataIt(eBanca.movimento.dataContabile)})` : " (non in banca)"} → ` +
      piano
        .map((x) =>
          x.pm
            ? `${nomeDi(x.d)} ${eur(x.importo)} riga #${x.pm.id}${cent(x.pm.importo) !== cent(x.importo) ? ` (era ${eur(x.pm.importo)})` : ""}`
            : `${nomeDi(x.d)} ${eur(x.importo)} nuova`,
        )
        .join(", ") +
      (e.ricevutaPath ? " · ricevuta spostata sul primo benefit" : ""),
  );
  if (apply) {
    await prisma.$transaction(async (tx) => {
      const data = eBanca ? eBanca.movimento.dataContabile : null;
      const spese = [];
      for (const x of piano) {
        if (x.pm) {
          await tx.pagamentoMensile.update({ where: { id: x.pm.id }, data: { importo: x.importo, ...(data ? { data } : {}) } });
          await tx.spesa.update({ where: { id: x.pm.spesaId }, data: { importo: x.importo } });
          spese.push({ id: x.pm.spesaId, importo: x.importo });
        } else {
          const nome = nomeDi(x.d);
          const s = await tx.spesa.create({
            data: {
              azienda: "Spagna",
              fornitore: nome,
              categoria: "Benefit",
              descrizione: `Benefit — ${nome}`,
              note: eBanca ? `Da estratto conto BBVA del ${dataIt(eBanca.movimento.dataContabile)}` : `Metropolitan (era la spesa #${e.id})`,
              mese: e.mese,
              anno: e.anno,
              importo: x.importo,
            },
          });
          await tx.pagamentoMensile.create({
            data: { dipendenteId: x.d.id, anno: e.anno, mese: e.mese, voce: "benefit", importo: x.importo, data, note: "Metropolitan World SL", spesaId: s.id },
          });
          spese.push({ id: s.id, importo: x.importo });
        }
      }
      if (e.ricevutaPath) await tx.spesa.update({ where: { id: spese[0].id }, data: { ricevutaPath: e.ricevutaPath } });
      if (eBanca) {
        await tx.abbinamentoBancario.createMany({
          data: spese.map((s) => ({ movimentoId: eBanca.movimentoId, spesaId: s.id, importo: s.importo })),
        });
      }
      await tx.spesa.delete({ where: { id: e.id } }); // il suo collegamento bancario va via con lei
    }, TX);
  }
}

// ── 4. IRPF del trimestre ──
console.log("\n4. Addebiti AEAT del trimestre → IRPF nel registro");
registro = await caricaRegistro();
const conIrpf = dipendenti.filter((d) => d.attivo && d.irpfImporto > 0 && haVoce(d, "irpf"));
for (const e of speseFuori.filter((s) => s.categoria === "Tasse")) {
  const testo = norm(`${e.fornitore} ${e.descrizione ?? ""}`);
  if (/canaria|devoluc/.test(testo) || /^altre ritenute/i.test(e.descrizione ?? "")) continue;
  const eBanca = e.abbinamentiBancari[0] ?? null;
  let q = 0;
  let annoQ = 0;
  if (eBanca) {
    const mov = eBanca.movimento;
    const mm = mov.dataContabile.getUTCMonth() + 1;
    if ([1, 4, 7, 10].includes(mm) && !/canaria|devoluc/.test(norm(`${mov.concetto} ${mov.beneficiario ?? ""} ${mov.osservazioni ?? ""}`))) {
      q = mm === 1 ? 4 : (mm - 1) / 3;
      annoQ = mm === 1 ? mov.dataContabile.getUTCFullYear() - 1 : mov.dataContabile.getUTCFullYear();
    }
  } else {
    const m = testo.match(/\b([1-4])\s*o?\s*trimestre\s*(?:de\s*)?(20\d{2})?/);
    if (m && /retenc|ritenut|irpf|111/.test(testo)) {
      q = parseInt(m[1], 10);
      annoQ = parseInt(m[2] ?? "", 10) || e.anno;
    }
  }
  if (!q) continue;
  const mesiQ = [3 * q - 2, 3 * q - 1, 3 * q];
  const righe = [];
  for (const d of conIrpf) {
    for (const mese of mesiQ) {
      const pm = registro.find((x) => x.voce === "irpf" && x.dipendenteId === d.id && x.anno === annoQ && x.mese === mese);
      if (pm && (inBanca(pm) || !pm.spesaId)) continue;
      righe.push({ d, mese, importo: pm ? pm.importo : d.irpfImporto, pm: pm ?? null });
    }
  }
  const restoC = cent(e.importo) - righe.reduce((t, r) => t + cent(r.importo), 0);
  const desc = `spesa #${e.id} «${e.descrizione ?? e.fornitore}» ${per(e.mese, e.anno)} ${eur(e.importo)}${eBanca ? ` (BBVA ${dataIt(eBanca.movimento.dataContabile)})` : " (non in banca)"}`;
  if (!righe.length || restoC < 0 || restoC > Math.max(5000, cent(e.importo) * 0.05)) {
    avvisi.push(
      `${desc}: IRPF ${q}º trimestre ${annoQ} con gli importi delle schede = ${eur(righe.reduce((t, r) => t + r.importo, 0))}, non torna: non toccata`,
    );
    continue;
  }
  const resto = restoC / 100;
  const descResto = `Altre ritenute (mod. 111) · ${q}º trimestre ${annoQ}`;
  console.log(
    `   ${desc} → ${righe.length} righe IRPF (${conIrpf.map((d) => `${nomeDi(d)} ${eur(d.irpfImporto)}`).join(", ")} × ${mesiQ.map((m) => MESI[m - 1]).join("/")} ${annoQ})` +
      (resto > 0 ? ` + resto ${eur(resto)} «${descResto}» (resta la #${e.id})` : ` → via la #${e.id}`),
  );
  if (apply) {
    await prisma.$transaction(async (tx) => {
      const data = eBanca ? eBanca.movimento.dataContabile : null;
      const spese = [];
      for (const r of righe) {
        if (r.pm) {
          if (data) await tx.pagamentoMensile.update({ where: { id: r.pm.id }, data: { data } });
          spese.push({ id: r.pm.spesaId, importo: r.pm.importo });
          continue;
        }
        const nome = nomeDi(r.d);
        const s = await tx.spesa.create({
          data: {
            azienda: "Spagna",
            fornitore: nome,
            categoria: "Tasse",
            descrizione: `IRPF — ${nome}`,
            note: eBanca ? `Da estratto conto BBVA del ${dataIt(eBanca.movimento.dataContabile)}` : `IRPF ${q}º trimestre ${annoQ} (era nella spesa #${e.id})`,
            mese: r.mese,
            anno: annoQ,
            importo: r.importo,
          },
        });
        await tx.pagamentoMensile.create({
          data: { dipendenteId: r.d.id, anno: annoQ, mese: r.mese, voce: "irpf", importo: r.importo, data, spesaId: s.id },
        });
        spese.push({ id: s.id, importo: r.importo });
      }
      if (eBanca) {
        await tx.abbinamentoBancario.createMany({
          data: spese.map((s) => ({ movimentoId: eBanca.movimentoId, spesaId: s.id, importo: s.importo })),
        });
      }
      if (resto > 0) {
        await tx.spesa.update({
          where: { id: e.id },
          data: { importo: resto, descrizione: descResto, fornitore: "Agencia Tributaria", mese: mesiQ[2], anno: annoQ },
        });
        if (eBanca) await tx.abbinamentoBancario.update({ where: { id: eBanca.id }, data: { importo: resto } });
      } else {
        await tx.spesa.delete({ where: { id: e.id } });
      }
    }, TX);
  }
}

// ── 5. Regola e memoria banca ──
console.log("\n5. Regola e memoria banca: Metropolitan → Benefit");
const imp = await prisma.impostazione.findUnique({ where: { chiave: "banca" } });
if (imp) {
  let v = {};
  try {
    v = JSON.parse(imp.valore);
  } catch {
    v = {};
  }
  let cambi = 0;
  for (const r of Array.isArray(v.regole) ? v.regole : []) {
    if (/METROPOLITAN/i.test(r.pattern) && r.categoria !== "Benefit") {
      console.log(`   regola «${r.pattern}»: ${r.categoria} → Benefit`);
      r.categoria = "Benefit";
      cambi++;
    }
  }
  for (const [k, m] of Object.entries(v.memoria ?? {})) {
    if (k.includes("metropolitan") && m.categoria !== "Benefit") {
      console.log(`   memoria «${k}»: ${m.categoria} → Benefit`);
      m.categoria = "Benefit";
      cambi++;
    }
  }
  if (!cambi) console.log("   già a posto");
  if (apply && cambi) await prisma.impostazione.update({ where: { chiave: "banca" }, data: { valore: JSON.stringify(v) } });
} else {
  console.log("   nessuna impostazione salvata (valgono le regole di default)");
}

if (avvisi.length) {
  console.log("\nNon toccati:");
  for (const a of avvisi) console.log(`   - ${a}`);
}
if (apply) console.log("\nTotali 2026 dopo:", await totali());
await prisma.$disconnect();

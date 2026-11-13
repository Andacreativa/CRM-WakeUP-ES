// Banca → registro dipendenti: sistema i dati già presenti perché ogni
// pagamento alle persone sia una riga del registro, collegata al movimento
// bancario, senza doppioni.
// 1. Benefit prima di maggio 2026 (il Metropolitan parte da maggio): via
//    riga del registro e spesa.
// 2. Doppioni: spesa Stipendio / Seguridad Social fuori registro con lo
//    stesso mese, importo e persona di una riga del registro → il
//    collegamento bancario passa alla riga del registro, la spesa doppia va via.
// 3. Fatture Metropolitan (restano UNA spesa Ufficio, come per il
//    commercialista) → pagano i benefit del mese delle persone, divisi in
//    parti uguali: righe del registro senza spesa propria. I benefit già
//    registrati con una spesa loro (doppioni della fattura) perdono la spesa.
// 4. Addebiti AEAT del trimestre (restano UNA spesa Tasse) → pagano l'IRPF
//    del trimestre per persona e mese, righe senza spesa propria. Se le righe
//    superano l'addebito, non si tocca.
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
    include: { spesa: { include: INCLUDE_BANCA }, spesaCopertura: { include: INCLUDE_BANCA } },
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

// ── 3. Fatture Metropolitan → benefit pagati dalla fattura ──
console.log("\n3. Fatture Metropolitan (restano una spesa) → benefit nel registro pagati da quella spesa");
const conBenefit = dipendenti.filter((d) => d.attivo && d.benefitMensili > 0 && haVoce(d, "benefit"));
console.log(`   persone con benefit: ${conBenefit.map(nomeDi).join(", ") || "nessuna"}`);
registro = await caricaRegistro();
const inBancaCop = (pm) => (pm.spesaCopertura?.abbinamentiBancari.length ?? 0) > 0;
for (const e of speseFuori.filter(
  (s) => norm(s.fornitore).includes("metropolitan") && s.anno * 12 + s.mese >= INIZIO_BENEFIT,
)) {
  if (!conBenefit.length) break;
  const eBanca = e.abbinamentiBancari[0] ?? null;
  const parti = dividi(e.importo, conBenefit.length);
  const piano = conBenefit.map((d, i) => {
    const pm = registro.find((x) => x.voce === "benefit" && x.dipendenteId === d.id && x.anno === e.anno && x.mese === e.mese);
    return { d, importo: parti[i], pm: pm ?? null };
  });
  if (piano.every((x) => x.pm && x.pm.spesaCoperturaId === e.id && cent(x.pm.importo) === cent(x.importo))) continue; // già fatto
  const bloccata = piano.find(
    (x) => x.pm && (inBanca(x.pm) || inBancaCop(x.pm) || (x.pm.spesaCoperturaId && x.pm.spesaCoperturaId !== e.id)),
  );
  if (bloccata) {
    avvisi.push(`Metropolitan #${e.id} ${per(e.mese, e.anno)}: il benefit di ${nomeDi(bloccata.d)} è già pagato altrove, non toccata`);
    continue;
  }
  console.log(
    `   spesa #${e.id} ${e.categoria} «${e.fornitore}» ${per(e.mese, e.anno)} ${eur(e.importo)}${eBanca ? ` (BBVA ${dataIt(eBanca.movimento.dataContabile)})` : " (non in banca)"} resta → paga ` +
      piano
        .map((x) =>
          x.pm
            ? `${nomeDi(x.d)} ${eur(x.importo)} riga #${x.pm.id}${x.pm.spesaId ? ` (via la sua spesa #${x.pm.spesaId})` : ""}${cent(x.pm.importo) !== cent(x.importo) ? ` (era ${eur(x.pm.importo)})` : ""}`
            : `${nomeDi(x.d)} ${eur(x.importo)} nuova`,
        )
        .join(", "),
  );
  if (apply) {
    await prisma.$transaction(async (tx) => {
      const data = eBanca ? eBanca.movimento.dataContabile : null;
      const proprie = [];
      for (const x of piano) {
        if (x.pm) {
          await tx.pagamentoMensile.update({
            where: { id: x.pm.id },
            data: { spesaId: null, spesaCoperturaId: e.id, importo: x.importo, ...(data ? { data } : {}) },
          });
          if (x.pm.spesaId) proprie.push(x.pm.spesaId);
        } else {
          await tx.pagamentoMensile.create({
            data: { dipendenteId: x.d.id, anno: e.anno, mese: e.mese, voce: "benefit", importo: x.importo, data, note: e.fornitore, spesaCoperturaId: e.id },
          });
        }
      }
      if (proprie.length) await tx.spesa.deleteMany({ where: { id: { in: proprie } } });
    }, TX);
  }
}

// ── 4. IRPF del trimestre pagato dall'addebito AEAT ──
console.log("\n4. Addebiti AEAT del trimestre (restano una spesa) → IRPF nel registro pagato da quella spesa");
registro = await caricaRegistro();
const conIrpf = dipendenti.filter((d) => d.attivo && d.irpfImporto > 0 && haVoce(d, "irpf"));
for (const e of speseFuori.filter((s) => s.categoria === "Tasse")) {
  const testo = norm(`${e.fornitore} ${e.descrizione ?? ""}`);
  if (/canaria|devoluc/.test(testo)) continue;
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
  let giaFatte = 0;
  for (const d of conIrpf) {
    for (const mese of mesiQ) {
      const pm = registro.find((x) => x.voce === "irpf" && x.dipendenteId === d.id && x.anno === annoQ && x.mese === mese);
      if (pm && pm.spesaCoperturaId === e.id) {
        giaFatte++;
        continue;
      }
      if (pm && (inBanca(pm) || inBancaCop(pm) || pm.spesaCoperturaId)) continue;
      righe.push({ d, mese, importo: pm ? pm.importo : d.irpfImporto, pm: pm ?? null });
    }
  }
  if (!righe.length && giaFatte) continue; // già fatto
  const sommaRighe = righe.reduce((t, r) => t + cent(r.importo), 0);
  const restoC = cent(e.importo) - sommaRighe;
  const desc = `spesa #${e.id} «${e.descrizione ?? e.fornitore}» ${per(e.mese, e.anno)} ${eur(e.importo)}${eBanca ? ` (BBVA ${dataIt(eBanca.movimento.dataContabile)})` : " (non in banca)"}`;
  if (!righe.length || restoC < 0 || restoC > Math.max(5000, cent(e.importo) * 0.05)) {
    avvisi.push(`${desc}: IRPF ${q}º trimestre ${annoQ} con gli importi delle schede = ${eur(sommaRighe / 100)}, non torna: non toccata`);
    continue;
  }
  console.log(
    `   ${desc} resta → paga ${righe.length} righe IRPF (${conIrpf.map((d) => `${nomeDi(d)} ${eur(d.irpfImporto)}`).join(", ")} × ${mesiQ.map((m) => MESI[m - 1]).join("/")} ${annoQ}) = ${eur(sommaRighe / 100)}` +
      (restoC > 0 ? `, ${eur(restoC / 100)} restano solo nella spesa (altre ritenute)` : ""),
  );
  if (apply) {
    await prisma.$transaction(async (tx) => {
      const data = eBanca ? eBanca.movimento.dataContabile : null;
      const proprie = [];
      for (const r of righe) {
        if (r.pm) {
          await tx.pagamentoMensile.update({
            where: { id: r.pm.id },
            data: { spesaId: null, spesaCoperturaId: e.id, ...(data ? { data } : {}) },
          });
          if (r.pm.spesaId) proprie.push(r.pm.spesaId);
        } else {
          await tx.pagamentoMensile.create({
            data: { dipendenteId: r.d.id, anno: annoQ, mese: r.mese, voce: "irpf", importo: r.importo, data, note: e.fornitore, spesaCoperturaId: e.id },
          });
        }
      }
      if (proprie.length) await tx.spesa.deleteMany({ where: { id: { in: proprie } } });
    }, TX);
  }
}

if (avvisi.length) {
  console.log("\nNon toccati:");
  for (const a of avvisi) console.log(`   - ${a}`);
}
if (apply) console.log("\nTotali 2026 dopo:", await totali());
await prisma.$disconnect();

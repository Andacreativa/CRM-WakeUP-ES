// Copia le vecchie spunte mensili (PagamentoDipendente: stipendio | seguridad)
// nel nuovo registro PagamentoMensile, riusando la stessa Spesa collegata.
// La tabella vecchia resta intatta. Rieseguibile: salta le righe già copiate.
//
// Uso:  node scripts/migra-pagamenti-dipendenti.mjs [--dry-run]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${dryRun ? "  (dry-run)" : ""}`);

const vecchi = await prisma.pagamentoDipendente.findMany({
  include: { dipendente: true },
  orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
});
const spese = new Map(
  (
    await prisma.spesa.findMany({
      where: { id: { in: vecchi.map((p) => p.spesaId).filter((x) => x !== null) } },
      select: { id: true, importo: true, createdAt: true },
    })
  ).map((s) => [s.id, s]),
);
const esistenti = await prisma.pagamentoMensile.findMany({
  select: { dipendenteId: true, anno: true, mese: true, voce: true, spesaId: true },
});
const chiavi = new Set(esistenti.map((e) => `${e.dipendenteId}:${e.anno}:${e.mese}:${e.voce}`));
const speseUsate = new Set(esistenti.map((e) => e.spesaId).filter((x) => x !== null));

let creati = 0;
let saltati = 0;
for (const p of vecchi) {
  const voce = p.tipo === "seguridad" ? "seguridad" : "stipendio";
  const key = `${p.dipendenteId}:${p.anno}:${p.mese}:${voce}`;
  if (chiavi.has(key) || (p.spesaId && speseUsate.has(p.spesaId))) {
    saltati++;
    continue;
  }
  const spesa = p.spesaId ? spese.get(p.spesaId) : null;
  const importo =
    spesa?.importo ??
    (voce === "stipendio" ? p.dipendente.nettoBustaPaga : p.dipendente.seguridadSocial);
  console.log(
    `${p.dipendente.nome} ${p.mese}/${p.anno} ${voce} ${importo}${spesa ? ` (spesa #${p.spesaId})` : " (senza spesa)"}`,
  );
  if (!dryRun) {
    await prisma.pagamentoMensile.create({
      data: {
        dipendenteId: p.dipendenteId,
        anno: p.anno,
        mese: p.mese,
        voce,
        importo,
        data: spesa?.createdAt ?? p.createdAt,
        spesaId: spesa ? p.spesaId : null,
        note: "Importato dalle vecchie spunte mensili",
      },
    });
  }
  chiavi.add(key);
  creati++;
}
console.log(`\n${dryRun ? "Da creare" : "Creati"}: ${creati} · già presenti: ${saltati} · vecchie spunte: ${vecchi.length}`);
await prisma.$disconnect();

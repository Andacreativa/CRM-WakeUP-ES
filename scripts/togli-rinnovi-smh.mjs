// Toglie da Sales › Rinnovi siti tutti i rinnovi del canale SMH: si fatturano
// da Northstar e qui restano solo quelli Anda. Cancellazione morbida, come il
// bottone «Elimina» dell'app (deletedAt): le righe restano nel DB e si
// recuperano rimettendo deletedAt a null. Le richieste di fattura già nate
// restano dove sono. Stampa anche i clienti che, tolti i rinnovi SMH, non
// hanno più nulla collegato (solo elenco: non li tocca).
// Senza --apply non scrive.
// Uso: node scripts/togli-rinnovi-smh.mjs [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

const dataIt = (d) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

const smh = await prisma.rinnovoSito.findMany({
  where: { canale: "smh", deletedAt: null },
  include: {
    cliente: { select: { id: true, nome: true } },
    richieste: { where: { deletedAt: null }, select: { id: true, codice: true, validazione: true, emessa: true } },
  },
  orderBy: { dominio: "asc" },
});
const anda = await prisma.rinnovoSito.count({ where: { canale: { not: "smh" }, deletedAt: null } });

console.log(`Rinnovi SMH da togliere: ${smh.length} · restano ${anda} rinnovi Anda\n`);
for (const r of smh) {
  const cli = r.cliente ? `#${r.cliente.id} ${r.cliente.nome}` : r.nomeCliente ? `«${r.nomeCliente}»` : "—";
  const ric = r.richieste.length ? `  richieste: ${r.richieste.map((x) => `${x.codice} (${x.emessa ? "emessa" : x.validazione})`).join(", ")}` : "";
  console.log(`  #${String(r.id).padEnd(4)} ${r.dominio.padEnd(30)} ${dataIt(r.scadenza)}  ${String(r.importo).padStart(7)} €  ${cli}${ric}`);
}

// Clienti che restano senza niente collegato una volta tolti i rinnovi SMH
const idsSmh = new Set(smh.map((r) => r.id));
const clientiIds = [...new Set(smh.map((r) => r.clienteId).filter(Boolean))];
const orfani = [];
for (const id of clientiIds) {
  const c = await prisma.cliente.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      note: true,
      _count: { select: { fatture: true, richiesteFattura: true, contratti: true, contatti: true, leads: true } },
      rinnoviSiti: { where: { deletedAt: null }, select: { id: true } },
    },
  });
  if (!c) continue;
  const altriRinnovi = c.rinnoviSiti.filter((x) => !idsSmh.has(x.id)).length;
  const altro = Object.values(c._count).reduce((s, n) => s + n, 0) + altriRinnovi;
  if (!altro) orfani.push(c);
}
console.log(
  `\nClienti che restano senza nulla collegato (non toccati): ${orfani.length}` +
    (orfani.length ? "\n" + orfani.map((c) => `  #${c.id} ${c.nome}${c.note?.includes("Importato da Northstar") ? "  [importato da Northstar]" : ""}`).join("\n") : ""),
);

if (apply && smh.length) {
  const { count } = await prisma.rinnovoSito.updateMany({
    where: { id: { in: [...idsSmh] }, canale: "smh", deletedAt: null },
    data: { deletedAt: new Date() },
  });
  const restano = await prisma.rinnovoSito.count({ where: { deletedAt: null } });
  console.log(`\nFatto: ${count} rinnovi SMH tolti. Rinnovi visibili ora: ${restano}.`);
} else if (!apply) {
  console.log("\nProva: niente scritto. Per togliere davvero: --apply");
}
await prisma.$disconnect();

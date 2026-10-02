// Le spese del registro pagamenti create in passato hanno come fornitore
// solo il nome della persona ("Leonardo", "Lorenzo"); le nuove usano nome e
// cognome ("Leonardo Mestre"). Allinea le vecchie: per ogni Dipendente con
// cognome, le Spese con fornitore uguale al solo nome diventano "Nome Cognome".
// Rieseguibile. Uso: node scripts/fix-fornitore-dipendenti.mjs [--dry-run]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${dryRun ? " (dry-run)" : ""}`);

const persone = await prisma.dipendente.findMany({ where: { cognome: { not: null } } });
let tot = 0;
for (const d of persone) {
  const nome = d.nome.trim();
  const completo = `${nome} ${d.cognome.trim()}`;
  const n = await prisma.spesa.count({ where: { fornitore: { equals: nome, mode: "insensitive" } } });
  if (!n) continue;
  console.log(`${nome} → ${completo}: ${n} spese`);
  if (!dryRun) await prisma.spesa.updateMany({ where: { fornitore: { equals: nome, mode: "insensitive" } }, data: { fornitore: completo } });
  tot += n;
}
console.log(`Totale spese aggiornate: ${tot}`);
await prisma.$disconnect();

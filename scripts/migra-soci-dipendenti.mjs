// I due soci operativi diventano "socio dipendente": è il tipo che prevede
// rimborsi (variabili, a mano) e benefit nel registro pagamenti. Tocca solo
// la colonna tipo di chi è ancora "dipendente". Rieseguibile.
// Uso: node scripts/migra-soci-dipendenti.mjs [--dry-run]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${dryRun ? "  (dry-run)" : ""}`);

const SOCI = [
  { nome: "Leonardo", cognome: "Mestre" },
  { nome: "Lorenzo", cognome: "Vanghetti" },
];
for (const s of SOCI) {
  const d = await prisma.dipendente.findFirst({
    where: {
      nome: { equals: s.nome, mode: "insensitive" },
      cognome: { equals: s.cognome, mode: "insensitive" },
    },
  });
  if (!d) {
    console.log(`! ${s.nome} ${s.cognome}: non trovato`);
    continue;
  }
  if (d.tipo !== "dipendente") {
    console.log(`= #${d.id} ${s.nome} ${s.cognome}: già ${d.tipo}`);
    continue;
  }
  console.log(`→ #${d.id} ${s.nome} ${s.cognome}: dipendente → socio_dipendente`);
  if (!dryRun) {
    await prisma.dipendente.update({ where: { id: d.id }, data: { tipo: "socio_dipendente" } });
  }
}
await prisma.$disconnect();

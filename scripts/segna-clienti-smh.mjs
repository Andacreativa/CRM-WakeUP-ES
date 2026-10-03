// Spunta "Cliente SMH" (Cliente.smh) per i clienti portati da Social Media
// House: propone quelli con fatture sul vecchio canale "Italia" (= Tramite
// SMH), esclusa SMH stessa. Stampa la lista; senza --apply non scrive.
// Con --solo=12,34 segna solo gli id indicati.
// Uso: node scripts/segna-clienti-smh.mjs [--apply] [--solo=id,id]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const soloArg = process.argv.find((a) => a.startsWith("--solo="));
const solo = soloArg ? new Set(soloArg.slice(7).split(",").map((x) => parseInt(x, 10))) : null;
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

const clienti = await prisma.cliente.findMany({
  where: { fatture: { some: { azienda: "Italia", annullata: false } } },
  select: {
    id: true,
    nome: true,
    smh: true,
    fatture: { where: { azienda: "Italia", annullata: false }, select: { anno: true, mese: true } },
  },
  orderBy: { nome: "asc" },
});
const candidati = clienti.filter(
  (c) => !/social\s*media\s*house|socialmediahouse/i.test(c.nome) && (!solo || solo.has(c.id)),
);
for (const c of candidati) {
  const ultima = c.fatture.map((f) => f.anno * 100 + f.mese).sort().pop();
  console.log(
    `  #${c.id} ${c.nome} — ${c.fatture.length} fattur${c.fatture.length === 1 ? "a" : "e"} sul vecchio canale SMH, ultima ${String(ultima).slice(4)}/${String(ultima).slice(0, 4)}${c.smh ? " (già segnato)" : ""}`,
  );
}
const daSegnare = candidati.filter((c) => !c.smh);
console.log(`\n${apply ? "Segnati" : "Da segnare"}: ${daSegnare.length} clienti`);
if (apply && daSegnare.length) {
  await prisma.cliente.updateMany({ where: { id: { in: daSegnare.map((c) => c.id) } }, data: { smh: true } });
}
await prisma.$disconnect();

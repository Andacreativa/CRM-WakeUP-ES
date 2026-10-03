// Spunta "Cliente SMH" (Cliente.smh) per i clienti portati da Social Media
// House: propone quelli con fatture sul vecchio canale "Italia" (= Tramite
// SMH), esclusa SMH stessa. Stampa la lista; senza --apply non scrive.
// Con --solo=12,34 la spunta resta ESATTAMENTE su quegli id (anche fuori
// dai candidati) e si toglie dagli altri clienti.
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
  where: solo ? {} : { fatture: { some: { azienda: "Italia", annullata: false } } },
  select: {
    id: true,
    nome: true,
    smh: true,
    fatture: { where: { azienda: "Italia", annullata: false }, select: { anno: true, mese: true } },
  },
  orderBy: { nome: "asc" },
});
const candidati = clienti.filter(
  (c) => (solo ? solo.has(c.id) : !/social\s*media\s*house|socialmediahouse/i.test(c.nome)),
);
for (const c of candidati) {
  const ultima = c.fatture.map((f) => f.anno * 100 + f.mese).sort().pop();
  console.log(
    `  #${c.id} ${c.nome} — ${c.fatture.length} fattur${c.fatture.length === 1 ? "a" : "e"} sul vecchio canale SMH${ultima ? `, ultima ${String(ultima).slice(4)}/${String(ultima).slice(0, 4)}` : ""}${c.smh ? " (già segnato)" : ""}`,
  );
}
if (solo && candidati.length !== solo.size) console.log(`  ATTENZIONE: trovati ${candidati.length} id su ${solo.size}`);
const daSegnare = candidati.filter((c) => !c.smh);
const daTogliere = solo ? clienti.filter((c) => c.smh && !solo.has(c.id)) : [];
for (const c of daTogliere) console.log(`  − #${c.id} ${c.nome}: tolta la spunta`);
console.log(`\n${apply ? "Segnati" : "Da segnare"}: ${daSegnare.length} clienti${daTogliere.length ? ` · spunta tolta a ${daTogliere.length}` : ""}`);
if (apply && daSegnare.length) {
  await prisma.cliente.updateMany({ where: { id: { in: daSegnare.map((c) => c.id) } }, data: { smh: true } });
}
if (apply && daTogliere.length) {
  await prisma.cliente.updateMany({ where: { id: { in: daTogliere.map((c) => c.id) } }, data: { smh: false } });
}
await prisma.$disconnect();

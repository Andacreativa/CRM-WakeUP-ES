// Porta a «IGIC 0 %» (esente) le fatture registrate da noi al 7 % che in
// Billin sono state emesse senza imposta: clienti italiani, esenzione E2.
// Prima salva i valori attuali in un file JSON nella cartella dei backup.
// Stampa cosa farebbe; senza --apply non scrive.
// Uso: node scripts/allinea-igic0.mjs [--apply]
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

// Verificate in Billin il 2026-10-20: emesse a 0 % (IGIC_Exempt_0, E2)
const NUMERI = ["F202636", "F202637", "F202638", "F202639", "F202640", "F202646", "F202647", "F202648", "F202649"];

const fatture = await prisma.fattura.findMany({
  where: { numero: { in: NUMERI } },
  select: {
    id: true, numero: true, importo: true, tipoIva: true, iva: true, causaIgic: true, vfStato: true, pagato: true,
    cliente: { select: { nome: true, paese: true } },
    acconti: { select: { importo: true } },
  },
  orderBy: { numero: "asc" },
});
const mancanti = NUMERI.filter((n) => !fatture.some((f) => f.numero === n));
if (mancanti.length) console.log(`Non trovate: ${mancanti.join(", ")}\n`);

const daFare = [];
for (const f of fatture) {
  const acconti = f.acconti.reduce((s, a) => s + a.importo, 0);
  const riga = `${f.numero} #${f.id} ${f.cliente?.nome} (${f.cliente?.paese}) ${f.importo} € — tipoIva=${f.tipoIva} iva=${f.iva} causa=${f.causaIgic} pagato=${f.pagato} acconti=${acconti}`;
  if (f.vfStato) { console.log(`   SALTO (trasmessa a VeriFactu): ${riga}`); continue; }
  if (f.tipoIva === "igic_exenta" && f.iva === 0) { console.log(`   già a 0 %: ${riga}`); continue; }
  console.log(`   → 0 %: ${riga}`);
  daFare.push(f);
}
console.log(`\nDa allineare: ${daFare.length} fatture (tipoIva igic_exenta, iva 0; causaIgic resta com'è, come le altre registrate a mano)`);

if (apply && daFare.length) {
  const file = `${process.env.HOME}/Desktop/APP/leo_finance_backup/igic0_prima_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(daFare.map(({ id, numero, tipoIva, iva, causaIgic }) => ({ id, numero, tipoIva, iva, causaIgic })), null, 2));
  console.log(`Valori precedenti salvati in ${file}`);
  const r = await prisma.fattura.updateMany({
    where: { id: { in: daFare.map((f) => f.id) }, vfStato: null },
    data: { tipoIva: "igic_exenta", iva: 0 },
  });
  console.log(`Aggiornate: ${r.count}`);
}
await prisma.$disconnect();

// Finn Kalbhenn diventa un commerciale in anagrafica (85 % sulle fatture
// incassate) al posto della vecchia regola a testo libero commerciale="Finn":
// - crea il Dipendente se manca (tipo commerciale, 85 %);
// - alle fatture con commerciale "Finn" e commercialeId vuoto riempie SOLO
//   commercialeId;
// - la Spesa storica dell'85 % (fornitore "Finn Kalbhenn", legata alla
//   fattura) diventa la commissione del registro pagamenti: si crea la riga
//   PagamentoMensile che la punta e la categoria passa da "Soci" a
//   "Commissioni". Importi e righe restano gli stessi, niente duplicati.
// Le ritenute 15 % (AltroIngresso) restano come storico contabile.
// Rieseguibile.  Uso: node scripts/migra-finn-commerciale.mjs [--dry-run]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${dryRun ? "  (dry-run)" : ""}`);

const PERCENTUALE = 85;

let finn = await prisma.dipendente.findFirst({
  where: { nome: { equals: "Finn", mode: "insensitive" } },
});
if (!finn) {
  console.log(`+ creo Dipendente Finn Kalbhenn (commerciale ${PERCENTUALE} %)`);
  if (!dryRun) {
    finn = await prisma.dipendente.create({
      data: {
        nome: "Finn",
        cognome: "Kalbhenn",
        ruolo: "Commerciale",
        tipo: "commerciale",
        percentualeCommissione: PERCENTUALE,
        attivo: true,
      },
    });
  }
} else {
  console.log(
    `= Dipendente #${finn.id} ${finn.nome} ${finn.cognome ?? ""} già presente (tipo ${finn.tipo}, ${finn.percentualeCommissione} %)`,
  );
}
const finnId = finn?.id ?? -1;

const fatture = await prisma.fattura.findMany({
  where: { commerciale: { contains: "finn", mode: "insensitive" } },
  orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
});
console.log(`Fatture con commerciale "Finn": ${fatture.length}`);

let collegate = 0;
let commissioni = 0;
for (const f of fatture) {
  const tag = `#${f.id} ${f.numero ?? ""} ${f.anno}-${String(f.mese).padStart(2, "0")} €${f.importo}`;
  if (!f.commercialeId) {
    console.log(`  → ${tag}: commercialeId = ${finnId}`);
    if (!dryRun) {
      await prisma.fattura.update({ where: { id: f.id }, data: { commercialeId: finnId } });
    }
    collegate++;
  } else if (f.commercialeId !== finnId) {
    console.log(`  ! ${tag}: ha già commercialeId=${f.commercialeId}, lasciata com'è`);
    continue;
  }

  const giaCommissione = await prisma.pagamentoMensile.findFirst({
    where: { fatturaId: f.id, voce: "commissioni" },
  });
  if (giaCommissione) continue;

  const spesa = await prisma.spesa.findFirst({
    where: {
      fatturaId: f.id,
      fornitore: "Finn Kalbhenn",
      categoria: { in: ["Soci", "Commissioni"] },
    },
    orderBy: { id: "asc" },
  });
  if (!spesa) {
    if (f.pagato) {
      console.log(`  ! ${tag}: pagata ma senza spesa 85 % storica (la commissione nascerà al prossimo salvataggio)`);
    }
    continue;
  }
  console.log(`    + commissione da Spesa #${spesa.id} €${spesa.importo} (${spesa.categoria} → Commissioni)`);
  if (!dryRun) {
    await prisma.$transaction([
      prisma.spesa.update({ where: { id: spesa.id }, data: { categoria: "Commissioni" } }),
      prisma.pagamentoMensile.create({
        data: {
          dipendenteId: finnId,
          anno: spesa.anno,
          mese: spesa.mese,
          voce: "commissioni",
          importo: spesa.importo,
          data: spesa.createdAt,
          spesaId: spesa.id,
          fatturaId: f.id,
        },
      }),
    ]);
  }
  commissioni++;
}
console.log(`\nFatto: ${collegate} fatture collegate, ${commissioni} commissioni create dal registro storico.`);
await prisma.$disconnect();

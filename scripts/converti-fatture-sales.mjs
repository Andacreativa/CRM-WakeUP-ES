// Converte le vecchie fatture create dal flusso sales (origine = "sales") in
// richieste di fattura. Le righe Fattura originali NON vengono toccate: restano
// nel DB con origine=sales (già escluse dai totali finance) e vengono
// referenziate da legacyFatturaId, quindi lo script è rieseguibile.
//
// Uso:  node scripts/converti-fatture-sales.mjs [--dry-run]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const round2 = (n) => Math.round(n * 100) / 100;
const isPersona = (s) => /lorenzo|leonardo|finn|anda/i.test(s);

async function nextCodice(tx, anno) {
  const prefix = `RF-${anno}-`;
  const rows = await tx.richiestaFattura.findMany({
    where: { codice: { startsWith: prefix } },
    select: { codice: true },
  });
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.codice.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${dryRun ? "  (dry-run: nessuna scrittura)" : ""}`);

const fatture = await prisma.fattura.findMany({
  where: { origine: "sales" },
  include: {
    contratto: { select: { numero: true, oggetto: true } },
    cliente: { select: { nome: true } },
    richiesta: { select: { id: true } },
  },
  orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
});
const giaConvertite = new Set(
  (
    await prisma.richiestaFattura.findMany({
      where: { legacyFatturaId: { not: null } },
      select: { legacyFatturaId: true },
    })
  ).map((r) => r.legacyFatturaId),
);

let create = 0;
let saltate = 0;
for (const f of fatture) {
  if (giaConvertite.has(f.id)) {
    saltate++;
    continue;
  }
  const comm = (f.commerciale ?? "").trim();
  const responsabile = comm && isPersona(comm) ? comm : null;
  const descrizione =
    comm && !isPersona(comm) ? comm : f.contratto?.oggetto ?? "Fattura";
  const serie = /tranche\s*(\d+)\s*\/\s*(\d+)/i.exec(descrizione);
  const tipoIva = f.tipoIva === "igic7" ? "igic7" : "igic_exenta";
  const iva = tipoIva === "igic7" ? 7 : 0;
  const imponibile = round2(f.importo);
  const totale = round2(imponibile * (1 + iva / 100));
  const validata = f.checkInvio === "ok_invia";
  const quando = f.dataInvio ?? f.data ?? f.createdAt;

  const data = {
    clienteId: f.clienteId,
    nomeCliente: f.clienteId ? null : f.aziendaNota,
    contrattoId: f.contrattoId,
    azienda: f.azienda,
    aziendaNota: f.aziendaNota,
    descrizione,
    voci: JSON.stringify([{ descrizione, importo: imponibile }]),
    imponibile,
    tipoIva,
    iva,
    totale,
    mese: f.mese,
    anno: f.anno,
    dataInvio: f.dataInvio ?? f.data ?? null,
    serieCodice: f.contratto?.numero ?? null,
    serieIndice: serie ? parseInt(serie[1], 10) : null,
    serieTotale: serie ? parseInt(serie[2], 10) : null,
    ricorrenza: serie ? "mensile" : "una_tantum",
    responsabile,
    validazione: validata ? "ok" : "in_attesa",
    validataIl: validata ? quando : null,
    emessa: f.inviata,
    emessaIl: f.inviata ? quando : null,
    incassata: f.pagato,
    origine: "legacy_sales",
    legacyFatturaId: f.id,
    note: `Convertita dalla vecchia fattura sales #${f.id}`,
  };

  console.log(
    `#${f.id} ${f.mese}/${f.anno} ${f.cliente?.nome ?? "-"} | ${descrizione} | ${imponibile} | ` +
      `val=${data.validazione} emessa=${data.emessa} incassata=${data.incassata}` +
      (responsabile ? ` | resp=${responsabile}` : "") +
      (serie ? ` | serie ${serie[1]}/${serie[2]}` : ""),
  );
  if (dryRun) {
    create++;
    continue;
  }
  await prisma.$transaction(async (tx) => {
    const codice = await nextCodice(tx, f.anno);
    await tx.richiestaFattura.create({ data: { codice, ...data } });
  });
  create++;
}

console.log(
  `\n${dryRun ? "Da creare" : "Create"}: ${create} richieste · già convertite: ${saltate} · fatture sales totali: ${fatture.length}`,
);
await prisma.$disconnect();

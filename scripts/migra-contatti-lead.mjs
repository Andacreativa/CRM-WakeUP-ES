// Porta il CRM sul modello Northstar senza toccare i dati esistenti:
// - ai Lead già presenti assegna codice LEAD-AAAA-NNNN, stato (dal vecchio
//   stage) e, se esiste un cliente con lo stesso nome, il collegamento;
// - ai Contatti assegna il cliente omonimo (diventano referenti) oppure il
//   lead omonimo, oppure crea un nuovo Lead (stato da status: lead → nuovo,
//   acquisito → vinta, perso → persa) e lo collega.
// Non cancella e non sovrascrive niente: riempie solo colonne nuove.
// Rieseguibile.  Uso: node scripts/migra-contatti-lead.mjs [--dry-run]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${dryRun ? "  (dry-run)" : ""}`);

const STAGE_TO_STATO = {
  nuovo: "nuovo",
  contatto: "contattato",
  proposta: "opportunita",
  negoziazione: "opportunita",
  vinto: "vinta",
  perso: "persa",
};
const norm = (s) => (s ?? "").trim().toLowerCase();

const clienti = await prisma.cliente.findMany({ select: { id: true, nome: true } });
const clienteByNome = new Map(clienti.map((c) => [norm(c.nome), c.id]));

// Contatore codici per anno (parte dai massimi già esistenti)
const counters = new Map();
const existingCodes = await prisma.lead.findMany({ where: { codice: { not: null } }, select: { codice: true } });
for (const { codice } of existingCodes) {
  const m = /^LEAD-(\d{4})-(\d+)$/.exec(codice ?? "");
  if (m) counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, parseInt(m[2], 10)));
}
const nextCodice = (anno) => {
  const n = (counters.get(String(anno)) ?? 0) + 1;
  counters.set(String(anno), n);
  return `LEAD-${anno}-${String(n).padStart(4, "0")}`;
};

// 1) Lead esistenti
let leadAggiornati = 0;
const leads = await prisma.lead.findMany({ orderBy: { createdAt: "asc" } });
for (const l of leads) {
  const data = {};
  if (!l.codice) data.codice = nextCodice(new Date(l.createdAt).getFullYear());
  const statoDaStage = STAGE_TO_STATO[l.stage] ?? "nuovo";
  if (l.stato === "nuovo" && statoDaStage !== "nuovo") data.stato = statoDaStage;
  if (!l.clienteId) {
    const cid = clienteByNome.get(norm(l.azienda)) ?? clienteByNome.get(norm(l.nome));
    if (cid) {
      data.clienteId = cid;
      if ((data.stato ?? l.stato) === "vinta" && !l.convertitoIl) data.convertitoIl = l.updatedAt;
    }
  }
  if (Object.keys(data).length) {
    console.log(`LEAD #${l.id} ${l.azienda ?? l.nome}: ${JSON.stringify(data)}`);
    if (!dryRun) await prisma.lead.update({ where: { id: l.id }, data });
    leadAggiornati++;
  }
}

// 2) Contatti
const leadsAll = await prisma.lead.findMany({ select: { id: true, nome: true, azienda: true, email: true } });
const leadByKey = new Map();
for (const l of leadsAll) {
  for (const k of [norm(l.nome), norm(l.azienda), norm(l.email)]) if (k) leadByKey.set(k, l.id);
}
const principaleAssegnato = new Set(
  (await prisma.contatto.findMany({ where: { principale: true, clienteId: { not: null } }, select: { clienteId: true } })).map((c) => c.clienteId),
);
let refClienti = 0;
let refLead = 0;
let leadCreati = 0;
let saltati = 0;
const contatti = await prisma.contatto.findMany({ orderBy: { id: "asc" } });
for (const c of contatti) {
  if (c.clienteId || c.leadId) {
    saltati++;
    continue;
  }
  const cid = clienteByNome.get(norm(c.nome));
  if (cid) {
    const principale = !principaleAssegnato.has(cid);
    console.log(`CONTATTO #${c.id} ${c.nome} → referente del cliente #${cid}${principale ? " (principale)" : ""}`);
    if (!dryRun) await prisma.contatto.update({ where: { id: c.id }, data: { clienteId: cid, principale } });
    principaleAssegnato.add(cid);
    refClienti++;
    continue;
  }
  const lid = leadByKey.get(norm(c.nome)) ?? (c.email ? leadByKey.get(norm(c.email)) : undefined);
  if (lid) {
    console.log(`CONTATTO #${c.id} ${c.nome} → referente del lead #${lid}`);
    if (!dryRun) {
      await prisma.contatto.update({ where: { id: c.id }, data: { leadId: lid } });
      await prisma.lead.updateMany({ where: { id: lid, legacyContattoId: null }, data: { legacyContattoId: c.id } });
    }
    refLead++;
    continue;
  }
  const stato = c.status === "perso" ? "persa" : c.status === "acquisito" ? "vinta" : "nuovo";
  const anno = new Date(c.createdAt).getFullYear();
  console.log(`CONTATTO #${c.id} ${c.nome} → nuovo LEAD (${stato})`);
  if (!dryRun) {
    const lead = await prisma.lead.create({
      data: {
        codice: nextCodice(anno),
        nome: c.nome,
        azienda: c.partitaIva ? c.nome : null,
        email: c.email,
        telefono: c.telefono,
        paese: c.paese,
        citta: c.citta,
        partitaIva: c.partitaIva,
        note: c.note,
        stato,
        stage: stato === "vinta" ? "vinto" : stato === "persa" ? "perso" : "nuovo",
        fonte: "import",
        legacyContattoId: c.id,
        createdAt: c.createdAt,
      },
    });
    await prisma.contatto.update({ where: { id: c.id }, data: { leadId: lead.id } });
    leadByKey.set(norm(c.nome), lead.id);
  } else {
    nextCodice(anno);
  }
  leadCreati++;
}

console.log(
  `\nLead aggiornati: ${leadAggiornati} · contatti → referenti cliente: ${refClienti} · contatti → referenti lead: ${refLead} · lead creati da contatti: ${leadCreati} · contatti già collegati: ${saltati}`,
);
await prisma.$disconnect();

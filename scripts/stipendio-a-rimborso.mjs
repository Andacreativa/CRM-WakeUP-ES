// Una riga del registro pagamenti registrata come «stipendio» che in realtà
// era un rimborso al socio (pagamento senza busta paga): la riga passa a
// voce «rimborsi» e la sua spesa a categoria «Rimborsi». La spesa resta la
// stessa (stesso id, stesso importo, stesso eventuale collegamento alla
// banca). Senza --apply non scrive.
// Uso: node scripts/stipendio-a-rimborso.mjs --persona="Lorenzo Vanghetti" --anno=2026 --mese=1 [--nota="anticipo socio"] [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const apply = process.argv.includes("--apply");
const persona = (arg("persona") ?? "").trim();
const anno = parseInt(arg("anno") ?? "", 10);
const mese = parseInt(arg("mese") ?? "", 10);
const nota = (arg("nota") ?? "").trim();
if (!persona || !anno || !mese) {
  console.error('Servono --persona="Nome Cognome" --anno=AAAA --mese=M');
  process.exit(2);
}

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host} · ${apply ? "APPLICO" : "prova (senza --apply non scrive nulla)"}`);
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const eur = (n) => `${n.toFixed(2).replace(".", ",")} €`;

const dip = (await prisma.dipendente.findMany()).find((d) => norm(`${d.nome} ${d.cognome ?? ""}`) === norm(persona));
if (!dip) {
  console.error(`Persona «${persona}» non trovata.`);
  process.exit(1);
}
const righe = await prisma.pagamentoMensile.findMany({
  where: { dipendenteId: dip.id, anno, mese, voce: "stipendio" },
  include: { spesa: { include: { abbinamentiBancari: { include: { movimento: true } } } } },
});
if (!righe.length) {
  console.log(`Nessuno stipendio di ${persona} per ${mese}/${anno}: niente da fare.`);
  process.exit(0);
}
for (const r of righe) {
  const banca = r.spesa?.abbinamentiBancari[0]?.movimento;
  const descrizione = `Rimborsi — ${persona}${nota ? ` — ${nota}` : ""}`;
  console.log(
    `riga #${r.id} ${mese}/${anno} stipendio ${eur(r.importo)} → rimborsi` +
      (r.spesa ? ` · spesa #${r.spesa.id} «${r.spesa.categoria} · ${r.spesa.descrizione ?? ""}» → «Rimborsi · ${descrizione}»` : " · senza spesa") +
      (banca ? ` · resta collegata alla banca (${banca.dataContabile.toISOString().slice(0, 10)})` : ""),
  );
  if (!apply) continue;
  await prisma.$transaction(async (tx) => {
    await tx.pagamentoMensile.update({ where: { id: r.id }, data: { voce: "rimborsi", note: nota || r.note } });
    if (r.spesa) {
      await tx.spesa.update({ where: { id: r.spesa.id }, data: { categoria: "Rimborsi", descrizione } });
    }
  });
}
if (apply) console.log("Fatto.");
await prisma.$disconnect();

// Collega una fattura già emessa (es. registrata a mano con il numero dato da
// Billin) alla fattura che corregge, come rettificativa PER SOSTITUZIONE: la
// rettificativa prende tipo R1 (o --motivo), tipoRettifica S e il legame; la
// fattura corretta diventa «Rettificata» (annullata = true) ed esce da totali,
// scadenze, bilancio e informe. È lo stesso risultato di «Rettifica» +
// «Emetti» dal pannello; serve quando la rettificativa è nata da «Nuova
// fattura» e il numero è ormai preso. Senza --apply non scrive.
// Uso: node scripts/collega-rettificativa.mjs --originale=F202695 --rettificativa=R20264 [--motivo=R1] [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const apply = process.argv.includes("--apply");
const numOriginale = arg("originale")?.trim();
const numRettifica = arg("rettificativa")?.trim();
const motivo = arg("motivo")?.trim() || "R1";
if (!numOriginale || !numRettifica) {
  console.error("Servono --originale=<numero> e --rettificativa=<numero>.");
  process.exit(2);
}
if (!["R1", "R2", "R3", "R4"].includes(motivo)) {
  console.error("--motivo deve essere R1, R2, R3 o R4.");
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

const dataIt = (d) => (d ? new Date(d).toLocaleDateString("it-IT", { timeZone: "UTC" }) : "—");
const eur = (n) => `${Number(n).toFixed(2)} €`;
const include = {
  cliente: { select: { id: true, nome: true } },
  acconti: { select: { importo: true } },
  rettifiche: { select: { numero: true, stato: true, tipoRettifica: true, annullata: true } },
  rettificaDi: { select: { numero: true } },
  _count: { select: { solleciti: true, abbinamentiBancari: true } },
};
const stampa = (titolo, f) => {
  const incassi = f.acconti.reduce((s, a) => s + a.importo, 0);
  console.log(`${titolo}: ${f.numero} (#${f.id})`);
  console.log(`  data ${dataIt(f.data)} · scadenza ${dataIt(f.scadenza)} · ${f.mese}/${f.anno}`);
  console.log(`  cliente ${f.cliente ? `${f.cliente.nome} (#${f.cliente.id})` : "—"}`);
  console.log(`  importo ${eur(f.importo)} · ${f.tipoIva} · stato ${f.stato} · pagato ${f.pagato} · incassi ${eur(incassi)} (${f.acconti.length}) · banca ${f._count.abbinamentiBancari}`);
  console.log(`  tipo ${f.tipoFattura}${f.tipoRettifica ? ` (${f.tipoRettifica})` : ""} · rettifica di ${f.rettificaDi?.numero ?? "—"} · rettifiche [${f.rettifiche.map((r) => `${r.numero ?? "bozza"} ${r.stato} ${r.tipoRettifica ?? ""}${r.annullata ? " annullata" : ""}`).join(", ")}]`);
  console.log(`  annullata ${f.annullata}${f.annullataIl ? ` il ${dataIt(f.annullataIl)}` : ""} · VeriFactu ${f.vfStato ?? "—"} · solleciti ${f._count.solleciti} · contratto ${f.contrattoId ?? "—"} · commerciale ${f.commercialeId ?? "—"}`);
};

async function main() {
  // Il numero non è una chiave unica nello schema: deve esserci una fattura sola
  const perNumero = async (numero) => {
    const righe = await prisma.fattura.findMany({ where: { numero }, include });
    if (righe.length === 0) throw new Error(`Fattura ${numero} non trovata.`);
    if (righe.length > 1) throw new Error(`Il numero ${numero} è usato da ${righe.length} fatture (#${righe.map((r) => r.id).join(", #")}).`);
    return righe[0];
  };
  const [orig, rett] = await Promise.all([perNumero(numOriginale), perNumero(numRettifica)]);
  stampa("Fattura corretta", orig);
  stampa("Rettificativa", rett);
  console.log();

  // Stesse regole di POST /api/fatture/[id]/rettifica e dell'emissione
  const errori = [];
  if (orig.stato !== "emessa") errori.push(`${orig.numero} non è emessa.`);
  if (orig.tipoFattura !== "F1") errori.push(`${orig.numero} è già una rettificativa.`);
  if (orig.annullata) errori.push(`${orig.numero} è già annullata.`);
  if (orig.pagato || orig.acconti.length) errori.push(`${orig.numero} ha incassi o è segnata incassata: la sostituzione non si può fare.`);
  if (orig.vfStato) errori.push(`${orig.numero} è stata trasmessa a VeriFactu: l'annullamento deve passare dall'AEAT.`);
  if (orig.rettifiche.some((r) => r.stato === "emessa" && r.tipoRettifica === "S" && !r.annullata))
    errori.push(`${orig.numero} ha già una rettificativa per sostituzione emessa.`);
  if (rett.stato !== "emessa") errori.push(`${rett.numero} non è emessa.`);
  if (rett.annullata) errori.push(`${rett.numero} è annullata.`);
  if (rett.rettificaDiId) errori.push(`${rett.numero} è già collegata a ${rett.rettificaDi?.numero}.`);
  if (rett.id === orig.id) errori.push("Sono la stessa fattura.");
  if (rett.clienteId !== orig.clienteId) errori.push("Le due fatture hanno clienti diversi.");
  if (rett.importo <= 0) errori.push(`${rett.numero} ha importo non positivo: per sostituzione serve l'importo intero giusto.`);
  if (errori.length) {
    console.error("Non si può collegare:\n- " + errori.join("\n- "));
    process.exit(1);
  }

  // Come la bozza di sostituzione: eredita contratto e commerciale se mancano
  const datiRett = { tipoFattura: motivo, tipoRettifica: "S", rettificaDiId: orig.id };
  if (!rett.contrattoId && orig.contrattoId) datiRett.contrattoId = orig.contrattoId;
  if (!rett.commercialeId && orig.commercialeId) datiRett.commercialeId = orig.commercialeId;
  console.log(`Da fare:`);
  console.log(`- ${rett.numero}: ${JSON.stringify(datiRett)}`);
  console.log(`- ${orig.numero}: annullata = true (mostrata «Rettificata», fuori da totali e scadenze)`);
  if (!apply) {
    console.log("\nProva finita: niente scritto. Aggiungi --apply per applicare.");
    return;
  }

  await prisma.$transaction([
    prisma.fattura.update({ where: { id: rett.id }, data: datiRett }),
    prisma.fattura.update({ where: { id: orig.id }, data: { annullata: true, annullataIl: new Date() } }),
  ]);
  console.log("\nApplicato. Verifica:");
  const [o2, r2] = await Promise.all([
    prisma.fattura.findUnique({ where: { id: orig.id }, include }),
    prisma.fattura.findUnique({ where: { id: rett.id }, include }),
  ]);
  stampa("Fattura corretta", o2);
  stampa("Rettificativa", r2);
  const ok = o2.annullata && r2.rettificaDiId === o2.id && r2.tipoRettifica === "S" && r2.tipoFattura === motivo;
  console.log(ok ? "\nOK: collegate." : "\nATTENZIONE: il risultato non è quello atteso.");
  if (!ok) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

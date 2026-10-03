// Paese = sede della controparte (non più l'azienda che fattura). Per
// clienti e fornitori ricava il paese dalla P.IVA/NIF (formato o prefisso)
// e, se manca, da indizi nel nome (Ltd UK, Ireland, PBC…); con --piva
// aggiunge anche il prefisso del paese alle P.IVA che non l'hanno.
// Stampa sempre la lista delle modifiche; senza --apply non scrive nulla.
// Uso: node scripts/sistema-paesi.mjs [--piva] [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const apply = process.argv.includes("--apply");
const conPiva = process.argv.includes("--piva");
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

// Stessa tabella di lib/constants.ts (PAESI_CODICE)
const CODICE = {
  Italia: "IT", Spagna: "ES", Francia: "FR", Germania: "DE", Portogallo: "PT",
  "Regno Unito": "GB", Irlanda: "IE", "Paesi Bassi": "NL", Belgio: "BE",
  Lussemburgo: "LU", Austria: "AT", Svizzera: "", "Stati Uniti": "", Altro: "",
};
const PAESE_DI = Object.fromEntries(Object.entries(CODICE).filter(([, c]) => c).map(([p, c]) => [c, p]));

// Correzioni confermate dall'utente (2026-10-03) per chi non ha P.IVA:
// erano segnati Spagna solo perché non passavano da SMH.
const CORREZIONI = {
  cliente: { "Judo Azzanese": "Italia", "Abitare Cattai": "Italia" },
  fornitore: {},
};

const pulita = (v) => String(v ?? "").toUpperCase().replace(/[\s.\-/]/g, "");

// Paese dalla P.IVA/NIF: prima i formati nazionali senza prefisso, poi il
// prefisso. Il codice fiscale italiano va prima del prefisso ("DEL…" non è
// tedesco).
function paeseDaPiva(piva) {
  const v = pulita(piva);
  if (!v) return null;
  if (/^PIVA\d{11}$/.test(v)) return "Italia";
  if (/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(v)) return "Italia"; // codice fiscale
  if (/^\d{11}$/.test(v)) return "Italia"; // partita IVA
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) return "Spagna"; // NIF società
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return "Spagna"; // NIE
  if (/^\d{8}[A-Z]$/.test(v)) return "Spagna"; // DNI
  if (/^\d{7}[A-W][A-I]?$/.test(v)) return "Irlanda";
  const m = v.match(/^([A-Z]{2})([A-Z0-9]{8,16})$/);
  if (m && PAESE_DI[m[1]]) return PAESE_DI[m[1]];
  return null;
}

function paeseDaNome(nome) {
  const n = ` ${String(nome ?? "").toUpperCase()} `;
  if (/\bPBC\b|\bINC\b|\bLLC\b/.test(n)) return "Stati Uniti";
  if (/IRELAND|\bDAC\b/.test(n)) return "Irlanda";
  if (/\bUK\b|UNITED KINGDOM/.test(n)) return "Regno Unito";
  if (/S\.?\s?[ÀA]\.?\s?R\.?\s?L\.?\b.*\bEU\b|LUXEMBOURG/.test(n)) return "Lussemburgo";
  return null;
}

// P.IVA con il prefisso del paese (solo paesi UE con codice)
function conPrefisso(piva, paese) {
  const codice = CODICE[paese];
  const v = pulita(piva);
  if (!codice || !v) return null;
  const pivaIt = v.match(/^PIVA(\d{11})$/);
  if (pivaIt) return `IT${pivaIt[1]}`;
  if (v.startsWith(codice)) return v === piva ? null : v;
  const m = v.match(/^([A-Z]{2})([A-Z0-9]{8,16})$/);
  if (m && PAESE_DI[m[1]] && paeseDaPiva(v) !== paese) return null; // prefisso di un altro paese: non tocco
  return `${codice}${v}`;
}

async function sistema(tabella, righe) {
  const modifiche = [];
  const senzaIndizi = [];
  for (const r of righe) {
    const corretto = CORREZIONI[tabella][r.nome.trim()] ?? null;
    const daPiva = corretto ? null : paeseDaPiva(r.partitaIva);
    const daNome = corretto || daPiva ? null : paeseDaNome(r.nome);
    const paese = corretto ?? daPiva ?? daNome ?? r.paese;
    const data = {};
    const perche = [];
    if (paese !== r.paese) {
      data.paese = paese;
      perche.push(`paese ${r.paese} → ${paese} (${corretto ? "confermato dall'utente" : daPiva ? "da P.IVA/NIF" : "dal nome"})`);
    }
    if (conPiva) {
      const p = conPrefisso(r.partitaIva, paese);
      if (p && p !== r.partitaIva) {
        data.partitaIva = p;
        perche.push(`P.IVA ${r.partitaIva} → ${p}`);
      }
    }
    if (perche.length) modifiche.push({ r, data, perche });
    else if (!corretto && !daPiva && !daNome && !r.partitaIva) senzaIndizi.push(r);
  }
  console.log(`── ${tabella}: ${modifiche.length} da sistemare`);
  for (const m of modifiche) console.log(`  #${m.r.id} ${m.r.nome}: ${m.perche.join(" · ")}`);
  if (senzaIndizi.length) {
    console.log(`  senza P.IVA né indizi (restano come sono, da verificare a mano):`);
    for (const r of senzaIndizi) console.log(`    #${r.id} ${r.nome} — ${r.paese}${r.citta ? ` · ${r.citta}` : ""}${r.provincia ? ` (${r.provincia})` : ""}`);
  }
  console.log("");
  if (apply) {
    for (const m of modifiche) await prisma[tabella].update({ where: { id: m.r.id }, data: m.data });
  }
  return modifiche.length;
}

const sel = { id: true, nome: true, paese: true, partitaIva: true, citta: true, provincia: true };
const nC = await sistema("cliente", await prisma.cliente.findMany({ select: sel, orderBy: { id: "asc" } }));
const nF = await sistema("fornitore", await prisma.fornitore.findMany({ select: sel, orderBy: { id: "asc" } }));
console.log(`${apply ? "Aggiornati" : "Da aggiornare"}: ${nC} clienti, ${nF} fornitori`);
await prisma.$disconnect();

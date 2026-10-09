// Importa i rinnovi dei siti dal foglio Google «DOMINI SOCIALSUITEVIDEO -
// Scadenze e Rinnovi» (CSV esportato dal foglio «SCADENZE E RINNOVI»).
//
// - Cliente: prima l'anagrafica Anda (nome, P.IVA, dominio), poi Northstar
//   (Mongo locale, db wakeuplabs, collezione clients): i clienti che mancano
//   si creano in Anda con i dati di Northstar; altrimenti resta il nome del
//   foglio come promemoria (nomeCliente).
// - Scadenze passate → prossima ricorrenza (stesso giorno e mese). Restano
//   com'erano i «Non attivi» e le righe «Fattura da emettere», che ricevono
//   subito la richiesta di fattura (da validare).
// - Prezzo → importo e fatturazione «rinnovo»; senza prezzo: «compresa» se
//   la nota dice "compreso", altrimenti «nessuna» (sito nostro).
// - Colonne Reforge e SMH/ANDA: la prima finisce nelle note, la seconda
//   mette la spunta SMH solo sui clienti nuovi.
// Idempotente: salta i domini già presenti e i clienti già creati.
//
// Uso: node scripts/importa-rinnovi.mjs <file.csv> [--apply] [--senza-northstar]
//      (senza --apply stampa il piano e non scrive niente)
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const senzaNorthstar = args.includes("--senza-northstar");
if (!file) {
  console.error("Uso: node scripts/importa-rinnovi.mjs <file.csv> [--apply] [--senza-northstar]");
  process.exit(1);
}
// Driver Mongo preso dal monorepo di Northstar: qui non serve come dipendenza
const MONGO_URL = process.env.NORTHSTAR_MONGO_URL ?? "mongodb://127.0.0.1:27017";
const MONGO_DB = process.env.NORTHSTAR_MONGO_DB ?? "wakeuplabs";
const MONGO_DRIVER =
  process.env.MONGODB_DRIVER ??
  "/Users/b16451536/NORTHSTAR/corekit-monorepo/node_modules/mongodb/lib/index.js";
const ANTICIPO_GIORNI = 45;
const UN_GIORNO = 86_400_000;

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const host = (process.env.DATABASE_URL.match(/@([^/]+)\//) || [])[1];
console.log(`DB: ${host}${apply ? "" : " (prova: nessuna scrittura)"}\n`);

// ── CSV ────────────────────────────────────────────────────────────────────
const parseRiga = (line) => {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
};
const STATI = {
  ATTIVO: "attivo",
  "NON ATTIVO": "non_attivo",
  "IN LAVORAZIONE": "in_lavorazione",
  "IN DUBBIO": "in_dubbio",
};
const parseImporto = (s) =>
  parseFloat(String(s || "").replace(/[€\s.]/g, "").replace(",", ".")) || 0;
const parseData = (s) => {
  const m = String(s).match(/^(\d\d)\/(\d\d)\/(\d{4})$/);
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
};
const dataIt = (d) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const pulisciDominio = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
const vuoto = (s) => !s || s === "-";

const righe = fs
  .readFileSync(file, "utf8")
  .split(/\r?\n/)
  .filter((l) => /^\d\d\/\d\d\/\d{4},/.test(l))
  .map(parseRiga)
  .map(
    ([data, stato, reforge, fatt, canale, contact, account, dominio, prezzo, hosting, prop, accesso, note]) => ({
      data: parseData(data),
      dataTesto: data,
      stato: STATI[stato.toUpperCase()] ?? "attivo",
      statoTesto: stato,
      reforge,
      daFatturare: !!fatt,
      canale: canale.toUpperCase(),
      contact: vuoto(contact) ? "" : contact,
      account: vuoto(account) ? "" : account,
      dominio: pulisciDominio(dominio),
      importo: parseImporto(prezzo),
      hosting: hosting || null,
      proprieta: /esterno/i.test(prop) ? "cliente" : "nostra",
      accesso: vuoto(accesso) ? null : accesso,
      note: note || "",
    }),
  )
  .filter((r) => r.dominio && r.data);

// Stesso dominio su più righe: tiene quella col prezzo, le altre vanno in nota
const perDominio = new Map();
for (const r of righe) {
  const g = perDominio.get(r.dominio);
  if (!g) perDominio.set(r.dominio, [r]);
  else g.push(r);
}
const domini = [...perDominio.values()].map((g) => {
  const primaria = [...g].sort((a, b) => b.importo - a.importo)[0];
  const altre = g.filter((x) => x !== primaria);
  return { ...primaria, altre };
});

// ── Abbinamento nomi ───────────────────────────────────────────────────────
const STOP = new Set([
  "srl", "srls", "sas", "snc", "spa", "ssd", "asd", "arl", "stp", "del", "della", "dei", "the",
  "societa", "società", "studio", "associazione", "immobiliare", "azienda", "agricola", "cantina",
]);
const tokens = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
const compatto = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
const punteggio = (a, b) => {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  const min = Math.min(A.size, B.size);
  if (!hit) return 0;
  // una parola sola basta solo se uno dei due nomi è fatto di quella parola
  return (hit / min) * (hit >= 2 || min === 1 ? 1 : 0.6);
};
const stemDominio = (d) => compatto(d.replace(/\.[a-z]+$/, ""));
// Soglia 0.65: due parole uguali su tre bastano (es. «Etnik Lounge Cafe» ↔ «Etnik Cafe di…»)
const migliore = (lista, nome, q, soglia = 0.65) => {
  let b = null;
  for (const x of lista) {
    const s = punteggio(nome(x), q);
    if (s >= soglia && s > (b?.s ?? 0)) b = { x, s };
  }
  return b;
};
const perCompatto = (lista, nome, q) => {
  const cq = compatto(q);
  if (cq.length < 5) return null;
  const x = lista.find((x) => {
    const cn = compatto(nome(x));
    return cn.startsWith(cq) || cq.startsWith(cn);
  });
  return x ? { x, s: 0.9 } : null;
};
// Per i referenti serve il nome intero: nome e cognome tutti e due nel candidato
const perNomeIntero = (lista, nome, q) => {
  const tq = tokens(q);
  if (tq.length < 2) return null;
  const x = lista.find((x) => {
    const tn = tokens(nome(x));
    return tq.every((t) => tn.includes(t));
  });
  return x ? { x, s: 1 } : null;
};
const perStem = (lista, nome, dominio) => {
  const stem = stemDominio(dominio);
  if (stem.length < 6) return null;
  const x = lista.find((x) => compatto(nome(x)).includes(stem));
  return x ? { x, s: 0.8 } : null;
};
const soloCifre = (s) => String(s || "").replace(/\D/g, "");

// ── Anagrafiche ────────────────────────────────────────────────────────────
const clientiAnda = await prisma.cliente.findMany({
  select: { id: true, nome: true, partitaIva: true, note: true },
});
const nomeAnda = (c) => c.nome;

let ns = null;
if (!senzaNorthstar) {
  try {
    const { MongoClient } = await import(MONGO_DRIVER);
    const m = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 3000 });
    await m.connect();
    const db = m.db(MONGO_DB);
    ns = {
      close: () => m.close(),
      clienti: await db.collection("clients").find({}).toArray(),
      contatti: await db
        .collection("contacts")
        .find({}, { projection: { client_code: 1, first_name: 1, last_name: 1 } })
        .toArray(),
      siti: await db
        .collection("company_websites")
        .find({ created_by_client_id: { $exists: true } }, { projection: { domain: 1, created_by_client_id: 1 } })
        .toArray(),
    };
    ns.perId = new Map(ns.clienti.map((c) => [String(c._id), c]));
    ns.perCodice = new Map(ns.clienti.map((c) => [c.code, c]));
    console.log(`Northstar: ${ns.clienti.length} clienti, ${ns.contatti.length} contatti, ${ns.siti.length} siti\n`);
  } catch (e) {
    console.log(`Northstar non raggiungibile (${e.message}): i clienti mancanti restano come nome.\n`);
    ns = null;
  }
}
const nomeNs = (c) => c.name;

const PAESI = {
  IT: "Italia", ES: "Spagna", FR: "Francia", DE: "Germania", PT: "Portogallo", GB: "Regno Unito",
  IE: "Irlanda", NL: "Paesi Bassi", BE: "Belgio", LU: "Lussemburgo", AT: "Austria", CH: "Svizzera", US: "Stati Uniti",
};
const PREFISSI = {
  Italia: "IT", Spagna: "ES", Francia: "FR", Germania: "DE", Portogallo: "PT", "Regno Unito": "GB",
  Irlanda: "IE", "Paesi Bassi": "NL", Belgio: "BE", Lussemburgo: "LU", Austria: "AT",
};

// Dati del cliente Anda a partire da quello Northstar
const clienteDaNorthstar = (c, smh) => {
  const paese =
    PAESI[String(c.billing_country || "").toUpperCase()] ??
    (/ital/i.test(c.address?.country || "")
      ? "Italia"
      : /espa|spain|spagna/i.test(c.address?.country || "")
        ? "Spagna"
        : "Italia");
  const vat = soloCifre(c.vat_number);
  const cf = String(c.fiscal_code || "").trim().toUpperCase();
  let partitaIva = null;
  if (vat) partitaIva = (PREFISSI[paese] ?? "") + vat;
  else if (cf) partitaIva = cf;
  const extra = [];
  if (c.pec) extra.push(`PEC ${c.pec}`);
  if (c.sdi) extra.push(`SDI ${c.sdi}`);
  if (cf && vat && cf !== vat) extra.push(`CF ${cf}`);
  return {
    nome: String(c.name).trim(),
    paese,
    email: c.email || null,
    telefono: c.phone || null,
    partitaIva,
    via: c.address?.street || null,
    cap: c.address?.postal_code || null,
    citta: c.address?.city || null,
    provincia: c.address?.province || null,
    tipoImposta: "IGIC Exenta",
    smh,
    note: [`Importato da Northstar (${c.code})`, ...extra].join(" · "),
  };
};

// ── Piano ──────────────────────────────────────────────────────────────────
const oggi = new Date();
const oggiUTC = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
const prossimaRicorrenza = (d) => {
  let x = d;
  while (x.getTime() < oggiUTC) {
    x = new Date(Date.UTC(x.getUTCFullYear() + 1, x.getUTCMonth(), x.getUTCDate()));
  }
  return x;
};

let esistenti = new Set();
if (prisma.rinnovoSito) {
  esistenti = new Set(
    (await prisma.rinnovoSito.findMany({ select: { dominio: true } })).map((r) => r.dominio),
  );
} else {
  console.log("ATTENZIONE: client Prisma senza RinnovoSito (manca prisma generate): salto il controllo dei domini già presenti.\n");
}

const daCreareNs = new Map(); // codice NS → dati cliente
const piano = [];
for (const r of domini) {
  // Cliente Anda
  let anda = null;
  let via = "";
  if (r.account) {
    anda = migliore(clientiAnda, nomeAnda, r.account) ?? perCompatto(clientiAnda, nomeAnda, r.account);
    if (anda) via = "account";
  }
  if (!anda) {
    anda = perStem(clientiAnda, nomeAnda, r.dominio);
    if (anda) via = "dominio";
  }
  if (!anda && r.contact) {
    anda = perNomeIntero(clientiAnda, nomeAnda, r.contact);
    if (anda) via = "contatto";
  }
  // Cliente Northstar
  let nsHit = null;
  let viaNs = "";
  if (ns) {
    const sito = ns.siti.find((x) => String(x.domain || "").toLowerCase() === r.dominio);
    const c = sito && ns.perId.get(String(sito.created_by_client_id));
    if (c) {
      nsHit = { x: c, s: 1 };
      viaNs = "sito";
    }
    if (!nsHit && r.account) {
      nsHit = migliore(ns.clienti, nomeNs, r.account) ?? perCompatto(ns.clienti, nomeNs, r.account);
      if (nsHit) viaNs = "account";
    }
    if (!nsHit) {
      nsHit = perStem(ns.clienti, nomeNs, r.dominio);
      if (nsHit) viaNs = "dominio";
    }
    if (!nsHit && r.contact) {
      const ct = perNomeIntero(ns.contatti, (c) => `${c.first_name ?? ""} ${c.last_name ?? ""}`, r.contact);
      const c = ct && ns.perCodice.get(ct.x.client_code);
      if (c) {
        nsHit = { x: c, s: ct.s };
        viaNs = `contatto ${ct.x.first_name} ${ct.x.last_name}`;
      }
    }
    // Le organizzazioni interne di Northstar (ORG-…) non sono clienti
    if (nsHit && !/^CLI-/.test(nsHit.x.code || "")) nsHit = null;
  }
  // Northstar trovato, Anda no: forse c'è già per P.IVA, nome uguale o import precedente
  if (!anda && nsHit) {
    const vat = soloCifre(nsHit.x.vat_number);
    const c =
      (vat && clientiAnda.find((c) => soloCifre(c.partitaIva).endsWith(vat))) ||
      clientiAnda.find((c) => compatto(c.nome) === compatto(nsHit.x.name)) ||
      clientiAnda.find((c) => (c.note || "").includes(`(${nsHit.x.code})`));
    if (c) {
      anda = { x: c, s: 1 };
      via = "P.IVA/nome Northstar";
    }
  }

  let cliente;
  if (anda) cliente = { tipo: "anda", id: anda.x.id, nome: anda.x.nome, via };
  else if (nsHit) {
    const codice = nsHit.x.code;
    if (!daCreareNs.has(codice)) daCreareNs.set(codice, clienteDaNorthstar(nsHit.x, r.canale === "SMH"));
    cliente = { tipo: "nuovo", codice, nome: daCreareNs.get(codice).nome, via: viaNs };
  } else if (r.account || r.contact) cliente = { tipo: "nome", nome: r.account || r.contact };
  // Fattura da fare ma nessun nome nel foglio: resta il dominio come promemoria
  else if (r.daFatturare) cliente = { tipo: "nome", nome: r.dominio };
  else cliente = { tipo: "nessuno" };

  // Scadenza
  let scadenza = r.data;
  let spostata = false;
  if (r.stato !== "non_attivo" && !r.daFatturare && scadenza.getTime() < oggiUTC) {
    scadenza = prossimaRicorrenza(scadenza);
    spostata = true;
  }
  const fatturazione = r.importo > 0 ? "rinnovo" : /compres/i.test(r.note) ? "compresa" : "nessuna";
  const note = [
    r.note,
    r.reforge ? `Reforge: ${r.reforge}` : "",
    ...r.altre.map(
      (a) =>
        `Nel foglio anche: ${a.dataTesto} ${a.statoTesto}${a.hosting ? ` · ${a.hosting}` : ""}${a.importo ? ` · € ${a.importo}` : ""}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  piano.push({
    ...r,
    cliente,
    scadenza,
    spostata,
    fatturazione,
    note: note || null,
    giaPresente: esistenti.has(r.dominio),
  });
}

// ── Stampa ─────────────────────────────────────────────────────────────────
const etichettaCliente = (c) =>
  c.tipo === "anda"
    ? `ANDA #${c.id} ${c.nome}`
    : c.tipo === "nuovo"
      ? `NUOVO da NS ${c.codice} ${c.nome}`
      : c.tipo === "nome"
        ? `solo nome: ${c.nome}`
        : "—";
console.log(
  `${"DOMINIO".padEnd(30)} ${"SCADENZA".padEnd(22)} ${"STATO".padEnd(14)} ${"IMPORTO".padStart(8)}  ${"FATT.".padEnd(8)} CLIENTE`,
);
for (const p of piano) {
  const scad = `${dataIt(p.scadenza)}${p.spostata ? ` (era ${p.dataTesto})` : ""}`;
  console.log(
    `${(p.giaPresente ? "= " : "+ ") + p.dominio.padEnd(28)} ${scad.padEnd(22)} ${p.stato.padEnd(14)} ${(p.importo ? String(p.importo) : "").padStart(8)}  ${p.fatturazione.padEnd(8)} ${etichettaCliente(p.cliente)}${p.cliente.via ? ` [${p.cliente.via}]` : ""}${p.daFatturare ? "  → RICHIESTA SUBITO" : ""}`,
  );
}
const conta = (f) => piano.filter(f).length;
console.log(`
Domini nel foglio: ${piano.length} (righe ${righe.length}, già presenti ${conta((p) => p.giaPresente)})
Cliente: già in Anda ${conta((p) => p.cliente.tipo === "anda")} · da creare da Northstar ${conta((p) => p.cliente.tipo === "nuovo")} (${daCreareNs.size} clienti) · solo nome ${conta((p) => p.cliente.tipo === "nome")} · nessuno ${conta((p) => p.cliente.tipo === "nessuno")}
Scadenze spostate alla prossima ricorrenza: ${conta((p) => p.spostata)} · richieste di fattura da creare subito: ${conta((p) => p.daFatturare && !p.giaPresente)}
Fatturazione: rinnovo ${conta((p) => p.fatturazione === "rinnovo")} · compresa ${conta((p) => p.fatturazione === "compresa")} · nessuna ${conta((p) => p.fatturazione === "nessuna")}`);
if (daCreareNs.size) {
  console.log("\nClienti nuovi da Northstar:");
  for (const [codice, c] of daCreareNs) {
    console.log(
      `  ${codice.padEnd(10)} ${c.nome.padEnd(45)} ${(c.partitaIva ?? "").padEnd(14)} ${c.paese.padEnd(8)} ${[c.via, c.cap, c.citta, c.provincia].filter(Boolean).join(", ")}${c.email ? ` · ${c.email}` : ""}${c.smh ? " · SMH" : ""}`,
    );
  }
}

if (!apply) {
  console.log("\nProva finita: niente scritto. Con --apply si importa.");
  await prisma.$disconnect();
  await ns?.close();
  process.exit(0);
}

// ── Scrittura ──────────────────────────────────────────────────────────────
if (!prisma.rinnovoSito) {
  console.error("Manca il modello RinnovoSito nel client Prisma: prima `npx prisma migrate deploy` e `npx prisma generate`.");
  process.exit(1);
}
const round2 = (n) => Math.round(n * 100) / 100;
async function nextCodiceRichiesta(tx, anno) {
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

const idPerCodiceNs = new Map();
let nClienti = 0;
for (const [codice, dati] of daCreareNs) {
  const c = await prisma.cliente.create({ data: dati, select: { id: true } });
  idPerCodiceNs.set(codice, c.id);
  nClienti++;
  console.log(`cliente #${c.id} creato: ${dati.nome} (${codice})`);
}

let nRinnovi = 0;
let nRichieste = 0;
for (const p of piano) {
  if (p.giaPresente) continue;
  const clienteId =
    p.cliente.tipo === "anda"
      ? p.cliente.id
      : p.cliente.tipo === "nuovo"
        ? idPerCodiceNs.get(p.cliente.codice)
        : null;
  const nomeCliente = clienteId ? null : p.cliente.tipo === "nome" ? p.cliente.nome : null;
  const r = await prisma.rinnovoSito.create({
    data: {
      dominio: p.dominio,
      clienteId,
      nomeCliente,
      scadenza: p.scadenza,
      importo: p.importo,
      fatturazione: p.fatturazione,
      stato: p.stato,
      hosting: p.hosting,
      proprieta: p.proprieta,
      accesso: p.accesso,
      note: p.note,
    },
    include: { cliente: { select: { tipoImposta: true } } },
  });
  nRinnovi++;
  if (p.daFatturare && p.importo > 0 && (clienteId || nomeCliente)) {
    // Stessa regola di lib/rinnovi.ts: invio = scadenza − anticipo, mai nel passato
    let invio = new Date(r.scadenza.getTime() - ANTICIPO_GIORNI * UN_GIORNO);
    if (invio.getTime() < oggiUTC) invio = new Date(oggiUTC);
    const anno = invio.getUTCFullYear();
    const descrizione = `Rinnovo sito web ${r.dominio} — scadenza ${dataIt(r.scadenza)}`;
    const tipoIva = r.cliente?.tipoImposta === "IGIC 7%" ? "igic7" : "igic_exenta";
    const iva = tipoIva === "igic7" ? 7 : 0;
    await prisma.$transaction(async (tx) => {
      await tx.richiestaFattura.create({
        data: {
          codice: await nextCodiceRichiesta(tx, anno),
          clienteId,
          nomeCliente,
          azienda: "Spagna",
          descrizione,
          voci: JSON.stringify([{ descrizione, importo: r.importo }]),
          imponibile: round2(r.importo),
          tipoIva,
          iva,
          totale: round2(r.importo * (1 + iva / 100)),
          mese: invio.getUTCMonth() + 1,
          anno,
          dataInvio: invio,
          serieCodice: r.dominio,
          ricorrenza: "annuale",
          validazione: "in_attesa",
          origine: "rinnovo",
          rinnovoId: r.id,
          rinnovoScadenza: r.scadenza,
        },
      });
    });
    nRichieste++;
  }
}
console.log(`\nFatto: ${nClienti} clienti creati, ${nRinnovi} rinnovi importati, ${nRichieste} richieste di fattura create.`);
await prisma.$disconnect();
await ns?.close();

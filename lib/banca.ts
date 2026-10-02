import { createHash } from "crypto";
import * as XLSX from "xlsx";
import type { Prisma, PrismaClient } from "@prisma/client";
import { nomeCompleto } from "./dipendenti";
import { applySplit, deleteSplitForFattura, getSplitType } from "./finn-split";
import { syncCommissioneFattura } from "./commissioni";
import {
  ESCLUDI,
  CATEGORIA_DEFAULT,
  REGOLE_BANCA_DEFAULT,
  categoriaValida,
  type RegolaBanca,
  type VoceMemoria,
  type ImpostazioniBanca,
  type CandidatoSpesa,
  type Suggerimento,
  type FatturaCandidata,
  type SuggerimentoEntrata,
  type CategoriaAltroIngresso,
} from "./banca-shared";

export * from "./banca-shared";

type Db = PrismaClient | Prisma.TransactionClient;

export const centesimi = (n: number) => Math.round(Math.abs(n) * 100);
export const pulisci = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
export const meseAnno = (d: Date) => ({
  mese: d.getUTCMonth() + 1,
  anno: d.getUTCFullYear(),
});
// Testo normalizzato per confronti: minuscolo, senza accenti e punteggiatura
export const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
// Beneficiario mascherato dalla banca ("***************")
export const mascherato = (s: string | null | undefined) =>
  !s || /^[*\s]+$/.test(s);

// ─── Parsing file BBVA "Histórico movimientos" ───────────────────────
export interface RigaEstratto {
  impronta: string;
  dataContabile: Date;
  dataValore: Date | null;
  codice: string | null;
  concetto: string;
  beneficiario: string | null;
  osservazioni: string | null;
  importo: number;
  saldo: number | null;
}
export interface EstrattoParsed {
  conto: string | null;
  titolare: string | null;
  periodoDa: Date | null;
  periodoA: Date | null;
  righe: RigaEstratto[];
  hashFile: string;
}

export function parseData(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? new Date(Date.UTC(d.y, d.m - 1, d.d)) : null;
  }
  const s = pulisci(v);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return new Date(Date.UTC(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
  }
  return null;
}

// Accetta numeri, "1,123.00" (BBVA), "1.123,00" (europeo), "-315.00"
export function parseImporto(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  let s = String(v).trim().replace(/[€\s]/g, "");
  if (/,\d{1,2}$/.test(s) && s.indexOf(".") < s.lastIndexOf(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

export function parseEstrattoBBVA(buffer: Buffer): EstrattoParsed {
  const hashFile = createHash("sha256").update(buffer).digest("hex");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => /hist[óo]rico/i.test(n)) ?? wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) throw new Error("Foglio dei movimenti non trovato nel file.");

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  // Riga intestazione: quella che contiene "F. CONTABLE"
  const hi = aoa.findIndex((r) =>
    (r ?? []).some((c) => typeof c === "string" && /CONTABLE/i.test(c)),
  );
  if (hi < 0) {
    throw new Error(
      'Formato non riconosciuto: manca l\'intestazione "F. CONTABLE". Usa l\'export XLSX "Histórico movimientos" di BBVA.',
    );
  }
  const header = (aoa[hi] ?? []).map((c) => norm(typeof c === "string" ? c : ""));
  const col = (...keys: string[]) =>
    header.findIndex((h) => keys.some((k) => h.includes(k)));
  const C = {
    data: col("contable"),
    valor: col("valor"),
    codice: col("codigo"),
    concetto: col("concepto"),
    beneficiario: col("beneficiario", "ordenante"),
    osservazioni: col("observaciones"),
    importo: col("importe"),
    saldo: col("saldo"),
    remesa: col("remesa"),
  };
  if (C.data < 0 || C.importo < 0 || C.concetto < 0) {
    throw new Error("Formato non riconosciuto: colonne F. CONTABLE / CONCEPTO / IMPORTE mancanti.");
  }

  // Metadati sopra l'intestazione (Titular, Cuenta, Periodo): etichetta +
  // primo valore non vuoto sulla stessa riga.
  const meta: Record<string, string> = {};
  for (let i = 0; i < hi; i++) {
    const cells = (aoa[i] ?? []).map((c) => pulisci(c)).filter(Boolean);
    if (cells.length >= 2) meta[norm(cells[0])] = cells[1];
  }
  const conto = meta.cuenta ?? null;
  const titolare = meta.titular ?? null;
  let periodoDa: Date | null = null;
  let periodoA: Date | null = null;
  if (meta.periodo) {
    const parti = meta.periodo.split(/\s*-\s*/);
    periodoDa = parseData(parti[0]);
    periodoA = parseData(parti[1]);
  }

  const cell = (row: unknown[], idx: number) => (idx >= 0 ? row[idx] : null);
  const testo = (row: unknown[], idx: number) => {
    const s = pulisci(cell(row, idx));
    return s ? s : null;
  };

  const righe: RigaEstratto[] = [];
  const visti = new Map<string, number>();
  for (let i = hi + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const dataContabile = parseData(cell(row, C.data));
    const importo = parseImporto(cell(row, C.importo));
    if (!dataContabile || importo === null || importo === 0) continue;
    const concetto = testo(row, C.concetto) ?? "";
    const beneficiarioRaw = testo(row, C.beneficiario);
    const beneficiario = mascherato(beneficiarioRaw) ? null : beneficiarioRaw;
    const osservazioni = testo(row, C.osservazioni);
    const codice = testo(row, C.codice);
    const remesa = testo(row, C.remesa);
    let impronta: string;
    if (remesa) {
      impronta = `bbva:${remesa}`;
    } else {
      const base = [
        dataContabile.toISOString().slice(0, 10),
        importo.toFixed(2),
        norm(concetto),
        norm(beneficiarioRaw),
        norm(osservazioni),
      ].join("|");
      const n = (visti.get(base) ?? 0) + 1;
      visti.set(base, n);
      impronta = `h:${sha1(`${base}|${n}`)}`;
    }
    righe.push({
      impronta,
      dataContabile,
      dataValore: parseData(cell(row, C.valor)),
      codice,
      concetto,
      beneficiario,
      osservazioni,
      importo: Math.round(importo * 100) / 100,
      saldo: parseImporto(cell(row, C.saldo)),
    });
  }

  if (!periodoDa || !periodoA) {
    for (const r of righe) {
      if (!periodoDa || r.dataContabile < periodoDa) periodoDa = r.dataContabile;
      if (!periodoA || r.dataContabile > periodoA) periodoA = r.dataContabile;
    }
  }
  return { conto, titolare, periodoDa, periodoA, righe, hashFile };
}

// ─── Impostazioni banca: regole di categoria + memoria beneficiari ───
const CHIAVE = "banca";

export const chiaveMemoria = (beneficiario: string | null | undefined) => {
  if (mascherato(beneficiario)) return "";
  const k = norm(beneficiario);
  return k.length >= 3 ? k : "";
};

export function sanificaRegole(input: unknown): RegolaBanca[] {
  if (!Array.isArray(input)) return [];
  const out: RegolaBanca[] = [];
  for (const r of input) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const pattern = pulisci(o.pattern);
    if (!pattern || !categoriaValida(o.categoria)) continue;
    try {
      new RegExp(pattern, "i");
    } catch {
      continue;
    }
    out.push({ pattern, categoria: o.categoria, fornitore: pulisci(o.fornitore) });
  }
  return out;
}

function sanificaMemoria(input: unknown): Record<string, VoceMemoria> {
  const out: Record<string, VoceMemoria> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!k || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (!categoriaValida(o.categoria) || o.categoria === ESCLUDI) continue;
    out[k] = { categoria: o.categoria, fornitore: pulisci(o.fornitore) };
  }
  return out;
}

export async function getImpostazioniBanca(db: Db): Promise<ImpostazioniBanca> {
  const row = await db.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (!row) return { regole: [...REGOLE_BANCA_DEFAULT], memoria: {} };
  let saved: Partial<ImpostazioniBanca> = {};
  try {
    saved = JSON.parse(row.valore) as Partial<ImpostazioniBanca>;
  } catch {
    saved = {};
  }
  return {
    regole: Array.isArray(saved.regole)
      ? sanificaRegole(saved.regole)
      : [...REGOLE_BANCA_DEFAULT],
    memoria: sanificaMemoria(saved.memoria),
  };
}

export async function salvaImpostazioniBanca(
  db: Db,
  patch: Partial<ImpostazioniBanca>,
): Promise<ImpostazioniBanca> {
  const attuali = await getImpostazioniBanca(db);
  const next: ImpostazioniBanca = {
    regole: patch.regole !== undefined ? sanificaRegole(patch.regole) : attuali.regole,
    memoria: patch.memoria !== undefined ? sanificaMemoria(patch.memoria) : attuali.memoria,
  };
  await db.impostazione.upsert({
    where: { chiave: CHIAVE },
    create: { chiave: CHIAVE, valore: JSON.stringify(next) },
    update: { valore: JSON.stringify(next) },
  });
  return next;
}

// Apprendimento: alla conferma di una categoria/fornitore per un
// beneficiario, la scelta vale per i movimenti successivi dello stesso.
// Non impara dai movimenti intestati a persone in anagrafica (soci,
// dipendenti): ricevono pagamenti di tipo diverso (stipendio, rimborsi,
// anticipi) e una sola categoria ricordata sbaglierebbe le altre.
export async function imparaBanca(
  db: Db,
  beneficiario: string | null | undefined,
  voce: VoceMemoria,
) {
  const key = chiaveMemoria(beneficiario);
  if (!key || !categoriaValida(voce.categoria) || voce.categoria === ESCLUDI) return;
  const persone = await db.dipendente.findMany({ select: { nome: true, cognome: true } });
  if (persone.some((d) => {
    const k = norm(nomeCompleto(d));
    return k.includes(" ") && (key.includes(k) || k.includes(key));
  })) {
    return;
  }
  const attuali = await getImpostazioniBanca(db);
  attuali.memoria[key] = { categoria: voce.categoria, fornitore: pulisci(voce.fornitore) };
  await salvaImpostazioniBanca(db, { memoria: attuali.memoria });
}

export interface RegolaCompilata {
  re: RegExp;
  categoria: string;
  fornitore: string;
}
export function compilaRegole(regole: RegolaBanca[]): RegolaCompilata[] {
  const out: RegolaCompilata[] = [];
  for (const r of regole) {
    try {
      out.push({ re: new RegExp(r.pattern, "i"), categoria: r.categoria, fornitore: r.fornitore });
    } catch {
      // regola malformata: ignorata
    }
  }
  return out;
}

export interface MovimentoLike {
  codice?: string | null;
  concetto: string;
  beneficiario?: string | null;
  osservazioni?: string | null;
  importo: number;
  dataContabile: Date;
}
export const testoMovimento = (m: MovimentoLike) =>
  [m.codice, m.concetto, m.beneficiario, m.osservazioni].map(pulisci).filter(Boolean).join(" ");

export const regolaPer = (m: MovimentoLike, regole: RegolaCompilata[]) => {
  const t = testoMovimento(m);
  return regole.find((r) => r.re.test(t)) ?? null;
};

// ─── Suggerimenti per le uscite ──────────────────────────────────────
type SpesaCtx = Prisma.SpesaGetPayload<{
  include: {
    pagamentoMensile: { select: { voce: true; dipendente: { select: { nome: true; cognome: true } } } };
  };
}>;
export interface ContestoSuggerimenti {
  impostazioni: ImpostazioniBanca;
  regole: RegolaCompilata[];
  spese: SpesaCtx[];
  dipendenti: { id: number; nome: string; key: string }[];
  fornitori: { id: number; nome: string; key: string }[];
}

// Carica una volta sola ciò che serve per suggerire su molti movimenti:
// spese non ancora abbinate degli anni interessati (±1), persone, fornitori.
export async function caricaContestoSuggerimenti(
  db: Db,
  anni: number[],
): Promise<ContestoSuggerimenti> {
  const anniEstesi = Array.from(new Set(anni.flatMap((a) => [a - 1, a, a + 1])));
  const [impostazioni, spese, dipendenti, fornitori] = await Promise.all([
    getImpostazioniBanca(db),
    anniEstesi.length
      ? db.spesa.findMany({
          where: { anno: { in: anniEstesi }, abbinamentiBancari: { none: {} } },
          include: {
            pagamentoMensile: {
              select: { voce: true, dipendente: { select: { nome: true, cognome: true } } },
            },
          },
        })
      : Promise.resolve([] as SpesaCtx[]),
    db.dipendente.findMany({ select: { id: true, nome: true, cognome: true } }),
    db.fornitore.findMany({ select: { id: true, nome: true } }),
  ]);
  return {
    impostazioni,
    regole: compilaRegole(impostazioni.regole),
    spese,
    dipendenti: dipendenti.map((d) => {
      const nome = nomeCompleto(d);
      return { id: d.id, nome, key: norm(nome) };
    }),
    fornitori: fornitori.map((f) => ({ id: f.id, nome: f.nome, key: norm(f.nome) })),
  };
}

const VOCE_LABEL: Record<string, string> = {
  stipendio: "Stipendio",
  seguridad: "Seguridad Social",
  irpf: "IRPF",
  rimborsi: "Rimborsi",
  benefit: "Benefit",
  commissioni: "Commissioni",
};

export function suggerisci(m: MovimentoLike, ctx: ContestoSuggerimenti): Suggerimento {
  const testo = testoMovimento(m);
  const testoN = norm(testo);
  const { mese, anno } = meseAnno(m.dataContabile);
  const benefKey = chiaveMemoria(m.beneficiario);

  // Persona citata nel movimento (nomine, rimborsi soci)
  const persona = ctx.dipendenti.find((d) => d.key && testoN.includes(d.key)) ?? null;

  let categoria = CATEGORIA_DEFAULT;
  let fornitore = "";
  let origine: Suggerimento["origine"] = "default";
  let escludi = false;
  const mem = benefKey ? ctx.impostazioni.memoria[benefKey] : undefined;
  const regola = regolaPer(m, ctx.regole);
  if (mem) {
    categoria = mem.categoria;
    fornitore = mem.fornitore;
    origine = "memoria";
  } else if (regola) {
    if (regola.categoria === ESCLUDI) {
      escludi = true;
    } else {
      categoria = regola.categoria;
    }
    fornitore = regola.fornitore;
    origine = "regola";
  }
  if (!fornitore) {
    fornitore =
      (!mascherato(m.beneficiario) ? pulisci(m.beneficiario) : "") ||
      persona?.nome ||
      pulisci(m.concetto);
  }
  const fornKey = norm(fornitore);
  const fornitoreMatch =
    ctx.fornitori.find((f) => f.key === fornKey) ??
    ctx.fornitori.find((f) => f.key.length >= 6 && fornKey.length >= 6 && (f.key.includes(fornKey) || fornKey.includes(f.key))) ??
    null;
  if (fornitoreMatch) fornitore = fornitoreMatch.nome;

  // Spese esistenti compatibili: stesso importo, stesso mese o adiacente,
  // non ancora collegate a un movimento.
  const cents = centesimi(m.importo);
  const candidati: CandidatoSpesa[] = [];
  for (const s of ctx.spese) {
    if (centesimi(s.importo) !== cents) continue;
    const diff = (s.anno - anno) * 12 + (s.mese - mese);
    if (Math.abs(diff) > 1) continue;
    // Punteggio: la proposta viene preselezionata da 50 in su (client).
    // Stesso importo e stesso mese da soli non bastano: serve un altro
    // indizio (persona, fornitore, categoria). Tra mesi diversi servono
    // nome e categoria, e mai a cavallo d'anno.
    let p = diff === 0 ? 40 : 10;
    if (s.anno !== anno) p -= 15;
    let registro: string | null = null;
    if (s.pagamentoMensile) {
      const nome = nomeCompleto(s.pagamentoMensile.dipendente);
      registro = `${VOCE_LABEL[s.pagamentoMensile.voce] ?? s.pagamentoMensile.voce} · ${nome}`;
      p += 5;
      if (persona && norm(nome) === persona.key) p += 30;
    }
    const sk = norm(s.fornitore);
    if (sk && (testoN.includes(sk) || (fornKey && (sk === fornKey || sk.includes(fornKey) || fornKey.includes(sk))))) {
      p += 30;
    }
    if (s.categoria === categoria) p += 10;
    candidati.push({
      id: s.id,
      categoria: s.categoria,
      fornitore: s.fornitore,
      descrizione: s.descrizione,
      importo: s.importo,
      mese: s.mese,
      anno: s.anno,
      registro,
      stessoMese: diff === 0,
      punteggio: p,
    });
  }
  candidati.sort((a, b) => b.punteggio - a.punteggio || a.id - b.id);

  return {
    categoria,
    fornitore,
    fornitoreId: fornitoreMatch?.id ?? null,
    descrizione: pulisci(m.osservazioni) || pulisci(m.concetto),
    escludi,
    origine,
    dipendenteId: persona?.id ?? null,
    dipendenteNome: persona?.nome ?? null,
    candidati: candidati.slice(0, 5),
  };
}

// Include standard per le API dei movimenti
export const INCLUDE_MOVIMENTO = {
  abbinamenti: {
    include: {
      spesa: {
        select: {
          id: true,
          categoria: true,
          fornitore: true,
          descrizione: true,
          importo: true,
          mese: true,
          anno: true,
          pagamentoMensile: {
            select: { voce: true, dipendente: { select: { nome: true, cognome: true } } },
          },
        },
      },
      fattura: {
        select: { id: true, numero: true, importo: true, cliente: { select: { nome: true } } },
      },
      acconto: { select: { id: true, importo: true, fatturaId: true } },
      altroIngresso: { select: { id: true, fonte: true, importo: true, categoria: true } },
    },
    orderBy: { id: "asc" },
  },
  import: { select: { id: true, nomeFile: true, createdAt: true } },
} satisfies Prisma.MovimentoBancarioInclude;
export type MovimentoConAbbinamenti = Prisma.MovimentoBancarioGetPayload<{
  include: typeof INCLUDE_MOVIMENTO;
}>;


// ─── Riconciliazione entrate ─────────────────────────────────────────
type FatturaCtx = Prisma.FatturaGetPayload<{
  include: {
    cliente: { select: { id: true; nome: true } };
    acconti: { select: { importo: true } };
    abbinamentiBancari: { select: { movimentoId: true } };
  };
}>;
export interface ContestoEntrate {
  fatture: FatturaCtx[];
}

// Fatture che un bonifico può saldare: tutte quelle degli anni interessati
// (±1) non ancora collegate a un movimento bancario. Le già segnate
// incassate a mano restano candidate (storico): l'abbinamento crea
// l'acconto retroattivo senza toccare lo stato.
export async function caricaContestoEntrate(db: Db, anni: number[]): Promise<ContestoEntrate> {
  const anniEstesi = Array.from(new Set(anni.flatMap((a) => [a - 1, a, a + 1])));
  const fatture = anniEstesi.length
    ? await db.fattura.findMany({
        where: { anno: { in: anniEstesi }, origine: { not: "sales" } },
        include: {
          cliente: { select: { id: true, nome: true } },
          acconti: { select: { importo: true } },
          abbinamentiBancari: { select: { movimentoId: true } },
        },
      })
    : [];
  return { fatture };
}

// Numeri di fattura citati nel testo: "F202685", "Factura F20266",
// "n. 202649 202671 202678" (senza F), "F2026-12". Normalizzati in maiuscolo
// senza spazi né trattini.
export const normNumero = (n: string | null | undefined) =>
  String(n ?? "")
    .toUpperCase()
    .replace(/[\s\-_./]/g, "");
export function estraiNumeriFattura(testo: string): string[] {
  const out = new Set<string>();
  for (const m of testo.matchAll(/\bF\s?[-_]?(\d{4,8})\b/gi)) out.add("F" + m[1]);
  // numeri nudi a 6-7 cifre che iniziano con l'anno (2025xx, 2026xx…)
  for (const m of testo.matchAll(/(?<![\dA-Z])(20\d{2}\d{2,4})(?![\d])/g)) out.add("F" + m[1]);
  return Array.from(out);
}

const PAROLE_VUOTE = new Set([
  "srl", "srls", "sas", "snc", "spa", "sl", "slu", "sa", "ltd", "limited", "di", "de", "del", "della",
  "e", "and", "the", "il", "la", "lo", "le", "gli", "dott", "dr", "studio", "ditta", "societa", "società",
  "responsabilita", "responsabilità", "limitata", "societa", "club", "asd", "ass", "sportiva", "dilettantistica",
]);
// Parole del nome cliente da cercare nel testo del bonifico: almeno 3
// lettere, oppure sigle con cifre ("b2", "3d"); via le forme societarie.
const tokenCliente = (nome: string) =>
  norm(nome)
    .split(" ")
    .filter((t) => (t.length >= 3 || (t.length === 2 && /\d/.test(t))) && !PAROLE_VUOTE.has(t));

// Entrate che non sono incassi di fatture
const REGOLE_ALTRO: { re: RegExp; categoria: CategoriaAltroIngresso | "escludi" }[] = [
  { re: /CASHBACK|BONIF\. ?DEVOLUCION|DEVOLUCI[OÓ]N IMPUESTOS|PROMOCI[OÓ]N COMERCIAL/i, categoria: "cashback" },
  { re: /DEVOLUCIONES TRIBUTARIAS|AEAT|AGENCIA TRIBUTARIA|HACIENDA|TRIBUTOS/i, categoria: "rimborso_tasse" },
  { re: /TARJETA VIRTUAL|TRASPASO|RECARGA|TRANSFERENCIA INTERNA|ABONO .*TARJETA/i, categoria: "escludi" },
  { re: /APORTACI[OÓ]N|APORTE .*SOCIO|AMPLIACI[OÓ]N CAPITAL/i, categoria: "apporto_socio" },
];

export function suggerisciEntrata(m: MovimentoLike, ctx: ContestoEntrate): SuggerimentoEntrata {
  const testo = testoMovimento(m);
  const testoN = norm(testo);
  const { mese, anno } = meseAnno(m.dataContabile);
  const cents = centesimi(m.importo);

  const altro = REGOLE_ALTRO.find((r) => r.re.test(testo));
  if (altro) {
    return {
      candidati: [],
      proposti: [],
      certo: altro.categoria !== "escludi",
      altro: altro.categoria === "escludi" ? null : altro.categoria,
      escludi: altro.categoria === "escludi",
      motivo: altro.categoria === "escludi" ? "Giroconto o movimento tecnico: da escludere" : "Non è l'incasso di una fattura",
    };
  }

  const numeri = estraiNumeriFattura(testo);
  const candidati: FatturaCandidata[] = [];
  for (const f of ctx.fatture) {
    if (f.abbinamentiBancari.length) continue;
    const incassato = f.acconti.reduce((t, a) => t + a.importo, 0);
    const residuo = f.pagato ? 0 : Math.max(0, f.importo - incassato);
    const motivi: string[] = [];
    let p = 0;
    const num = normNumero(f.numero);
    if (num && numeri.includes(num)) {
      p += 100;
      motivi.push("numero citato");
    }
    const tok = tokenCliente(f.cliente?.nome ?? "");
    const presenti = tok.filter((t) => testoN.includes(t));
    if (tok.length && presenti.length) {
      p += presenti.length === tok.length ? 50 : presenti.length >= 2 ? 45 : 30;
      motivi.push("cliente");
    }
    const diffMesi = (anno - f.anno) * 12 + (mese - f.mese); // >0 = bonifico dopo la fattura
    if (centesimi(f.importo) === cents) {
      p += 35;
      motivi.push("importo");
    } else if (residuo > 0 && centesimi(residuo) === cents) {
      p += 40;
      motivi.push("residuo");
    }
    if (diffMesi >= 0 && diffMesi <= 2) {
      p += 10;
      motivi.push("mese");
    } else if (diffMesi < -1) p -= 25; // pagata ben prima di essere emessa: improbabile
    else if (diffMesi > 6) p -= 10;
    if (f.pagato && !motivi.includes("numero citato")) p -= 10; // meglio le aperte
    if (p <= 0) continue;
    candidati.push({
      id: f.id,
      numero: f.numero,
      cliente: f.cliente?.nome ?? "—",
      clienteId: f.cliente?.id ?? null,
      importo: f.importo,
      incassato,
      residuo,
      pagato: f.pagato,
      mese: f.mese,
      anno: f.anno,
      azienda: f.azienda,
      punteggio: p,
      motivi,
    });
  }
  candidati.sort((a, b) => b.punteggio - a.punteggio || b.anno - a.anno || b.mese - a.mese);

  // Proposta: le fatture citate per numero; altrimenti la migliore se è
  // convincente (cliente + importo); se un cliente ha più fatture che sommate
  // fanno il bonifico, tutte quelle.
  const citate = candidati.filter((c) => c.motivi.includes("numero citato"));
  let proposti: FatturaCandidata[] = [];
  if (citate.length) proposti = citate;
  else {
    const top = candidati[0];
    if (top && top.punteggio >= 75) proposti = [top];
    else if (top && top.motivi.includes("cliente")) {
      // combinazione di fatture dello stesso cliente che quadra l'importo
      const stesse = candidati.filter((c) => c.clienteId === top.clienteId && c.motivi.includes("cliente")).slice(0, 6);
      const combo = trovaCombinazione(stesse, cents);
      if (combo.length > 1) proposti = combo;
    }
  }
  const somma = proposti.reduce((t, c) => t + (c.residuo > 0 ? c.residuo : c.importo), 0);
  const quadra = proposti.length > 0 && Math.abs(centesimi(somma) - cents) <= 5;
  const certo = quadra && (citate.length > 0 || proposti.every((c) => c.motivi.includes("cliente")));
  let motivo = "";
  if (!candidati.length) motivo = "Nessuna fattura compatibile: scegli dall'elenco o registra un altro ingresso";
  else if (certo) motivo = citate.length ? "Numero di fattura citato nel bonifico, importo che quadra" : "Cliente e importo che quadrano";
  else if (proposti.length) motivo = quadra ? "Proposta da confermare" : `Proposta da confermare: ${somma < m.importo ? "resta un residuo" : "il bonifico è minore"}`;
  else motivo = "Fatture possibili: scegli quella giusta";
  return { candidati: candidati.slice(0, 8), proposti: proposti.map((c) => c.id), certo, altro: null, escludi: false, motivo };
}

// Sottoinsieme di fatture (max 6) la cui somma dei residui è l'importo
function trovaCombinazione(fatture: FatturaCandidata[], cents: number): FatturaCandidata[] {
  const n = fatture.length;
  let best: FatturaCandidata[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    let somma = 0;
    const sel: FatturaCandidata[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const c = fatture[i];
        somma += centesimi(c.residuo > 0 ? c.residuo : c.importo);
        sel.push(c);
      }
    }
    if (Math.abs(somma - cents) <= 5 && (best.length === 0 || sel.length < best.length)) best = sel;
  }
  return best;
}

// ─── Effetti dell'incasso di una fattura (come il PATCH di /api/fatture) ──
// Quando lo stato "pagato" cambia: ripartizione storica "anda" (solo senza
// commerciale in anagrafica) e commissione del commerciale.
export const NOTA_BANCA = "Incasso da banca";
export const NOTA_GIA_INCASSATA = "fattura già segnata incassata a mano";
export async function dopoCambioIncasso(prisma: PrismaClient, fatturaId: number, primaPagato: boolean) {
  const f = await prisma.fattura.findUnique({
    where: { id: fatturaId },
    include: { cliente: { select: { nome: true } } },
  });
  if (!f || f.pagato === primaPagato) return;
  const tipo = f.commercialeId ? null : getSplitType(f.commerciale);
  if (tipo) {
    if (f.pagato) await applySplit(prisma, f, tipo);
    else await deleteSplitForFattura(prisma, f.id);
  }
  await syncCommissioneFattura(prisma, f.id);
}

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Impostazioni fatture (come invoice-config di Northstar), salvate come JSON
// nella tabella Impostazione con chiave "fatture".
export interface ImpostazioniFatture {
  // Dati emittente
  ragioneSociale: string;
  nif: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  paese: string;
  email: string;
  telefono: string;
  // Banca
  banca: string;
  iban: string;
  bic: string;
  // Fiscalità
  tipoIvaDefault: "igic_exenta" | "igic7";
  testoEsenzione: string;
  // Pagamento
  metodoPagamentoDefault: string;
  giorniScadenza: number;
  // Numerazione
  numeroPrefisso: string;
  numeroFormato: string; // token: {prefisso} {AAAA} {AA} {N} {NN} {NNN} {NNNN}
  numeroPartenza: number;
  resetAnnuale: boolean;
  // PDF
  logoUrl: string;
  colore: string;
  linguaDefault: "it" | "es" | "en";
  noteDefault: string;
  piePagina: string;
  // Solleciti
  sollecitoOggettoIt: string;
  sollecitoTestoIt: string;
  sollecitoOggettoEs: string;
  sollecitoTestoEs: string;
}

export const IMPOSTAZIONI_FATTURE_DEFAULT: ImpostazioniFatture = {
  ragioneSociale: "ANDA AGENCIA DE PUBLICIDAD SL",
  nif: "B16451536",
  indirizzo: "Avenida Quinto Centenario, 23 - Piso 2 Int 21",
  cap: "38683",
  citta: "Puerto de Santiago",
  provincia: "Santa Cruz de Tenerife",
  paese: "Spagna",
  email: "info@andacreativa.com",
  telefono: "",
  banca: "BBVA",
  iban: "ES9301820205970202087468",
  bic: "",
  tipoIvaDefault: "igic_exenta",
  testoEsenzione: "Operación exenta de IGIC",
  metodoPagamentoDefault: "Bonifico",
  giorniScadenza: 30,
  numeroPrefisso: "F",
  numeroFormato: "{prefisso}{AAAA}{N}",
  numeroPartenza: 1,
  resetAnnuale: true,
  logoUrl: "/logo anda.png",
  colore: "#e8308a",
  linguaDefault: "it",
  noteDefault: "",
  piePagina: "",
  sollecitoOggettoIt: "Sollecito pagamento fattura {numero}",
  sollecitoTestoIt:
    "Gentile {cliente},\n\nle ricordiamo che la fattura {numero} di {importo}, con scadenza {scadenza}, risulta a oggi non saldata.\nLa preghiamo di provvedere al pagamento con bonifico sull'IBAN {iban}.\n\nCordiali saluti,\n{azienda}",
  sollecitoOggettoEs: "Recordatorio de pago factura {numero}",
  sollecitoTestoEs:
    "Estimado/a {cliente},\n\nle recordamos que la factura {numero} de {importo}, con vencimiento {scadenza}, a día de hoy no consta como pagada.\nLe rogamos realice el pago mediante transferencia al IBAN {iban}.\n\nUn cordial saludo,\n{azienda}",
};

const CHIAVE = "fatture";

export async function getImpostazioniFatture(db: Db): Promise<ImpostazioniFatture> {
  const row = await db.impostazione.findUnique({ where: { chiave: CHIAVE } });
  let saved: Partial<ImpostazioniFatture> = {};
  if (row) {
    try {
      saved = JSON.parse(row.valore) as Partial<ImpostazioniFatture>;
    } catch {
      saved = {};
    }
  }
  return { ...IMPOSTAZIONI_FATTURE_DEFAULT, ...saved };
}

export async function salvaImpostazioniFatture(
  db: Db,
  patch: Partial<ImpostazioniFatture>,
): Promise<ImpostazioniFatture> {
  const attuali = await getImpostazioniFatture(db);
  const next: ImpostazioniFatture = { ...attuali, ...sanifica(patch) };
  await db.impostazione.upsert({
    where: { chiave: CHIAVE },
    create: { chiave: CHIAVE, valore: JSON.stringify(next) },
    update: { valore: JSON.stringify(next) },
  });
  return next;
}

function sanifica(p: Partial<ImpostazioniFatture>): Partial<ImpostazioniFatture> {
  const out: Partial<ImpostazioniFatture> = {};
  for (const k of Object.keys(IMPOSTAZIONI_FATTURE_DEFAULT) as (keyof ImpostazioniFatture)[]) {
    if (p[k] === undefined) continue;
    const def = IMPOSTAZIONI_FATTURE_DEFAULT[k];
    if (typeof def === "number") {
      const n = Number(p[k]);
      (out as Record<string, unknown>)[k] = Number.isFinite(n) ? n : def;
    } else if (typeof def === "boolean") {
      (out as Record<string, unknown>)[k] = Boolean(p[k]);
    } else {
      (out as Record<string, unknown>)[k] = String(p[k] ?? "");
    }
  }
  if (out.tipoIvaDefault && out.tipoIvaDefault !== "igic7") out.tipoIvaDefault = "igic_exenta";
  if (out.linguaDefault && !["it", "es", "en"].includes(out.linguaDefault)) out.linguaDefault = "it";
  if (out.numeroFormato !== undefined && !out.numeroFormato.includes("{N")) {
    out.numeroFormato = IMPOSTAZIONI_FATTURE_DEFAULT.numeroFormato;
  }
  return out;
}

// ── Numerazione ───────────────────────────────────────────────────────────
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function formattaNumero(
  formato: string,
  prefisso: string,
  anno: number,
  n: number,
): string {
  return formato
    .replace(/\{prefisso\}/g, prefisso)
    .replace(/\{AAAA\}/g, String(anno))
    .replace(/\{AA\}/g, String(anno % 100).padStart(2, "0"))
    .replace(/\{NNNN\}/g, String(n).padStart(4, "0"))
    .replace(/\{NNN\}/g, String(n).padStart(3, "0"))
    .replace(/\{NN\}/g, String(n).padStart(2, "0"))
    .replace(/\{N\}/g, String(n));
}

// Regex che riconosce i numeri emessi col formato; il gruppo 1 è il contatore.
export function regexNumero(
  formato: string,
  prefisso: string,
  anno: number | null,
): RegExp {
  let re = "";
  const tokens = /\{prefisso\}|\{AAAA\}|\{AA\}|\{NNNN\}|\{NNN\}|\{NN\}|\{N\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokens.exec(formato))) {
    re += escapeRe(formato.slice(last, m.index));
    switch (m[0]) {
      case "{prefisso}":
        re += escapeRe(prefisso);
        break;
      case "{AAAA}":
        re += anno === null ? "\\d{4}" : String(anno);
        break;
      case "{AA}":
        re += anno === null ? "\\d{2}" : String(anno % 100).padStart(2, "0");
        break;
      default:
        re += "(\\d+)";
    }
    last = m.index + m[0].length;
  }
  re += escapeRe(formato.slice(last));
  return new RegExp(`^${re}$`);
}

export async function prossimoNumeroFattura(
  db: Db,
  anno: number,
  imp?: ImpostazioniFatture,
): Promise<string> {
  const cfg = imp ?? (await getImpostazioniFatture(db));
  const re = regexNumero(cfg.numeroFormato, cfg.numeroPrefisso, cfg.resetAnnuale ? anno : null);
  const rows = await db.fattura.findMany({
    where: { numero: { not: null } },
    select: { numero: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = r.numero ? re.exec(r.numero) : null;
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  const next = Math.max(cfg.numeroPartenza || 1, max + 1);
  return formattaNumero(cfg.numeroFormato, cfg.numeroPrefisso, anno, next);
}

// ── Solleciti ─────────────────────────────────────────────────────────────
export function compilaTesto(
  testo: string,
  v: Record<string, string>,
): string {
  return testo.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
}

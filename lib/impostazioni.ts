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
  // Le rettificative hanno una serie a parte (art. 6 del regolamento di
  // fatturazione): stesso formato, prefisso diverso
  numeroPrefissoRettifica: string;
  // VeriFactu: spento = le fatture si registrano a mano come prima; prova =
  // ambiente di test dell'AEAT (senza valore fiscale); produzione = invio vero
  vfModo: "spento" | "prova" | "produzione";
  vfNombreSistema: string;
  vfIdSistema: string;
  vfVersion: string;
  vfNumeroInstalacion: string;
  vfClaveRegimen: string; // 01 = regime generale
  vfDescrizioneDefault: string; // descrizione dell'operazione proposta
  vfCausaSpagna: string; // a 0 %, proposta per i clienti spagnoli (E1…E8, N1, N2)
  vfCausaEstero: string; // a 0 %, proposta per i clienti esteri
  // PDF
  logoUrl: string;
  colore: string;
  linguaDefault: "it" | "es" | "en";
  noteDefault: string;
  piePagina: string;
  // Canale Social Media House: compenso mensile netto da raggiungere con le
  // fatture ai clienti SMH (al netto della ritenuta) più una fattura diretta
  smhNome: string;
  smhCompensoMensile: number;
  smhRitenuta: number; // percentuale trattenuta da SMH sulle fatture ai suoi clienti
  // Email di invio della fattura (bottone «Invia email» nella fattura)
  invioOggettoIt: string;
  invioTestoIt: string;
  invioOggettoEs: string;
  invioTestoEs: string;
  // Solleciti
  sollecitoOggettoIt: string;
  sollecitoTestoIt: string;
  sollecitoOggettoEs: string;
  sollecitoTestoEs: string;
  // Commercialista: destinatario dell'informe (Bilancio › Informe commercialista)
  commercialistaNome: string;
  commercialistaEmail: string;
  informeOggetto: string; // segnaposto: {periodo} {azienda} {nombre}
  informeTesto: string;
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
  numeroPrefissoRettifica: "R",
  vfModo: "spento",
  vfNombreSistema: "Anda Finance",
  vfIdSistema: "AF",
  vfVersion: "1.0",
  vfNumeroInstalacion: "1",
  vfClaveRegimen: "01",
  vfDescrizioneDefault: "Servicios de Publicidad",
  vfCausaSpagna: "",
  vfCausaEstero: "",
  logoUrl: "/logo anda.png",
  colore: "#e8308a",
  linguaDefault: "it",
  noteDefault: "",
  piePagina: "",
  smhNome: "SocialMediaHouse S.R.L.",
  smhCompensoMensile: 2700,
  smhRitenuta: 15,
  invioOggettoIt: "Fattura {numero} — Anda Agencia de Publicidad SL",
  invioTestoIt:
    "Gentile {cliente},\n\nle inviamo in allegato la fattura {numero} del {data}.\n\n{riepilogo}\n\nPuò effettuare il pagamento con bonifico bancario, indicando il numero della fattura nella causale.\n\nPer qualsiasi chiarimento può rispondere direttamente a questa email.\n\nUn cordiale saluto,\n\nAmministrazione\nAnda Agencia de Publicidad SL",
  invioOggettoEs: "Factura {numero} — Anda Agencia de Publicidad SL",
  invioTestoEs:
    "Estimado/a {cliente}:\n\nle enviamos adjunta la factura {numero} del {data}.\n\n{riepilogo}\n\nPuede realizar el pago mediante transferencia bancaria, indicando el número de factura en el concepto.\n\nPara cualquier aclaración, puede responder directamente a este correo.\n\nUn cordial saludo,\n\nAdministración\nAnda Agencia de Publicidad SL",
  sollecitoOggettoIt: "Sollecito pagamento fattura {numero}",
  sollecitoTestoIt:
    "Gentile {cliente},\n\nle ricordiamo che la fattura {numero} risulta a oggi non saldata.\n\n{riepilogo}\n\nLa preghiamo di provvedere al pagamento con bonifico bancario, indicando il numero della fattura nella causale.\n\nSe ha già effettuato il pagamento, non tenga conto di questo messaggio. Per qualsiasi chiarimento può rispondere direttamente a questa email.\n\nUn cordiale saluto,\n\nAmministrazione\nAnda Agencia de Publicidad SL",
  sollecitoOggettoEs: "Recordatorio de pago factura {numero}",
  sollecitoTestoEs:
    "Estimado/a {cliente}:\n\nle recordamos que la factura {numero} a día de hoy no consta como pagada.\n\n{riepilogo}\n\nLe rogamos realice el pago mediante transferencia bancaria, indicando el número de factura en el concepto.\n\nSi ya ha efectuado el pago, no tenga en cuenta este mensaje. Para cualquier aclaración, puede responder directamente a este correo.\n\nUn cordial saludo,\n\nAdministración\nAnda Agencia de Publicidad SL",
  commercialistaNome: "",
  commercialistaEmail: "",
  informeOggetto: "Informe {periodo} — {azienda}",
  informeTesto:
    "Hola {nombre},\n\nadjuntamos el informe del periodo {periodo} de {azienda}: resumen, libro de facturas emitidas, gastos y otros ingresos, en PDF y Excel.\n\nQuedamos a tu disposición para cualquier aclaración.\n\nUn cordial saludo,\n{azienda}",
};

// A 0 %: esente (E1…E8 per l'IGIC) o non soggetta (N1, N2)
export const CAUSE_IGIC = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "N1", "N2"];

const CHIAVE = "fatture";

// Testi standard salvati nel 2026 prima del riquadro {riepilogo}: non sono una
// scelta dell'utente, quindi valgono i nuovi. Un testo cambiato a mano resta.
const SOLLECITI_SUPERATI = {
  sollecitoTestoIt:
    "Gentile {cliente},\n\nle ricordiamo che la fattura {numero} di {importo}, con scadenza {scadenza}, risulta a oggi non saldata.\nLa preghiamo di provvedere al pagamento con bonifico sull'IBAN {iban}.\n\nCordiali saluti,\n{azienda}",
  sollecitoTestoEs:
    "Estimado/a {cliente},\n\nle recordamos que la factura {numero} de {importo}, con vencimiento {scadenza}, a día de hoy no consta como pagada.\nLe rogamos realice el pago mediante transferencia al IBAN {iban}.\n\nUn cordial saludo,\n{azienda}",
} as const;

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
  for (const k of ["sollecitoTestoIt", "sollecitoTestoEs"] as const) {
    if (saved[k] === SOLLECITI_SUPERATI[k]) delete saved[k];
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
  if (out.vfModo && !["prova", "produzione"].includes(out.vfModo)) out.vfModo = "spento";
  for (const k of ["vfCausaSpagna", "vfCausaEstero"] as const) {
    if (out[k] && !CAUSE_IGIC.includes(out[k])) out[k] = "";
  }
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
  rettifica = false, // serie delle rettificative
): Promise<string> {
  const base = imp ?? (await getImpostazioniFatture(db));
  const cfg = rettifica
    ? { ...base, numeroPrefisso: base.numeroPrefissoRettifica || "R", numeroPartenza: 1 }
    : base;
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

// ── Testi con segnaposto (email di invio, solleciti) ──────────────────────
export function compilaTesto(
  testo: string,
  v: Record<string, string>,
): string {
  return testo.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
}

// Se un dato manca (es. fattura senza scadenza), toglie l'inciso fra virgole
// che contiene il suo segnaposto: «di 100 €, con scadenza {scadenza}.» →
// «di 100 €.». Fuori da un inciso il segnaposto resta e diventa vuoto.
export function togliInciso(testo: string, segnaposto: string): string {
  const tag = segnaposto.replace(/[{}]/g, "\\$&");
  return testo.replace(new RegExp(`,[^,.\\n]*${tag}[^,.\\n]*`, "g"), "");
}

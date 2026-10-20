// Calendario: fatture da emettere (richieste con data prevista), scadenze
// delle fatture e, a richiesta, scadenze dei domini. Niente tabella: gli
// eventi si calcolano ogni volta dai dati che ci sono già, quindi il
// calendario è sempre aggiornato «in automatico». Usato dalla rotta JSON
// (pagina) e dal feed iCal (Google/Apple Calendar).
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { lordo, statoCalcolato, totalePagato } from "@/lib/fatture";

export type TipoEvento = "richiesta" | "scadenza" | "dominio";
export type StatoEvento = "aperta" | "scaduta" | "pagata" | "in_attesa";

export interface Evento {
  tipo: TipoEvento;
  id: number;
  data: string; // YYYY-MM-DD
  titolo: string; // cliente
  dettaglio: string; // codice richiesta, numero fattura, dominio
  importo: number; // lordo della fattura, totale della richiesta, prezzo del rinnovo
  residuo?: number; // scadenze: quanto manca da incassare
  stato: StatoEvento; // richieste: in_attesa = da validare; aperta = validata
  solleciti?: number;
  href: string;
}

type Db = Pick<PrismaClient, "richiestaFattura" | "fattura" | "rinnovoSito">;

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
const giornoUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const fineGiornoUtc = (s: string) => new Date(`${s}T23:59:59.999Z`);

export async function eventiCalendario(
  db: Db,
  opt: { da: string; a: string; domini?: boolean; oggi?: string },
): Promise<{ eventi: Evento[]; senzaData: Evento[] }> {
  const oggi = opt.oggi ?? ymd(new Date());
  const range = { gte: giornoUtc(opt.da), lte: fineGiornoUtc(opt.a) };

  const [richieste, senza, fatture, domini] = await Promise.all([
    db.richiestaFattura.findMany({
      where: { deletedAt: null, emessa: false, fatturaId: null, dataInvio: range },
      select: richiestaSelect,
      orderBy: { dataInvio: "asc" },
    }),
    db.richiestaFattura.findMany({
      where: { deletedAt: null, emessa: false, fatturaId: null, dataInvio: null },
      select: richiestaSelect,
      orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
    }),
    db.fattura.findMany({
      where: { stato: "emessa", annullata: false, origine: { not: "sales" }, scadenza: range },
      select: {
        id: true,
        numero: true,
        scadenza: true,
        importo: true,
        tipoIva: true,
        iva: true,
        pagato: true,
        cliente: { select: { nome: true } },
        acconti: { select: { importo: true } },
        _count: { select: { solleciti: true } },
      },
      orderBy: { scadenza: "asc" },
    }),
    opt.domini
      ? db.rinnovoSito.findMany({
          where: { deletedAt: null, stato: { in: ["attivo", "in_lavorazione"] }, scadenza: range },
          select: {
            id: true,
            dominio: true,
            scadenza: true,
            importo: true,
            nomeCliente: true,
            cliente: { select: { nome: true } },
          },
          orderBy: { scadenza: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const daRichiesta = (r: (typeof richieste)[number]): Evento => ({
    tipo: "richiesta",
    id: r.id,
    data: r.dataInvio ? ymd(r.dataInvio) : "",
    titolo: r.cliente?.nome ?? r.nomeCliente ?? "Cliente da definire",
    dettaglio: r.codice,
    importo: r.totale || r.imponibile,
    stato: r.validazione === "ok" ? "aperta" : "in_attesa",
    href: `/sales/richieste/${r.id}`,
  });

  const eventi: Evento[] = [
    ...richieste.map(daRichiesta),
    ...fatture.map((f): Evento => {
      const data = ymd(f.scadenza!);
      const pagata = statoCalcolato(f) === "pagato";
      const tot = lordo(f);
      return {
        tipo: "scadenza",
        id: f.id,
        data,
        titolo: f.cliente?.nome ?? "—",
        dettaglio: f.numero ?? `#${f.id}`,
        importo: tot,
        residuo: pagata ? 0 : Math.max(0, tot - totalePagato(f)),
        stato: pagata ? "pagata" : data < oggi ? "scaduta" : "aperta",
        solleciti: f._count.solleciti,
        href: `/finance/fatture/${f.id}`,
      };
    }),
    ...domini.map((d): Evento => {
      const data = ymd(d.scadenza);
      return {
        tipo: "dominio",
        id: d.id,
        data,
        titolo: d.cliente?.nome ?? d.nomeCliente ?? "—",
        dettaglio: d.dominio,
        importo: d.importo,
        stato: data < oggi ? "scaduta" : "aperta",
        href: `/sales/rinnovi/${d.id}`,
      };
    }),
  ].sort((x, y) => x.data.localeCompare(y.data) || x.tipo.localeCompare(y.tipo) || x.id - y.id);

  return { eventi, senzaData: senza.map(daRichiesta) };
}

const richiestaSelect = {
  id: true,
  codice: true,
  dataInvio: true,
  totale: true,
  imponibile: true,
  validazione: true,
  nomeCliente: true,
  mese: true,
  anno: true,
  cliente: { select: { nome: true } },
} as const;

// ── Feed iCal ──────────────────────────────────────────────────────────────
// Il feed non ha la sessione: lo protegge un token derivato dal segreto
// dell'app, così non serve una variabile in più su Vercel.
export function tokenIcal(): string | null {
  const segreto = process.env.AUTH_SECRET;
  if (!segreto) return null;
  return createHash("sha256").update(`calendario-ical:${segreto}`).digest("hex").slice(0, 32);
}

const escapeIcs = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Le righe di un .ics non superano 75 byte: si spezzano con «CRLF + spazio»
const piega = (riga: string) => {
  const out: string[] = [];
  let resto = riga;
  while (Buffer.byteLength(resto, "utf8") > 75) {
    let taglio = 75;
    while (Buffer.byteLength(resto.slice(0, taglio), "utf8") > 75) taglio--;
    out.push(resto.slice(0, taglio));
    resto = " " + resto.slice(taglio);
  }
  out.push(resto);
  return out.join("\r\n");
};
const fmtEuro = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

export function etichettaEvento(e: Evento): string {
  if (e.tipo === "richiesta") return `Da emettere: ${e.titolo} · ${e.dettaglio} · ${fmtEuro(e.importo)}`;
  if (e.tipo === "dominio") return `Dominio ${e.dettaglio} · ${e.titolo}`;
  const pre = e.stato === "pagata" ? "Pagata" : e.stato === "scaduta" ? "SCADUTA" : "Scadenza";
  return `${pre} ${e.dettaglio} · ${e.titolo} · ${fmtEuro(e.residuo ?? e.importo)}`;
}

export function calendarioIcs(eventi: Evento[], origine: string, adesso = new Date()): string {
  const stamp = adesso.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const righe = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Anda//Finance//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Anda Finance",
    "X-WR-TIMEZONE:Atlantic/Canary",
  ];
  for (const e of eventi) {
    if (!e.data) continue;
    const giorno = e.data.replace(/-/g, "");
    const dopo = new Date(`${e.data}T00:00:00.000Z`);
    dopo.setUTCDate(dopo.getUTCDate() + 1);
    const descr =
      e.tipo === "scadenza"
        ? `Fattura ${e.dettaglio} di ${e.titolo}: ${fmtEuro(e.importo)}` +
          (e.residuo ? `, da incassare ${fmtEuro(e.residuo)}` : "") +
          (e.solleciti ? `, solleciti fatti: ${e.solleciti}` : "")
        : e.tipo === "richiesta"
          ? `Richiesta ${e.dettaglio} per ${e.titolo}: ${fmtEuro(e.importo)}` +
            (e.stato === "in_attesa" ? " (da validare)" : "")
          : `Rinnovo del dominio ${e.dettaglio} (${e.titolo})`;
    righe.push(
      "BEGIN:VEVENT",
      `UID:${e.tipo}-${e.id}@anda-finance`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${giorno}`,
      `DTEND;VALUE=DATE:${ymd(dopo).replace(/-/g, "")}`,
      `SUMMARY:${escapeIcs(etichettaEvento(e))}`,
      `DESCRIPTION:${escapeIcs(descr)}`,
      `URL:${origine}${e.href}`,
      "END:VEVENT",
    );
  }
  righe.push("END:VCALENDAR");
  return righe.map(piega).join("\r\n") + "\r\n";
}

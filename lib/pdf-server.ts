import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { creaFatturaPDF, nomeFilePDF, type LogoPdf } from "@/lib/fattura-pdf";
import { getImpostazioniFatture } from "@/lib/impostazioni";
import type { FatturaDettaglio } from "@/lib/fatture";

type Db = PrismaClient | Prisma.TransactionClient;

// PDF generati sul server (senza browser), per le email automatiche degli
// abbonamenti. Il logo è un JPEG piccolo in public/, già senza margini,
// letto da disco; le misure si leggono dall'intestazione del file.
// Solo da codice server: usa il file system.
const LOGO_SERVER = path.join(process.cwd(), "public", "logo-anda-pdf.jpg");

function misureJpeg(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    const sof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (sof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

let logoCache: LogoPdf | null | undefined;
export async function logoServer(): Promise<LogoPdf | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const buf = await readFile(LOGO_SERVER);
    const m = misureJpeg(buf);
    logoCache = m ? { dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`, ...m } : null;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

// La scheda fattura nella stessa forma di GET /api/fatture/[id] (date come
// stringhe), così il PDF viene uguale a quello scaricato dal browser.
export async function fatturaDettaglioServer(db: Db, id: number): Promise<FatturaDettaglio | null> {
  const f = await db.fattura.findUnique({
    where: { id },
    include: {
      cliente: true,
      acconti: { orderBy: { data: "asc" } },
      solleciti: { orderBy: { data: "desc" } },
      richiesta: { select: { id: true, codice: true, descrizione: true, voci: true } },
      contratto: { select: { id: true, numero: true, oggetto: true } },
      commercialeRef: { select: { id: true, nome: true, cognome: true, email: true } },
      rettificaDi: { select: { id: true, numero: true, data: true } },
      rettifiche: {
        select: { id: true, numero: true, stato: true, importo: true, tipoRettifica: true, annullata: true },
        orderBy: { id: "asc" },
      },
      registriVerifactu: {
        select: {
          id: true,
          ambiente: true,
          tipo: true,
          subsanacion: true,
          stato: true,
          csv: true,
          codiceErrore: true,
          descrizioneErrore: true,
          ultimoErrore: true,
          tentativi: true,
          inviatoIl: true,
          createdAt: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!f) return null;
  return JSON.parse(JSON.stringify(f)) as FatturaDettaglio;
}

export async function pdfFatturaServer(
  db: Db,
  id: number,
): Promise<{ buffer: Buffer; nomeFile: string; fattura: FatturaDettaglio } | null> {
  const f = await fatturaDettaglioServer(db, id);
  if (!f) return null;
  const cfg = await getImpostazioniFatture(db);
  const doc = await creaFatturaPDF(f, cfg, { logo: await logoServer() });
  return { buffer: Buffer.from(doc.output("arraybuffer")), nomeFile: nomeFilePDF(f), fattura: f };
}

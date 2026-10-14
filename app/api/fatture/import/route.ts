import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trovaStessa } from "@/lib/doppioni";

interface BillinRow {
  fechaExpedicion?: string | number | null;
  fechaVencimiento?: string | number | null;
  numFactura?: string | null;
  importeFactura?: number | string | null;
  baseImponible?: number | string | null;
  pctIgic?: number | string | null;
  importeIgic?: number | string | null;
  nifCliente?: string | null;
  nombreCliente?: string | null;
  codPostal?: string | null;
  paisCliente?: string | null;
  cantidadPagada?: number | string | null;
  totalAPagar?: number | string | null;
  pagada?: string | boolean | null;
  metodoPago?: string | null;
}

const normPaese = (raw?: string | null): "Spagna" | "Italia" => {
  const s = (raw || "").toLowerCase().trim();
  if (["italia", "italy", "it"].includes(s)) return "Italia";
  return "Spagna";
};

const normNif = (raw?: string | null) =>
  (raw || "").toUpperCase().replace(/\s+/g, "").trim() || null;

const normNum = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v)
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const normPagada = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "")
    .toLowerCase()
    .trim();
  return ["si", "sí", "yes", "true", "1", "pagada"].includes(s);
};

const parseDate = (v: unknown): Date | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    // Excel serial date
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const year = yy.length === 2 ? 2000 + parseInt(yy) : parseInt(yy);
    const d = new Date(year, parseInt(mm) - 1, parseInt(dd));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    rows: BillinRow[];
    headers?: string[];
    sampleRow?: Record<string, unknown>;
  };
  const rows = Array.isArray(body.rows) ? body.rows : [];

  const debugHeaders = body.headers ?? [];
  const debugSampleRow = body.sampleRow ?? {};
  console.log("[import-fatture] Headers nel file:", debugHeaders);
  console.log("[import-fatture] Sample row:", debugSampleRow);
  console.log("[import-fatture] Totale righe:", rows.length);

  const imported: string[] = [];
  const skipped: { numero: string; reason: string }[] = [];
  const errors: { numero: string; error: string }[] = [];
  let createdClienti = 0;
  const anagrafica = await prisma.cliente.findMany({
    select: { id: true, nome: true, partitaIva: true },
  });

  for (const r of rows) {
    const numero = (r.numFactura || "").toString().trim();
    if (!numero) {
      skipped.push({ numero: "(senza numero)", reason: "Numero mancante" });
      continue;
    }

    try {
      const exists = await prisma.fattura.findFirst({ where: { numero } });
      if (exists) {
        skipped.push({ numero, reason: "Già presente" });
        continue;
      }

      const data = parseDate(r.fechaExpedicion);
      if (!data) {
        errors.push({ numero, error: "Data non valida" });
        continue;
      }

      const paese = normPaese(r.paisCliente);
      const nif = normNif(r.nifCliente);
      const nomeCliente = (r.nombreCliente || "").trim();

      // Stessa P.IVA (con o senza prefisso) o stesso nome a meno di
      // maiuscole e forma societaria: «ASD JUDO AZZANESE» = «Judo Azzanese»
      let cliente = trovaStessa(nif, nomeCliente, anagrafica);
      if (!cliente && nomeCliente) {
        cliente = await prisma.cliente.create({
          data: {
            nome: nomeCliente,
            partitaIva: nif,
            paese,
            cap: r.codPostal?.toString().trim() || null,
          },
          select: { id: true, nome: true, partitaIva: true },
        });
        anagrafica.push(cliente);
        createdClienti++;
      }

      const pct = normNum(r.pctIgic);
      const tipoIva = pct === 7 ? "igic7" : "igic_exenta";
      const iva = pct === 7 ? 7 : 0;
      const importo = normNum(r.importeFactura);

      const scadenza =
        parseDate(r.fechaVencimiento) ??
        new Date(data.getTime() + 30 * 86400000);

      await prisma.fattura.create({
        data: {
          numero,
          data,
          clienteId: cliente?.id ?? null,
          azienda: paese,
          mese: data.getMonth() + 1,
          anno: data.getFullYear(),
          importo,
          tipoIva,
          iva,
          pagato: normPagada(r.pagada),
          metodo: r.metodoPago?.toString().trim() || null,
          scadenza,
        },
      });
      imported.push(numero);
    } catch (e) {
      errors.push({
        numero,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    importedCount: imported.length,
    skippedCount: skipped.length,
    errorCount: errors.length,
    createdClienti,
    imported,
    skipped,
    errors,
    debug: {
      headers: debugHeaders,
      sampleRow: debugSampleRow,
      totalRows: rows.length,
    },
  });
}

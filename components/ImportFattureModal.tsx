"use client";

import { useRef, useState } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

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

interface ImportResult {
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  createdClienti: number;
  imported: string[];
  skipped: { numero: string; reason: string }[];
  errors: { numero: string; error: string }[];
  debug?: {
    headers?: string[];
    sampleRow?: Record<string, unknown>;
    totalRows?: number;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const HEADER_MAP: Record<keyof BillinRow, string[]> = {
  fechaExpedicion: ["Fecha Expedición", "Fecha Expedicion", "Fecha"],
  fechaVencimiento: [
    "Fecha Vencimiento",
    "Fecha de Vencimiento",
    "Vencimiento",
  ],
  numFactura: [
    "Num. Factura Completo",
    "Num Factura Completo",
    "Numero",
    "Núm. Factura",
  ],
  importeFactura: ["Importe Factura"],
  baseImponible: [
    "Base imponible IGIC",
    "Base Imponible IGIC",
    "Base imponible",
  ],
  pctIgic: ["% Impuesto IGIC", "% IGIC"],
  importeIgic: ["Importe Impuesto IGIC", "Importe IGIC"],
  nifCliente: ["NIF Cliente", "NIF"],
  nombreCliente: ["Nombre Fiscal Cliente", "Nombre Cliente", "Cliente"],
  codPostal: ["Cod. Postal Cliente", "Codigo Postal Cliente", "CP"],
  paisCliente: ["País Cliente", "Pais Cliente", "País", "Pais"],
  cantidadPagada: ["Cantidad ya pagada", "Cantidad Pagada"],
  totalAPagar: ["Total a pagar", "Total"],
  pagada: ["Pagada"],
  metodoPago: ["Método de pago", "Metodo de pago", "Método"],
};

const findValue = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    if (k in row && row[k] != null && row[k] !== "") return row[k];
  }
  // fallback: case-insensitive lookup
  const lowerRow: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row))
    lowerRow[k.toLowerCase().trim()] = v;
  for (const k of keys) {
    const lk = k.toLowerCase().trim();
    if (lk in lowerRow && lowerRow[lk] != null && lowerRow[lk] !== "")
      return lowerRow[lk];
  }
  return null;
};

export default function ImportFattureModal({
  open,
  onClose,
  onImported,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setResult(null);
    setError(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: null,
        raw: true,
      });

      const rows: BillinRow[] = json.map((r) => ({
        fechaExpedicion: findValue(r, HEADER_MAP.fechaExpedicion) as
          | string
          | number
          | null,
        fechaVencimiento: findValue(r, HEADER_MAP.fechaVencimiento) as
          | string
          | number
          | null,
        numFactura: findValue(r, HEADER_MAP.numFactura) as string | null,
        importeFactura: findValue(r, HEADER_MAP.importeFactura) as
          | number
          | string
          | null,
        baseImponible: findValue(r, HEADER_MAP.baseImponible) as
          | number
          | string
          | null,
        pctIgic: findValue(r, HEADER_MAP.pctIgic) as number | string | null,
        importeIgic: findValue(r, HEADER_MAP.importeIgic) as
          | number
          | string
          | null,
        nifCliente: findValue(r, HEADER_MAP.nifCliente) as string | null,
        nombreCliente: findValue(r, HEADER_MAP.nombreCliente) as string | null,
        codPostal: findValue(r, HEADER_MAP.codPostal) as string | null,
        paisCliente: findValue(r, HEADER_MAP.paisCliente) as string | null,
        cantidadPagada: findValue(r, HEADER_MAP.cantidadPagada) as
          | number
          | string
          | null,
        totalAPagar: findValue(r, HEADER_MAP.totalAPagar) as
          | number
          | string
          | null,
        pagada: findValue(r, HEADER_MAP.pagada) as string | boolean | null,
        metodoPago: findValue(r, HEADER_MAP.metodoPago) as string | null,
      }));

      if (rows.length === 0) {
        setError("Il file non contiene righe valide");
        return;
      }

      const headers = Object.keys(json[0] ?? {});
      const sampleRow = json[0] ?? {};
      console.log("[import-fatture] Colonne nel file:", headers);
      console.log("[import-fatture] Prima riga raw:", sampleRow);

      const res = await fetch("/api/fatture/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, headers, sampleRow }),
      });
      if (!res.ok) {
        setError(`Errore server: ${res.status}`);
        return;
      }
      const data = (await res.json()) as ImportResult;
      setResult(data);
      if (data.importedCount > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore parsing file");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Importa Fatture Billin
          </h2>
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!result && !loading && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-brand/40 bg-brand/10"
                  : "border-gray-300 hover:border-brand/40 hover:bg-gray-50"
              }`}
            >
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Trascina il file Excel Billin qui
              </p>
              <p className="text-xs text-gray-500 mt-1">
                oppure clicca per selezionarlo (.xlsx)
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                onChange={onPick}
                className="hidden"
              />
            </div>
            {error && (
              <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <FileSpreadsheet className="w-5 h-5 text-ok animate-pulse" />
              Importazione in corso...
            </div>
            {fileName && (
              <p className="text-xs text-gray-400 mt-2">{fileName}</p>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-ok/10 border border-ok/30 rounded-lg p-3 text-center">
                <p className="text-xs text-ok uppercase tracking-wide">
                  Importate
                </p>
                <p className="text-2xl font-bold text-ok">
                  {result.importedCount}
                </p>
              </div>
              <div className="bg-warn/10 border border-warn/30 rounded-lg p-3 text-center">
                <p className="text-xs text-warn uppercase tracking-wide">
                  Saltate
                </p>
                <p className="text-2xl font-bold text-warn">
                  {result.skippedCount}
                </p>
              </div>
              <div className="bg-bad/10 border border-bad/30 rounded-lg p-3 text-center">
                <p className="text-xs text-bad uppercase tracking-wide">
                  Errori
                </p>
                <p className="text-2xl font-bold text-bad">
                  {result.errorCount}
                </p>
              </div>
            </div>

            {result.createdClienti > 0 && (
              <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 inline text-ok mr-1" />
                Creati {result.createdClienti} clienti nuovi
              </div>
            )}

            {result.skipped.length > 0 && (
              <div className="border border-warn/30 rounded-lg overflow-hidden">
                <div className="bg-warn/10 px-3 py-1.5 text-xs font-semibold text-warn">
                  Fatture saltate
                </div>
                <div className="max-h-32 overflow-y-auto text-xs">
                  {result.skipped.map((s, i) => (
                    <div
                      key={i}
                      className="flex justify-between px-3 py-1 border-t border-warn/30"
                    >
                      <span className="font-mono text-gray-700">
                        {s.numero}
                      </span>
                      <span className="text-gray-500">{s.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.debug && result.debug.headers && (
              <details className="border border-gray-200 rounded-lg overflow-hidden">
                <summary className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  Debug — colonne rilevate ({result.debug.headers.length})
                </summary>
                <div className="max-h-48 overflow-y-auto text-xs p-3 space-y-2 bg-white">
                  <div>
                    <p className="font-semibold text-gray-700 mb-1">
                      Nomi colonne:
                    </p>
                    <ul className="space-y-0.5">
                      {result.debug.headers.map((h, i) => (
                        <li
                          key={i}
                          className="font-mono text-gray-600 bg-gray-50 px-2 py-0.5 rounded"
                        >
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 mb-1 mt-2">
                      Prima riga (raw):
                    </p>
                    <pre className="bg-gray-50 p-2 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(result.debug.sampleRow, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            )}

            {result.errors.length > 0 && (
              <div className="border border-bad/30 rounded-lg overflow-hidden">
                <div className="bg-bad/10 px-3 py-1.5 text-xs font-semibold text-bad">
                  <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                  Errori
                </div>
                <div className="max-h-32 overflow-y-auto text-xs">
                  {result.errors.map((e, i) => (
                    <div
                      key={i}
                      className="flex justify-between gap-2 px-3 py-1 border-t border-bad/30"
                    >
                      <span className="font-mono text-gray-700 shrink-0">
                        {e.numero}
                      </span>
                      <span className="text-bad text-right">{e.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={reset}
                className="btn btn-secondary flex-1 .5"
              >
                Importa altro file
              </button>
              <button
                onClick={close}
                className="btn btn-primary flex-1 .5"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/constants";

interface InAttesa {
  dataContabile: string;
  concetto: string;
  osservazioni: string | null;
  importo: number;
}
interface Esito {
  giaImportato: boolean;
  importId: number;
  nomeFile: string;
  importatoIl: string;
  conto: string | null;
  periodoDa: string | null;
  periodoA: string | null;
  righeLette: number;
  righeNuove: number;
  righeDuplicate: number;
  uscite: number;
  entrate: number;
  escluse: number;
  inAttesa: InAttesa[];
}

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("it-IT", { timeZone: "UTC" }) : "—";

// Caricamento di un estratto BBVA (XLSX "Histórico movimientos"): il file
// viene letto dal server, i movimenti già presenti vengono saltati.
export default function ImportEstrattoModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importato = useRef(false);

  const invia = async (f: File | null | undefined) => {
    if (!f || busy) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      setErrore("Formato non supportato: serve il file .xlsx di BBVA.");
      return;
    }
    setErrore(null);
    setEsito(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/banca/import", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        setErrore(j.error || "Errore durante l'importazione");
        return;
      }
      setEsito(j as Esito);
      if (!j.giaImportato) importato.current = true;
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const chiudi = () => {
    if (importato.current) onImported();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="glass-modal w-full max-w-lg rounded-2xl bg-white p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Importa estratto BBVA</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Export XLSX &quot;Histórico movimientos&quot;, periodo a piacere: i movimenti già
              caricati vengono riconosciuti e saltati.
            </p>
          </div>
          <button onClick={chiudi} className="p-1 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!esito && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              invia(e.dataTransfer.files?.[0]);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors",
              drag ? "border-brand/40 bg-brand/10" : "border-gray-200 hover:border-brand/40 hover:bg-gray-50",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => invia(e.target.files?.[0])}
            />
            {busy ? (
              <Loader2 className="w-8 h-8 mx-auto text-brand animate-spin" />
            ) : (
              <Upload className="w-8 h-8 mx-auto text-gray-400" />
            )}
            <p className="text-sm text-gray-700 mt-3 font-medium">
              {busy ? "Lettura del file in corso…" : "Trascina qui il file o clicca per sceglierlo"}
            </p>
            <p className="text-xs text-gray-400 mt-1">.xlsx esportato da BBVA Empresas</p>
          </div>
        )}

        {errore && (
          <div className="mt-4 flex items-start gap-2 text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {errore}
          </div>
        )}

        {esito && (
          <div className="space-y-3">
            <div
              className={cn(
                "flex items-start gap-2 text-sm rounded-lg px-3 py-2 border",
                esito.giaImportato
                  ? "bg-warn/10 border-warn/30 text-warn"
                  : "bg-ok/10 border-ok/30 text-ok",
              )}
            >
              {esito.giaImportato ? (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <div>
                {esito.giaImportato
                  ? `Questo file identico era già stato importato il ${data(esito.importatoIl)}: nessun movimento aggiunto.`
                  : `Importazione completata: ${esito.righeNuove} movimenti nuovi.`}
              </div>
            </div>
            <div className="glass-card rounded-xl p-4 text-sm">
              <div className="flex items-center gap-2 text-gray-700 font-medium">
                <FileSpreadsheet className="w-4 h-4 text-ok" /> {esito.nomeFile}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Conto {esito.conto ?? "—"} · periodo {data(esito.periodoDa)} – {data(esito.periodoA)}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                {[
                  ["Lette", esito.righeLette],
                  ["Nuove", esito.righeNuove],
                  ["Già presenti", esito.righeDuplicate],
                  ["Uscite nuove", esito.uscite],
                  ["Entrate nuove", esito.entrate],
                  ["Escluse da regola", esito.escluse],
                ].map(([l, v]) => (
                  <div key={String(l)} className="bg-gray-50 rounded-lg py-2">
                    <div className="text-lg font-bold text-gray-900">{v}</div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            {esito.inAttesa.length > 0 && (
              <div className="text-sm rounded-lg px-3 py-2 border bg-warn/10 border-warn/30">
                <div className="flex items-start gap-2 text-warn">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    {esito.inAttesa.length === 1
                      ? "1 movimento non ancora contabilizzato dalla banca: non caricato."
                      : `${esito.inAttesa.length} movimenti non ancora contabilizzati dalla banca: non caricati.`}{" "}
                    Entrano da soli col prossimo estratto che li comprende, scaricato da domani.
                  </div>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-gray-700">
                  {esito.inAttesa.map((r, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="truncate" title={r.osservazioni ?? undefined}>
                        {data(r.dataContabile)} · {r.concetto}
                      </span>
                      <span className="whitespace-nowrap font-medium">{fmt(r.importo)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEsito(null);
                  setErrore(null);
                }}
                className="btn btn-secondary"
              >
                Carica un altro file
              </button>
              <button
                onClick={chiudi}
                className="btn btn-primary"
              >
                Vai ai movimenti
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <div className="glass-modal w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
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
              drag ? "border-pink-400 bg-pink-50" : "border-gray-200 hover:border-pink-300 hover:bg-gray-50",
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
              <Loader2 className="w-8 h-8 mx-auto text-pink-500 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 mx-auto text-gray-300" />
            )}
            <p className="text-sm text-gray-700 mt-3 font-medium">
              {busy ? "Lettura del file in corso…" : "Trascina qui il file o clicca per sceglierlo"}
            </p>
            <p className="text-xs text-gray-400 mt-1">.xlsx esportato da BBVA Empresas</p>
          </div>
        )}

        {errore && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {errore}
          </div>
        )}

        {esito && (
          <div className="space-y-3">
            <div
              className={cn(
                "flex items-start gap-2 text-sm rounded-lg px-3 py-2 border",
                esito.giaImportato
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700",
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
              <div className="flex items-center gap-2 text-gray-800 font-medium">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {esito.nomeFile}
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
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setEsito(null);
                  setErrore(null);
                }}
                className="glass-btn-secondary text-sm font-medium px-3 py-2 rounded-xl text-gray-700"
              >
                Carica un altro file
              </button>
              <button
                onClick={chiudi}
                className="glass-btn-primary text-sm font-medium px-4 py-2 rounded-xl text-white"
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

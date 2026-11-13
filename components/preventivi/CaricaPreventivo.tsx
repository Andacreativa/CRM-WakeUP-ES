"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type PreventivoPrecompilato,
  DEFAULT_CONDIZIONI,
  nuovaVoce,
} from "./tipi";
import type { PreventivoEstratto } from "@/app/api/extract-preventivo/route";

// «Carica preventivo»: si sceglie un PDF (o un'immagine) di un preventivo,
// l'app lo legge e precompila il modulo con voci sintetiche e importi.
export default function CaricaPreventivoButton({
  onEstratto,
  className,
  compatto = false,
}: {
  onEstratto: (p: PreventivoPrecompilato) => void;
  className?: string;
  compatto?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const carica = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setErrore(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-preventivo", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as Partial<PreventivoEstratto> & { error?: string };
      if (!res.ok) {
        setErrore(j.error || `Lettura non riuscita (${res.status})`);
        return;
      }
      onEstratto(precompilatoDa(j as PreventivoEstratto, file.name));
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Lettura non riuscita");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={cn("btn btn-secondary", compatto && "btn-sm")}
        title="Leggi un preventivo in PDF e precompila il modulo"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {busy ? "Leggo il preventivo…" : "Carica preventivo"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => carica(e.target.files?.[0] ?? null)}
      />
      {errore && <span className="text-xs text-bad">{errore}</span>}
    </span>
  );
}

// Dal risultato della lettura ai campi del modulo
export function precompilatoDa(e: PreventivoEstratto, nomeFile: string): PreventivoPrecompilato {
  const voci = (e.voci ?? [])
    .map((v) => ({
      ...nuovaVoce(),
      servizio: String(v.servizio ?? "").trim(),
      descrizione: String(v.descrizione ?? "").trim(),
      tipo: v.tipo === "mensile" ? ("mensile" as const) : ("una_tantum" as const),
      quantita: Math.max(1, Math.round(Number(v.quantita) || 1)),
      prezzoUnitario: Math.max(0, Math.round((Number(v.prezzoUnitario) || 0) * 100) / 100),
    }))
    .filter((v) => v.servizio);
  return {
    origine: nomeFile,
    oggetto: String(e.oggetto ?? "").trim(),
    nomeCliente: (e.nomeCliente ?? e.aziendaCliente ?? "").trim(),
    aziendaCliente: (e.aziendaCliente ?? "").trim(),
    emailCliente: (e.emailCliente ?? "").trim(),
    lingua: e.lingua === "es" ? "es" : e.lingua === "en" ? "en" : "it",
    iva: Math.max(0, Math.min(100, Number(e.ivaPercento) || 0)),
    dataScadenza: /^\d{4}-\d{2}-\d{2}$/.test(e.dataScadenza ?? "") ? (e.dataScadenza as string) : "",
    condizioni: (e.condizioni ?? "").trim() || DEFAULT_CONDIZIONI,
    note: (e.noteInterne ?? "").trim(),
    voci: voci.length ? voci : [nuovaVoce()],
  };
}

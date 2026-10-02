"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import {
  IMPOSTAZIONI_FATTURE_DEFAULT,
  type ImpostazioniFatture,
} from "@/lib/impostazioni";

interface Field {
  label: string;
  value: string;
}

// Dati aziendali letti dalle Impostazioni fatture (con i default di Anda
// come riserva), ognuno copiabile con un clic.
function campi(c: ImpostazioniFatture): Field[] {
  const localita = [c.cap, c.citta, c.provincia ? `(${c.provincia})` : ""]
    .filter(Boolean)
    .join(" ");
  return [
    { label: "Ragione sociale", value: c.ragioneSociale },
    { label: "Indirizzo", value: c.indirizzo },
    { label: "Località", value: localita },
    { label: "NIF", value: c.nif },
    { label: "Email", value: c.email },
    { label: "Telefono", value: c.telefono },
    { label: `IBAN${c.banca ? ` ${c.banca}` : ""}`, value: c.iban },
  ].filter((f) => f.value);
}

export default function CompanyInfoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [cfg, setCfg] = useState<ImpostazioniFatture>(IMPOSTAZIONI_FATTURE_DEFAULT);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    fetch("/api/impostazioni/fatture")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCfg(d);
      })
      .catch(() => {});
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch (err) {
      console.error("copy failed", err);
    }
  };

  if (!open) return null;
  const fields = campi(cfg);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Dati aziendali</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-left">
          {fields.map((f) => (
            <div
              key={f.label}
              className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
                  {f.label}
                </p>
                <p className="text-xs text-gray-700 break-words">{f.value}</p>
              </div>
              <button
                onClick={() => copy(f.value)}
                className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Copia"
                aria-label={`Copia ${f.label}`}
              >
                {copied === f.value ? (
                  <Check className="w-3.5 h-3.5 text-ok" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400">
          Si modificano in Finance › Impostazioni.
        </p>
      </div>
    </div>
  );
}

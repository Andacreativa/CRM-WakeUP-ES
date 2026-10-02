"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

// Export unico per tutta l'app (come in Fatture): il bottone "Esporta" apre
// la barra in fondo con le azioni (Excel, PDF, CSV…). Dove la pagina ha le
// spunte, si esportano le righe spuntate oppure tutte quelle del filtro.

export interface ExportAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  primary?: boolean;
  title?: string;
}
export interface ExportGroup {
  label?: string;
  actions: ExportAction[];
}

export function ExportButton({
  active,
  onClick,
  title,
  label = "Esporta",
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn("btn", active ? "btn-primary" : "btn-secondary")}
    >
      <Download /> {label}
    </button>
  );
}

export function ExportBar({
  selected,
  total,
  unit,
  maschile = false,
  importo,
  tutte,
  onTutte,
  summary,
  groups,
  onClose,
}: {
  selected?: number; // righe spuntate; assente = la pagina non ha spunte
  total: number; // righe del filtro
  unit: string; // plurale: "fatture", "spese", "clienti"
  maschile?: boolean; // per "selezionati" invece di "selezionate"
  importo?: string; // totale formattato della lista esportata
  tutte?: boolean;
  onTutte?: () => void;
  summary?: ReactNode; // testo libero al posto del conteggio
  groups: ExportGroup[];
  onClose: () => void;
}) {
  const selezionabile = selected !== undefined && !!onTutte;
  const usaTutte = !selezionabile || !!tutte;
  const n = usaTutte ? total : (selected ?? 0);
  const can = n > 0;
  const sel = n === 1 ? (maschile ? "selezionato" : "selezionata") : maschile ? "selezionati" : "selezionate";

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <>
      <div className="h-20" aria-hidden />
      <div className="export-bar bg-white border-t border-gray-200 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3">
          <div className="flex items-center gap-3 flex-wrap text-sm text-gray-600">
            {summary ?? (
              <span>
                <strong className="text-gray-900 text-base">{n}</strong> {unit}
                {usaTutte ? (selezionabile ? ", tutte quelle del filtro" : " del filtro") : ` ${sel}`}
                {importo && can && (
                  <>
                    {" · "}
                    <strong className="text-gray-900">{importo}</strong>
                  </>
                )}
              </span>
            )}
            {selezionabile && (
              <button type="button" onClick={onTutte} className="text-brand underline underline-offset-4">
                {tutte ? "torna alle spuntate" : `oppure tutte quelle del filtro (${total})`}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {groups.map((g, gi) => (
              <Fragment key={gi}>
                {gi > 0 && <span className="w-px h-6 bg-gray-200 mx-1" />}
                {g.label && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</span>
                )}
                {g.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    disabled={!can}
                    title={a.title}
                    className={cn("btn btn-sm", a.primary ? "btn-primary" : "btn-secondary")}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </Fragment>
            ))}
            <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
              Annulla
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

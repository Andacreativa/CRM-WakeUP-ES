"use client";

import Pills from "@/components/Pills";
import { ANNI, AZIENDE, CANALE_LABEL } from "@/lib/constants";

interface Props {
  anno: number;
  azienda: string;
  onAnno: (a: number) => void;
  onAzienda: (a: string) => void;
  showAzienda?: boolean;
  showAnno?: boolean;
  altroLabel?: string;
  // Nascondi opzioni specifiche dal selettore (es. ["Altro"])
  hideOptions?: string[];
  // Aggiunge "Tutti" come prima voce (value 0) nel selettore anno
  includeAllYears?: boolean;
}

// Label default per la pill "Altro"; può essere override via prop altroLabel
const DEFAULT_ALTRO_LABEL = "Altro";

// Selettore azienda piatto (come i filtri di stato delle altre pagine):
// bottone attivo rosa pieno, gli altri grigi. L'anno di norma si sceglie
// nella topbar; il selettore qui resta disponibile a richiesta.
export default function FiltriBar({
  anno,
  azienda,
  onAnno,
  onAzienda,
  showAzienda = true,
  showAnno = false,
  altroLabel,
  hideOptions,
  includeAllYears = false,
}: Props) {
  const labelMap: Record<string, string> = {
    "": "Tutte",
    ...CANALE_LABEL,
    Altro: altroLabel ?? DEFAULT_ALTRO_LABEL,
  };
  const hide = new Set(hideOptions ?? []);
  const OPTIONS = [
    { val: "", label: "Tutte" },
    ...AZIENDE.filter((a) => !hide.has(a)).map((a) => ({
      val: a,
      label: labelMap[a] ?? a,
    })),
  ];

  return (
    <div className="flex items-center gap-3">
      {showAnno && (
        <select
          value={anno}
          onChange={(e) => onAnno(parseInt(e.target.value))}
          className="sel cursor-pointer"
        >
          {includeAllYears && <option value={0}>Tutti</option>}
          {ANNI.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}

      {showAzienda && (
        <Pills value={azienda} onChange={onAzienda} options={OPTIONS} />
      )}
    </div>
  );
}

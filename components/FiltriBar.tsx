"use client";

import { useRef, useLayoutEffect, useState } from "react";
import { ANNI, AZIENDE } from "@/lib/constants";

interface Props {
  anno: number;
  azienda: string;
  onAnno: (a: number) => void;
  onAzienda: (a: string) => void;
  showAzienda?: boolean;
  showAnno?: boolean;
  altroLabel?: string;
  // Nascondi opzioni specifiche dal pill (es. ["Altro"])
  hideOptions?: string[];
}

const PILL_COLORS: Record<string, string> = {
  "": "linear-gradient(160deg, rgba(255,120,180,0.97) 0%, rgba(232,48,138,1) 50%, rgba(185,20,95,1) 100%)",
  Spagna:
    "linear-gradient(160deg, rgba(255,130,130,0.97) 0%, rgba(239,68,68,1) 50%, rgba(180,28,28,1) 100%)",
  Italia:
    "linear-gradient(160deg, rgba(100,220,150,0.97) 0%, rgba(34,197,94,1) 50%, rgba(21,128,61,1) 100%)",
  Altro:
    "linear-gradient(160deg, rgba(130,145,165,0.97) 0%, rgba(100,116,139,1) 50%, rgba(51,65,85,1) 100%)",
};

const PILL_SHADOW: Record<string, string> = {
  "": "0 1px 0 0 rgba(255,200,220,0.6) inset, 0 -1px 0 0 rgba(140,0,60,0.35) inset, 0 3px 10px rgba(232,48,138,0.4)",
  Spagna:
    "0 1px 0 0 rgba(255,200,200,0.6) inset, 0 -1px 0 0 rgba(140,0,0,0.3) inset, 0 3px 10px rgba(239,68,68,0.4)",
  Italia:
    "0 1px 0 0 rgba(180,255,210,0.6) inset, 0 -1px 0 0 rgba(0,100,40,0.3) inset, 0 3px 10px rgba(34,197,94,0.4)",
  Altro:
    "0 1px 0 0 rgba(200,215,230,0.5) inset, 0 -1px 0 0 rgba(20,30,50,0.25) inset, 0 3px 10px rgba(100,116,139,0.3)",
};

// Label default per la pill "Altro"; può essere override via prop altroLabel
const DEFAULT_ALTRO_LABEL = "Spese Fisse";

export default function FiltriBar({
  anno,
  azienda,
  onAnno,
  onAzienda,
  showAzienda = true,
  showAnno = true,
  altroLabel,
  hideOptions,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ left: 4, width: 0 });

  const labelMap: Record<string, string> = {
    "": "Tutte",
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

  const activeIndex = OPTIONS.findIndex((o) => o.val === azienda);

  useLayoutEffect(() => {
    const btn = btnRefs.current[activeIndex];
    if (btn) {
      setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [azienda, activeIndex]);

  return (
    <div className="flex items-center gap-3">
      {/* Selettore Anno */}
      {showAnno && (
        <select
          value={anno}
          onChange={(e) => onAnno(parseInt(e.target.value))}
          className="text-sm font-medium px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 outline-none cursor-pointer appearance-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
            paddingRight: "28px",
          }}
        >
          {ANNI.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}

      {/* Selettore Azienda con pill scorrevole */}
      {showAzienda && (
        <div
          ref={containerRef}
          className="relative flex gap-1 bg-gray-100/80 rounded-xl p-1"
        >
          {/* Pill scorrevole con effetto glass */}
          <div
            className="absolute top-1 bottom-1 rounded-lg pointer-events-none"
            style={{
              left: pill.left,
              width: pill.width,
              background: PILL_COLORS[azienda] ?? PILL_COLORS[""],
              boxShadow: PILL_SHADOW[azienda] ?? PILL_SHADOW[""],
              transition:
                "left 0.25s cubic-bezier(0.34,1.56,0.64,1), width 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
            }}
          />
          {OPTIONS.map(({ val, label }, i) => (
            <button
              key={val}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              onClick={() => onAzienda(val)}
              className="relative z-10 text-sm px-3 py-1.5 rounded-lg font-medium"
              style={{
                color: azienda === val ? "#fff" : "#64748b",
                transition: "color 0.2s ease",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

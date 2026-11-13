"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  VOCI_REGISTRO_BANCA,
  type RestoRegistro,
  type RigaRegistroBanca,
  type VoceRegistroBanca,
} from "@/lib/banca-shared";

// Righe del registro pagamenti che un movimento in uscita paga: persona,
// voce, mese e importo. La somma (più l'eventuale resto, es. altre ritenute
// del mod. 111) deve tornare con il movimento.

export const VOCE_REGISTRO_LABEL: Record<VoceRegistroBanca, string> = {
  stipendio: "Stipendio",
  seguridad: "Seguridad Social",
  irpf: "IRPF",
  benefit: "Benefit",
  rimborsi: "Rimborsi",
};

const cent = (n: number) => Math.round(Math.abs(n) * 100);

export default function RegistroRigheModal({
  importo,
  persone,
  righe: righeIniziali,
  resto: restoIniziale,
  meseDefault,
  annoDefault,
  onClose,
  onSave,
}: {
  importo: number; // del movimento (in valore assoluto)
  persone: { id: number; nome: string }[];
  righe: RigaRegistroBanca[];
  resto: RestoRegistro | null;
  meseDefault: number;
  annoDefault: number;
  onClose: () => void;
  onSave: (righe: RigaRegistroBanca[], resto: RestoRegistro | null) => void;
}) {
  const [righe, setRighe] = useState<RigaRegistroBanca[]>(righeIniziali);
  const [resto, setResto] = useState<RestoRegistro | null>(restoIniziale);
  // persone in elenco + quelle delle righe (anche se non più attive)
  const elenco = [
    ...persone,
    ...righeIniziali
      .filter((r) => !persone.some((p) => p.id === r.dipendenteId))
      .map((r) => ({ id: r.dipendenteId, nome: r.nome })),
  ].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);

  const somma = righe.reduce((t, r) => t + cent(r.importo || 0), 0) + (resto ? cent(resto.importo || 0) : 0);
  const diff = cent(importo) - somma;
  const valide =
    righe.length > 0 &&
    righe.every((r) => r.dipendenteId && r.importo > 0) &&
    (!resto || resto.importo > 0) &&
    Math.abs(diff) <= 1;

  // Cambiando persona, voce o mese la riga non è più quella del registro
  // proposta: alla conferma si collega quella giusta, se c'è, o si crea.
  const cambia = (i: number, patch: Partial<RigaRegistroBanca>) =>
    setRighe((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const n = { ...r, ...patch };
        if ("dipendenteId" in patch || "voce" in patch || "mese" in patch || "anno" in patch) {
          n.pagamentoId = null;
          n.importoRegistro = null;
          n.nome = elenco.find((p) => p.id === n.dipendenteId)?.nome ?? n.nome;
        }
        return n;
      }),
    );
  const aggiungi = () =>
    setRighe((rs) => [
      ...rs,
      {
        dipendenteId: elenco[0]?.id ?? 0,
        nome: elenco[0]?.nome ?? "",
        voce: rs[rs.length - 1]?.voce ?? "stipendio",
        mese: rs[rs.length - 1]?.mese ?? meseDefault,
        anno: rs[rs.length - 1]?.anno ?? annoDefault,
        importo: Math.max(0, diff) / 100,
        pagamentoId: null,
        importoRegistro: null,
      },
    ]);

  const inputCls = "sel sel-sm w-full min-w-0";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="glass-modal w-full max-w-3xl rounded-2xl bg-white p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Registro dipendenti</h2>
            <p className="text-sm text-gray-500">
              Movimento di {fmt(importo)}: le righe già nel registro si collegano, le altre si creano con la loro spesa.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_70px_100px_28px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-0.5">
            <span>Persona</span>
            <span>Voce</span>
            <span>Mese</span>
            <span>Anno</span>
            <span className="text-right">Importo</span>
            <span />
          </div>
          {righe.map((r, i) => (
            <div key={i}>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_70px_100px_28px] gap-2 items-center">
                <select
                  value={r.dipendenteId}
                  onChange={(e) => cambia(i, { dipendenteId: parseInt(e.target.value) || 0 })}
                  className={inputCls}
                >
                  {!r.dipendenteId && <option value={0}>Scegli…</option>}
                  {elenco.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <select
                  value={r.voce}
                  onChange={(e) => cambia(i, { voce: e.target.value as VoceRegistroBanca })}
                  className={inputCls}
                >
                  {VOCI_REGISTRO_BANCA.map((v) => (
                    <option key={v} value={v}>
                      {VOCE_REGISTRO_LABEL[v]}
                    </option>
                  ))}
                </select>
                <select
                  value={r.mese}
                  onChange={(e) => cambia(i, { mese: parseInt(e.target.value) })}
                  className={inputCls}
                >
                  {MESI.map((m, k) => (
                    <option key={m} value={k + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={r.anno}
                  onChange={(e) => cambia(i, { anno: parseInt(e.target.value) || annoDefault })}
                  className={inputCls}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={Number.isFinite(r.importo) ? r.importo : ""}
                  onChange={(e) => cambia(i, { importo: parseFloat(e.target.value) || 0 })}
                  className={cn(inputCls, "text-right tabular-nums")}
                />
                <button
                  onClick={() => setRighe((rs) => rs.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-bad"
                  title="Togli la riga"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-[11px] text-gray-400 pl-0.5 mt-0.5">
                {r.nuova
                  ? "riga in più (integrazione)"
                  : r.pagamentoId
                    ? `già nel registro${r.importoRegistro !== null ? ` con ${fmt(r.importoRegistro)}: prende l'importo della banca` : ""}`
                    : "nuova riga del registro (se c'è già, si collega quella)"}
              </div>
            </div>
          ))}
          <button onClick={aggiungi} className="btn btn-ghost btn-sm">
            <Plus className="w-4 h-4" /> Aggiungi riga
          </button>
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          {resto ? (
            <div className="grid grid-cols-[1fr_100px_28px] gap-2 items-center">
              <input
                value={resto.descrizione}
                onChange={(e) => setResto({ ...resto, descrizione: e.target.value })}
                className={inputCls}
                title="Spesa a parte, categoria Tasse"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={resto.importo}
                onChange={(e) => setResto({ ...resto, importo: parseFloat(e.target.value) || 0 })}
                className={cn(inputCls, "text-right tabular-nums")}
              />
              <button onClick={() => setResto(null)} className="text-gray-400 hover:text-bad" title="Togli il resto">
                <Trash2 className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-gray-400 col-span-3 -mt-1">
                Resto: spesa a parte in Tasse · {MESI[resto.mese - 1]} {resto.anno}
              </span>
            </div>
          ) : (
            <button
              onClick={() =>
                setResto({
                  importo: Math.max(0, diff) / 100,
                  descrizione: "Altre ritenute (mod. 111)",
                  mese: righe[righe.length - 1]?.mese ?? meseDefault,
                  anno: righe[righe.length - 1]?.anno ?? annoDefault,
                })
              }
              className="btn btn-ghost btn-sm"
            >
              <Plus className="w-4 h-4" /> Resto come spesa Tasse
            </button>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Righe {fmt(somma / 100)} · movimento {fmt(importo)}
            </span>
            <span className={cn("font-semibold", Math.abs(diff) <= 1 ? "text-ok" : "text-bad")}>
              {Math.abs(diff) <= 1 ? "Torna ✓" : `Differenza ${fmt(diff / 100)}`}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Annulla
          </button>
          <button onClick={() => onSave(righe, resto)} disabled={!valide} className="btn btn-primary disabled:opacity-50">
            Usa queste righe
          </button>
        </div>
      </div>
    </div>
  );
}

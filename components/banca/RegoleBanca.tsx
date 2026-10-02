"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { CATEGORIE_SPESA } from "@/lib/constants";
import { ESCLUDI, type RegolaBanca, type VoceMemoria } from "@/lib/banca-shared";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-300";

const regexValida = (p: string) => {
  try {
    new RegExp(p, "i");
    return true;
  } catch {
    return false;
  }
};

// Regole di categoria (prima che corrisponde vince) e memoria dei
// beneficiari imparata dalle conferme. Salvate in Impostazione "banca".
export default function RegoleBanca({ onNotify }: { onNotify: (kind: "ok" | "err", text: string) => void }) {
  const [regole, setRegole] = useState<RegolaBanca[]>([]);
  const [memoria, setMemoria] = useState<Record<string, VoceMemoria>>({});
  const [regoleDefault, setRegoleDefault] = useState<RegolaBanca[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/banca/impostazioni")
      .then((r) => r.json())
      .then((j) => {
        setRegole(Array.isArray(j.regole) ? j.regole : []);
        setMemoria(j.memoria ?? {});
        setRegoleDefault(Array.isArray(j.regoleDefault) ? j.regoleDefault : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const aggiorna = (i: number, patch: Partial<RegolaBanca>) => {
    setRegole((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const sposta = (i: number, dir: -1 | 1) => {
    setRegole((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = rs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };
  const rimuovi = (i: number) => {
    setRegole((rs) => rs.filter((_, k) => k !== i));
    setDirty(true);
  };
  const aggiungi = () => {
    setRegole((rs) => [...rs, { pattern: "", categoria: "Altro", fornitore: "" }]);
    setDirty(true);
  };
  const ripristina = () => {
    setRegole(regoleDefault.map((r) => ({ ...r })));
    setDirty(true);
  };
  const dimentica = (k: string) => {
    setMemoria((m) => {
      const next = { ...m };
      delete next[k];
      return next;
    });
    setDirty(true);
  };

  const salva = async () => {
    const invalide = regole.filter((r) => !r.pattern.trim() || !regexValida(r.pattern));
    if (invalide.length) {
      onNotify("err", "Alcune regole hanno un'espressione vuota o non valida.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/banca/impostazioni", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regole, memoria }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Errore");
      setRegole(j.regole);
      setMemoria(j.memoria ?? {});
      setDirty(false);
      onNotify("ok", "Regole salvate. Valgono per i movimenti ancora da rivedere e per i prossimi import.");
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const voci = Object.entries(memoria).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-gray-900">Regole di categoria</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
              Ogni regola è un&apos;espressione regolare cercata in concetto, beneficiario e
              osservazioni del movimento (maiuscole ignorate). Vince la prima che corrisponde;
              se nessuna corrisponde la categoria proposta è &quot;Altro&quot;. Con &quot;Escludi&quot; il
              movimento viene messo tra gli esclusi già all&apos;importazione.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={ripristina}
              className="glass-btn-secondary flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl text-gray-700"
            >
              <RotateCcw className="w-4 h-4" /> Predefinite
            </button>
            <button
              onClick={aggiungi}
              className="glass-btn-secondary flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl text-gray-700"
            >
              <Plus className="w-4 h-4" /> Regola
            </button>
            <button
              onClick={salva}
              disabled={saving || !dirty}
              className="glass-btn-primary flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl text-white disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Salvo…" : "Salva"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["#", "Espressione", "Categoria", "Fornitore proposto", ""].map((h, i) => (
                  <th
                    key={i}
                    className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regole.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-400">
                    Nessuna regola: tutte le uscite verranno proposte come &quot;Altro&quot;.
                  </td>
                </tr>
              )}
              {regole.map((r, i) => {
                const ok = r.pattern.trim() && regexValida(r.pattern);
                return (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-400 w-8">{i + 1}</td>
                    <td className="px-3 py-2">
                      <input
                        value={r.pattern}
                        onChange={(e) => aggiorna(i, { pattern: e.target.value })}
                        placeholder="es. METROPOLITAN|ALQUILER"
                        className={cn(inputCls, "font-mono", !ok && "border-red-300 bg-red-50")}
                      />
                    </td>
                    <td className="px-3 py-2 w-48">
                      <select
                        value={r.categoria}
                        onChange={(e) => aggiorna(i, { categoria: e.target.value })}
                        className={inputCls}
                      >
                        {CATEGORIE_SPESA.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value={ESCLUDI}>Escludi (non è una spesa)</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 w-56">
                      <input
                        value={r.fornitore}
                        onChange={(e) => aggiorna(i, { fornitore: e.target.value })}
                        placeholder="(beneficiario del movimento)"
                        className={inputCls}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={() => sposta(i, -1)} className="p-1 text-gray-400 hover:text-gray-700" title="Su">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => sposta(i, 1)} className="p-1 text-gray-400 hover:text-gray-700" title="Giù">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button onClick={() => rimuovi(i)} className="p-1 text-gray-400 hover:text-red-500" title="Elimina">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <h2 className="text-base font-bold text-gray-900">Memoria beneficiari</h2>
        <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
          Quando confermi categoria e fornitore per un beneficiario, la scelta viene ricordata e
          ha la precedenza sulle regole. Qui puoi dimenticarla.
        </p>
        {voci.length === 0 ? (
          <p className="text-sm text-gray-400 mt-4">Ancora niente: si riempie man mano che crei o abbini spese.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Beneficiario", "Categoria", "Fornitore", ""].map((h, i) => (
                    <th
                      key={i}
                      className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voci.map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-sm text-gray-800 font-mono">{k}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{v.categoria}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">{v.fornitore || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => dimentica(k)} className="p-1 text-gray-400 hover:text-red-500" title="Dimentica">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

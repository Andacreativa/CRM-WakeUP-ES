"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { fmt, MESI, AZIENDE, AZIENDA_COLORI } from "@/lib/constants";
import { isFinnRitenuta } from "@/lib/finn-split";

export interface AltroIngresso {
  id: number;
  fonte: string;
  azienda: string;
  aziendaNota: string | null;
  descrizione: string | null;
  mese: number;
  anno: number;
  importo: number;
  incassato: boolean;
  dataIncasso: string | null;
}

const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

const emptyForm = {
  fonte: "",
  azienda: AZIENDE[0] ?? "Spagna",
  aziendaNota: "",
  descrizione: "",
  mese: new Date().getMonth() + 1,
  anno: new Date().getFullYear(),
  importo: "",
  incassato: false,
  dataIncasso: "",
};

interface Props {
  anno: number;
  azienda: string;
  onChanged?: () => void;
}

export default function AltriIngressi({ anno, azienda, onChanged }: Props) {
  const [rows, setRows] = useState<AltroIngresso[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AltroIngresso | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filtroMese, setFiltroMese] = useState(0);
  // paginazione semplice
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const load = async () => {
    const params = new URLSearchParams({ anno: String(anno) });
    if (azienda) params.set("azienda", azienda);
    const data = (await (
      await fetch(`/api/altri-ingressi?${params}`)
    ).json()) as any;
    const arr: AltroIngresso[] = Array.isArray(data) ? data : [];
    arr.sort((a, b) => {
      if (b.anno !== a.anno) return b.anno - a.anno;
      return b.mese - a.mese;
    });
    setRows(arr);
  };
  useEffect(() => {
    load();
  }, [anno, azienda]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, anno });
    setShowForm(true);
  };
  const openEdit = (r: AltroIngresso) => {
    setEditing(r);
    setForm({
      fonte: r.fonte,
      azienda: r.azienda,
      aziendaNota: r.aziendaNota || "",
      descrizione: r.descrizione || "",
      mese: r.mese,
      anno: r.anno,
      importo: String(r.importo),
      incassato: r.incassato,
      dataIncasso: r.dataIncasso ? r.dataIncasso.slice(0, 10) : "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.fonte || !form.importo) return;
    const payload = {
      ...form,
      importo: parseFloat(form.importo),
      dataIncasso: form.dataIncasso || null,
      aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
    };
    if (editing) {
      await fetch(`/api/altri-ingressi/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/altri-ingressi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    load();
    onChanged?.();
  };

  const toggleIncassato = async (r: AltroIngresso) => {
    await fetch(`/api/altri-ingressi/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incassato: !r.incassato }),
    });
    load();
    onChanged?.();
  };

  const del = async (id: number) => {
    if (!confirm("Eliminare questo ingresso?")) return;
    await fetch(`/api/altri-ingressi/${id}`, { method: "DELETE" });
    load();
    onChanged?.();
  };

  const filtered = (rows ?? []).filter(
    (r) => !filtroMese || r.mese === filtroMese,
  );
  // Ritenute Finn: visibili in tabella ma escluse dai totali
  const filteredCalc = filtered.filter((r) => !isFinnRitenuta(r));
  const totale = filteredCalc.reduce(
    (s: number, r) => s + (r?.importo ?? 0),
    0,
  );
  const incassati = filteredCalc
    .filter((r) => r.incassato)
    .reduce((s: number, r) => s + (r?.importo ?? 0), 0);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (pageClamped - 1) * PAGE_SIZE,
    pageClamped * PAGE_SIZE,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Altri Ingressi</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            {filtered.length} voci · Incassati {fmt(incassati)} / Totale{" "}
            {fmt(totale)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filtroMese}
            onChange={(e) => {
              setFiltroMese(parseInt(e.target.value));
              setPage(1);
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-300"
          >
            <option value={0}>Tutti i mesi</option>
            {MESI.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={openNew}
            className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            <Plus className="w-4 h-4" /> Nuovo Ingresso
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {[
                "Fonte",
                "Azienda",
                "Mese",
                "Descrizione",
                "Importo",
                "Stato",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 ${h === "Importo" ? "text-right" : h === "Stato" ? "text-center" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="zebra">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessun ingresso
                </td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {r.fonte}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      background:
                        r.azienda === "Spagna"
                          ? "#fef2f2"
                          : r.azienda === "Italia"
                            ? "#f0fdf4"
                            : "#f8fafc",
                      color:
                        r.azienda === "Spagna"
                          ? "#ef4444"
                          : r.azienda === "Italia"
                            ? "#22c55e"
                            : "#64748b",
                    }}
                  >
                    {r.azienda === "Altro" && r.aziendaNota
                      ? r.aziendaNota
                      : r.azienda}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {MESI[r.mese - 1]}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {r.descrizione || "—"}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                  {fmt(r.importo)}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleIncassato(r)}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors ${r.incassato ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`}
                  >
                    {r.incassato ? (
                      <>
                        <Check className="w-3 h-3" /> Incassato
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3" /> In attesa
                      </>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => openEdit(r)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => del(r.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paginazione */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs">
            <span className="text-gray-500">
              Pagina {pageClamped} di {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageClamped === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Precedente
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageClamped === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Successiva
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? "Modifica Ingresso" : "Nuovo Ingresso"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Azienda *
                </label>
                <div className="flex gap-2">
                  {AZIENDE.filter((a) => a !== "Altro").map((a) => {
                    const col = AZIENDA_COLORI[a];
                    const active = form.azienda === a;
                    return (
                      <button
                        key={a}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            azienda: a,
                            aziendaNota: "",
                          }))
                        }
                        className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                        style={
                          active
                            ? {
                                background: col.bg,
                                color: col.text,
                                borderColor: col.border,
                              }
                            : {
                                background: "#fff",
                                borderColor: "#e2e8f0",
                                color: "#94a3b8",
                              }
                        }
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
                {form.azienda === "Altro" && (
                  <input
                    type="text"
                    value={form.aziendaNota}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, aziendaNota: e.target.value }))
                    }
                    placeholder="Specifica..."
                    className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Fonte *
                </label>
                <input
                  type="text"
                  value={form.fonte}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fonte: e.target.value }))
                  }
                  placeholder="Es. Interessi bancari, Rimborso..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Mese *
                  </label>
                  <select
                    value={form.mese}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  >
                    {MESI_NUMS.map((m) => (
                      <option key={m} value={m}>
                        {MESI[m - 1]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Importo (€) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.importo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, importo: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Descrizione
                </label>
                <input
                  type="text"
                  value={form.descrizione}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, descrizione: e.target.value }))
                  }
                  placeholder="Note sulla voce"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.incassato}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, incassato: e.target.checked }))
                  }
                  className="w-4 h-4"
                  style={{ accentColor: "#e8308a" }}
                />
                <span className="text-sm text-gray-700">Già incassato</span>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={save}
                className="glass-btn-primary flex-1 text-white text-sm font-medium py-2.5 rounded-xl"
              >
                {editing ? "Salva" : "Aggiungi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

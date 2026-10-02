"use client";

import SearchBox from "@/components/SearchBox";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Info } from "lucide-react";
import {
  fmt,
  MESI,
  CATEGORIE_INGRESSO,
  CATEGORIA_INGRESSO_LABEL,
} from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { isFinnRitenuta } from "@/lib/finn-split";
import FiltriBar from "@/components/FiltriBar";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import { cn, matchQ } from "@/lib/utils";

interface AltroIngresso {
  id: number;
  fonte: string;
  categoria: string | null;
  azienda: string;
  aziendaNota: string | null;
  descrizione: string | null;
  mese: number;
  anno: number;
  importo: number;
  incassato: boolean;
  dataIncasso: string | null;
  fatturaId: number | null;
}

const emptyForm = () => ({
  fonte: "",
  categoria: "altro",
  azienda: "Spagna",
  aziendaNota: "",
  descrizione: "",
  mese: new Date().getMonth() + 1,
  anno: new Date().getFullYear(),
  importo: "",
  incassato: false,
  dataIncasso: "",
});

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";
const selectCls =
  "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30";

// Categoria effettiva: le ritenute create in automatico dalla ripartizione
// commerciale sono "ritenuta_commerciale" anche se nate senza categoria.
const categoriaDi = (r: AltroIngresso) =>
  r.categoria ?? (isFinnRitenuta(r) ? "ritenuta_commerciale" : "altro");

// Solo contabile: visibile ma mai sommato (l'incasso è già nella fattura).
const soloContabile = (r: AltroIngresso) => isFinnRitenuta(r) || !!r.fatturaId;

export default function AltriIngressiPage() {
  const { anno, setAnno } = useAnno();
  const [rows, setRows] = useState<AltroIngresso[]>([]);
  const [azienda, setAzienda] = useState("");
  const [mese, setMese] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AltroIngresso | null>(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    const params = new URLSearchParams({ anno: String(anno) });
    if (azienda) params.set("azienda", azienda);
    const data = await (await fetch(`/api/altri-ingressi?${params}`)).json();
    const arr: AltroIngresso[] = Array.isArray(data) ? data : [];
    arr.sort((a, b) => (b.anno !== a.anno ? b.anno - a.anno : b.mese - a.mese));
    setRows(arr);
  }, [anno, azienda]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [anno, azienda, mese, categoria, q, pageSize]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mese || r.mese === mese) &&
          (!categoria || categoriaDi(r) === categoria) &&
          matchQ(q, r.fonte, r.descrizione),
      ),
    [rows, mese, categoria, q],
  );
  const sommabili = filtered.filter((r) => !soloContabile(r));
  const totale = sommabili.reduce((s, r) => s + r.importo, 0);
  const incassati = sommabili.filter((r) => r.incassato).reduce((s, r) => s + r.importo, 0);
  const contabili = filtered.filter(soloContabile).reduce((s, r) => s + r.importo, 0);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm(), anno: anno > 0 ? anno : new Date().getFullYear() });
    setShowForm(true);
  };
  const openEdit = (r: AltroIngresso) => {
    setEditing(r);
    setForm({
      fonte: r.fonte,
      categoria: categoriaDi(r),
      azienda: r.azienda,
      aziendaNota: r.aziendaNota ?? "",
      descrizione: r.descrizione ?? "",
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
      importo: parseFloat(String(form.importo).replace(",", ".")),
      dataIncasso: form.dataIncasso || null,
      aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
    };
    await fetch(editing ? `/api/altri-ingressi/${editing.id}` : "/api/altri-ingressi", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowForm(false);
    load();
  };
  const toggleIncassato = async (r: AltroIngresso) => {
    await fetch(`/api/altri-ingressi/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incassato: !r.incassato }),
    });
    load();
  };
  const del = async (r: AltroIngresso) => {
    if (!confirm("Eliminare questo ingresso?")) return;
    await fetch(`/api/altri-ingressi/${r.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Altri ingressi</h1>
          <p className="text-gray-500 text-sm mt-1">
            Entrate non da fattura: cashback, rimborsi, apporti, incassi senza fattura
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar anno={anno} azienda={azienda} onAnno={setAnno} onAzienda={setAzienda} showAzienda={false} />
          <button
            onClick={openNew}
            className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            <Plus className="w-4 h-4" /> Nuovo ingresso
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Totale", value: fmt(totale), color: "#e8308a" },
          { label: "Incassati", value: fmt(incassati), color: "#22c55e" },
          { label: "In attesa", value: fmt(totale - incassati), color: "#f59e0b" },
          { label: "Solo contabili", value: fmt(contabili), color: "#9ca3af" },
        ].map((k) => (
          <div key={k.label} className="glass-card rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca fonte, descrizione…" />
        <select value={mese} onChange={(e) => setMese(parseInt(e.target.value))} className={selectCls}>
          <option value={0}>Tutti i mesi</option>
          {MESI.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={selectCls}>
          <option value="">Tutte le categorie</option>
          {CATEGORIE_INGRESSO.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
        <span className="text-xs text-gray-400 inline-flex items-center gap-1 ml-auto">
          <Info className="w-3.5 h-3.5" />
          Le voci &quot;solo contabili&quot; (ritenute commerciali, legate a una fattura) non si sommano
        </span>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {["Fonte", "Categoria", "Mese", "Importo", "Stato", ""].map((h) => (
                <th
                  key={h}
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3",
                    h === "Importo" ? "text-right" : h === "Stato" ? "text-center" : "text-left",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="zebra">
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-gray-400 py-12 text-sm">Nessun ingresso</td>
              </tr>
            )}
            {paged.map((r) => {
              const contabile = soloContabile(r);
              return (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">{r.fonte}</div>
                    {r.descrizione && <div className="text-xs text-gray-500">{r.descrizione}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                      {CATEGORIA_INGRESSO_LABEL[categoriaDi(r)] ?? categoriaDi(r)}
                    </span>
                    {contabile && (
                      <span className="ml-1 text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                        solo contabile
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {MESI[r.mese - 1]} {r.anno}
                  </td>
                  <td className={cn("px-4 py-3 text-sm font-semibold text-right text-gray-900")}>
                    {fmt(r.importo)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleIncassato(r)}
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border",
                        r.incassato
                          ? "pill-ok"
                          : "pill-wait",
                      )}
                    >
                      {r.incassato ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {r.incassato ? "Incassato" : "In attesa"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Modifica">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => del(r)} className="p-1.5 text-gray-400 hover:text-bad" title="Elimina">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <PageNav total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="ingressi" />
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editing ? "Modifica ingresso" : "Nuovo ingresso"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Categoria</label>
                <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className={inputCls}>
                  {CATEGORIE_INGRESSO.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Fonte *</label>
                <input value={form.fonte} onChange={(e) => setForm((f) => ({ ...f, fonte: e.target.value }))} className={inputCls} placeholder="Es. BBVA, AEAT, nome cliente…" />
              </div>
              <div>
                <label className={labelCls}>Descrizione</label>
                <input value={form.descrizione} onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Mese</label>
                  <select value={form.mese} onChange={(e) => setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))} className={inputCls}>
                    {MESI.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Anno</label>
                  <input type="number" value={form.anno} onChange={(e) => setForm((f) => ({ ...f, anno: parseInt(e.target.value) || f.anno }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Importo (€)</label>
                  <input value={form.importo} onChange={(e) => setForm((f) => ({ ...f, importo: e.target.value }))} className={inputCls} inputMode="decimal" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.incassato} onChange={(e) => setForm((f) => ({ ...f, incassato: e.target.checked }))} />
                  Incassato
                </label>
                <div>
                  <label className={labelCls}>Data incasso</label>
                  <input type="date" value={form.dataIncasso} onChange={(e) => setForm((f) => ({ ...f, dataIncasso: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Annulla</button>
              <button onClick={save} className="glass-btn-primary text-white text-sm font-medium px-5 py-2 rounded-xl">
                {editing ? "Salva" : "Aggiungi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

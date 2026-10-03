"use client";

import { ExportBar, ExportButton } from "@/components/ExportBar";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { cn, matchQ } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  FileSpreadsheet,
  Paperclip,
  Camera,
  Upload,
  X,
} from "lucide-react";
import {
  fmt,
  MESI,
  CATEGORIE_SPESA,
  CATEGORIE_COLORI,
  CATEGORIE_COLORI_CHART,
  CATEGORIA_TEXT,
} from "@/lib/constants";
import FiltriBar from "@/components/FiltriBar";
import { useAnno } from "@/lib/anno-context";
import { exportExcel, exportPDF, speseToExcel } from "@/lib/export";
import { PageSizeSelect, PageNav } from "@/components/Pagination";

interface Spesa {
  id: number;
  azienda: string;
  aziendaNota: string | null;
  fornitore: string;
  fornitoreId: number | null;
  categoria: string;
  descrizione: string | null;
  note: string | null;
  ricevutaPath: string | null;
  mese: number;
  anno: number;
  importo: number;
}

interface Fornitore {
  id: number;
  nome: string;
  paese: string;
}

const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
const emptyForm = {
  azienda: "Spagna",
  aziendaNota: "",
  fornitore: "",
  fornitoreId: "" as string | number,
  categoria: CATEGORIE_SPESA[0],
  descrizione: "",
  note: "",
  mese: new Date().getMonth() + 1,
  anno: 2025,
  importo: "",
  ricevutaPath: "",
};

export default function SpesePage() {
  const [spese, setSpese] = useState<Spesa[]>([]);
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Spesa | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filtroMese, setFiltroMese] = useState(0);
  const [q, setQ] = useState("");
  // Esporta: come in Fatture, spunte sulle righe e barra in fondo
  const [exportMode, setExportMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tutte, setTutte] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroFornitore, setFiltroFornitore] = useState("");
  const { anno, setAnno } = useAnno();
  const [azienda, setAzienda] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [showEstrai, setShowEstrai] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    if (anno > 0) params.set("anno", String(anno));
    if (azienda) params.set("azienda", azienda);
    const [s, f] = await Promise.all([
      (await fetch(`/api/spese?${params}`)).json() as Promise<any>,
      (await fetch("/api/fornitori")).json() as Promise<any>,
    ]);
    setSpese(Array.isArray(s) ? s : []);
    setFornitori(Array.isArray(f) ? f : []);
  };
  useEffect(() => {
    load();
  }, [anno, azienda]);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      anno: anno > 0 ? anno : new Date().getFullYear(),
    });
    setShowForm(true);
  };
  const openNewFromExtract = (data: {
    fornitore?: string | null;
    categoria?: string | null;
    importo?: number | null;
    data?: string | null;
  }) => {
    setEditing(null);
    const today = new Date();
    let mese = today.getMonth() + 1;
    let annoEstr = anno;
    if (data.data) {
      const m = data.data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        mese = parseInt(m[2], 10);
        annoEstr = parseInt(m[3], 10);
      }
    }
    const categoria =
      data.categoria && CATEGORIE_SPESA.includes(data.categoria)
        ? data.categoria
        : CATEGORIE_SPESA[0];
    const match = data.fornitore
      ? fornitori.find(
          (f) => f.nome.toLowerCase() === data.fornitore!.toLowerCase(),
        )
      : null;
    setForm({
      ...emptyForm,
      fornitore: data.fornitore || "",
      fornitoreId: match?.id ?? "",
      categoria,
      mese,
      anno: annoEstr,
      importo: data.importo != null ? String(data.importo) : "",
    });
    setShowEstrai(false);
    setShowForm(true);
  };
  const openEdit = (s: Spesa) => {
    setEditing(s);
    setForm({
      azienda: s.azienda,
      aziendaNota: s.aziendaNota || "",
      fornitore: s.fornitore,
      fornitoreId: s.fornitoreId ?? "",
      categoria: s.categoria,
      descrizione: s.descrizione || "",
      note: s.note || "",
      mese: s.mese,
      anno: s.anno,
      importo: String(s.importo),
      ricevutaPath: s.ricevutaPath || "",
    });
    setShowForm(true);
  };

  const uploadRicevuta = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd }).then(
      (r) => r.json(),
    );
    setForm((f) => ({ ...f, ricevutaPath: res.path }));
    setUploading(false);
  };

  const save = async () => {
    if (!form.fornitore || !form.importo) return;
    const payload = {
      ...form,
      importo: parseFloat(form.importo),
      fornitoreId: form.fornitoreId || null,
      aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
    };
    if (editing)
      await fetch(`/api/spese/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    else
      await fetch("/api/spese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    setShowForm(false);
    load();
  };

  const del = async (id: number) => {
    if (!confirm("Eliminare questa spesa?")) return;
    await fetch(`/api/spese/${id}`, { method: "DELETE" });
    load();
  };

  const filtered = (spese ?? []).filter((s) => {
    if (filtroMese && s.mese !== filtroMese) return false;
    if (filtroCategoria && s.categoria !== filtroCategoria) return false;
    if (filtroFornitore && s.fornitore !== filtroFornitore) return false;
    if (!matchQ(q, s.fornitore, s.descrizione, s.categoria)) return false;
    return true;
  });

  const fornitoriUnici = Array.from(
    new Set((spese ?? []).map((s) => s.fornitore).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "it"));

  // Reset page se i filtri restringono il dataset
  useEffect(() => {
    setPage(1);
  }, [filtroMese, filtroCategoria, filtroFornitore, q, anno, azienda, pageSize]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = filtered.filter((s) => selectedIds.has(s.id));
  const exportList = tutte ? filtered : selected;
  const esciExport = () => {
    setExportMode(false);
    setTutte(false);
    setSelectedIds(new Set());
  };
  const toggleSel = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totale = filtered.reduce((s, e) => s + (e?.importo ?? 0), 0);
  const perCategoria: Record<string, number> = {};
  (spese ?? []).forEach((s) => {
    const cat = s?.categoria ?? "—";
    perCategoria[cat] = (perCategoria[cat] || 0) + (s?.importo ?? 0);
  });

  const annoLabel = anno > 0 ? String(anno) : "tutti gli anni";
  const annoFile = anno > 0 ? String(anno) : "tutti";
  const handleExcelExport = (rows: Spesa[] = filtered) =>
    exportExcel(speseToExcel(rows, MESI), `spese_${annoFile}`);
  const handlePDFExport = (rows: Spesa[] = filtered) =>
    exportPDF(
      `Spese ${annoLabel}`,
      ["Fornitore", "Categoria", "Mese", "Importo", "Descrizione"],
      rows.map((s) => [
        s.fornitore,
        s.categoria,
        MESI[s.mese - 1],
        fmt(s.importo),
        s.descrizione || "",
      ]),
      `spese_${annoFile}`,
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Spese</h1>
          <p className="page-sub">{filtered.length} voci</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar
            anno={anno}
            azienda={azienda}
            onAnno={setAnno}
            onAzienda={setAzienda}
            includeAllYears
            hideOptions={["Altro"]}
            showAzienda={false}
          />
          <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
          <ExportButton
            active={exportMode}
            onClick={() => (exportMode ? esciExport() : setExportMode(true))}
            title="Scegli le spese e scaricale in Excel o PDF"
          />
          <button
            onClick={() => setShowEstrai(true)}
            className="btn btn-secondary"
          >
            <Camera className="w-4 h-4 text-brand" /> Carica da foto/PDF
          </button>
          <button
            onClick={openNew}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> Nuova Spesa
          </button>
        </div>
      </div>

      {/* KPI */}
      <KpiGrid>
        <Kpi
          label="Totale anno"
          value={fmt((spese ?? []).reduce((s, e) => s + (e?.importo ?? 0), 0))}
          valueClass="text-bad"
        />
        {Object.entries(perCategoria)
          .slice(0, 3)
          .map(([cat, val]) => (
            <Kpi
              key={cat}
              label={cat}
              value={fmt(val)}
              sub={
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: CATEGORIE_COLORI_CHART[cat] || "#9ca3af" }} />
                  categoria
                </span>
              }
            />
          ))}
      </KpiGrid>

      {/* Filtri */}
      <div className="flex gap-3 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca fornitore, descrizione…" />
        <select
          value={filtroMese}
          onChange={(e) => setFiltroMese(parseInt(e.target.value))}
          className="sel"
        >
          <option value={0}>Tutti i mesi</option>
          {MESI.map((m, i) => (
            <option key={i} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="sel"
        >
          <option value="">Tutte le categorie</option>
          {CATEGORIE_SPESA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtroFornitore}
          onChange={(e) => setFiltroFornitore(e.target.value)}
          className="sel max-w-[160px]"
        >
          <option value="">Fornitore</option>
          {fornitoriUnici.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        {(filtroMese > 0 || filtroCategoria || filtroFornitore) && (
          <span className="text-sm text-gray-500 flex items-center">
            → {fmt(totale)}
          </span>
        )}
      </div>

      {/* Tabella spese */}
      {(
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                {exportMode && (
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.length === filtered.length}
                      onChange={() =>
                        setSelectedIds(
                          selected.length === filtered.length ? new Set() : new Set(filtered.map((s) => s.id)),
                        )
                      }
                      className="accent-pink-600"
                      aria-label="Seleziona tutte le spese filtrate"
                    />
                  </th>
                )}
                {[
                  "Fornitore",
                  "Descrizione",
                  "Categoria",
                  "Mese",
                  "Importo",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className={`${h ==="Importo" ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={exportMode ? 7 : 6}
                    className="text-center text-gray-400 py-12 text-sm"
                  >
                    Nessuna spesa trovata
                  </td>
                </tr>
              )}
              {paged.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => exportMode && toggleSel(s.id)}
                  className={cn(exportMode && "cursor-pointer", exportMode && selectedIds.has(s.id) && "bg-brand/10 hover:bg-brand/15")}
                >
                  {exportMode && (
                    <td className="w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSel(s.id)}
                        className="accent-pink-600"
                        aria-label={`Seleziona la spesa ${s.fornitore}`}
                      />
                    </td>
                  )}
                  <td className="font-medium text-gray-900">
                    {s.fornitore}
                  </td>
                  <td className="max-w-[220px] truncate">
                    {s.descrizione || s.note || "—"}
                  </td>
                  <td>
                    <span
                      className="tag"
                      style={{
                        background: CATEGORIE_COLORI[s.categoria] || "#EDEDED",
                        color: CATEGORIA_TEXT,
                      }}
                    >
                      {s.categoria}
                    </span>
                  </td>
                  <td>
                    {MESI[s.mese - 1]}
                  </td>
                  <td className="font-semibold text-gray-900 text-right">
                    {fmt(s.importo)}
                  </td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(s.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-bad hover:bg-bad/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > 0 && (
        <PageNav
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          labelSuffix="spese"
        />
      )}

      {exportMode && (
        <ExportBar
          selected={selected.length}
          total={filtered.length}
          unit="spese"
          importo={fmt(exportList.reduce((t, e) => t + (e?.importo ?? 0), 0))}
          tutte={tutte}
          onTutte={() => setTutte((t) => !t)}
          onClose={esciExport}
          groups={[
            {
              actions: [
                { label: "Excel", icon: <FileSpreadsheet className="text-ok" />, onClick: () => handleExcelExport(exportList) },
                { label: "PDF", icon: <Download />, primary: true, onClick: () => handlePDFExport(exportList) },
              ],
            },
          ]}
        />
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? "Modifica Spesa" : "Nuova Spesa"}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Fornitore *
                  </label>
                  <FornitoreAutocomplete
                    value={form.fornitore}
                    fornitoreId={form.fornitoreId}
                    fornitori={fornitori}
                    onChange={(nome, id) =>
                      setForm((f) => ({
                        ...f,
                        fornitore: nome,
                        fornitoreId: id ?? "",
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Categoria *
                  </label>
                  <select
                    value={form.categoria}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoria: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    {CATEGORIE_SPESA.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="Es. Abbonamento mensile"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Note interne
                </label>
                <textarea
                  value={form.note}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, note: e.target.value }))
                  }
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                  placeholder="Note private..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Ricevuta / Allegato
                </label>
                {form.ricevutaPath ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={form.ricevutaPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand hover:underline flex items-center gap-1"
                    >
                      <Paperclip className="w-3 h-3" /> Visualizza allegato
                    </a>
                    <button
                      onClick={() =>
                        setForm((f) => ({ ...f, ricevutaPath: "" }))
                      }
                      className="text-xs text-bad hover:underline"
                    >
                      Rimuovi
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 hover:border-brand/40 hover:text-brand transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />{" "}
                      {uploading ? "Caricamento..." : "Allega file"}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          uploadRicevuta(e.target.files[0]);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="btn btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                onClick={save}
                disabled={uploading}
                className="btn btn-primary flex-1 disabled:opacity-60"
              >
                {editing ? "Salva" : "Aggiungi"}
              </button>
            </div>
          </div>
        </div>
      )}

      <EstraiRicevutaModal
        open={showEstrai}
        onClose={() => setShowEstrai(false)}
        onExtracted={openNewFromExtract}
      />
    </div>
  );
}

// ─── Autocomplete Fornitore ─────────────────────────────────────────────────
// Single input: digiti liberamente; mentre scrivi vedi suggerimenti dall'anagrafica
// fornitori. Click su uno → popola fornitore + fornitoreId. Testo libero → fornitoreId
// resta vuoto.
function FornitoreAutocomplete({
  value,
  fornitoreId,
  fornitori,
  onChange,
}: {
  value: string;
  fornitoreId: string | number;
  fornitori: { id: number; nome: string }[];
  onChange: (nome: string, id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = (value ?? "").toLowerCase().trim();
  const matches = q
    ? fornitori.filter((f) => f.nome.toLowerCase().includes(q)).slice(0, 8)
    : fornitori.slice(0, 8);

  const selected = fornitoreId
    ? fornitori.find((f) => f.id === parseInt(String(fornitoreId)))
    : null;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Es. Google, Stipendio Leo, ..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {selected && (
        <p className="text-[10px] text-ok mt-0.5">
          ✓ collegato a anagrafica: {selected.nome}
        </p>
      )}
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          {matches.map((f) => {
            const isActive = selected?.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onChange(f.nome, f.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-brand/10 flex items-center justify-between ${isActive ? "bg-brand/10 text-brand" : "text-gray-700"}`}
              >
                <span>{f.nome}</span>
                {isActive && <span className="text-[10px]">✓</span>}
              </button>
            );
          })}
          {q && !matches.some((m) => m.nome.toLowerCase() === q) && (
            <div className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              Premi invio per usare &quot;{value}&quot; come testo libero
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Estrai Ricevuta Modal ──────────────────────────────────────────────────
// Drag&drop o click → upload a /api/extract-ricevuta → Claude estrae fornitore,
// categoria, importo, data → precompila form Nuova Spesa.
function EstraiRicevutaModal({
  open,
  onClose,
  onExtracted,
}: {
  open: boolean;
  onClose: () => void;
  onExtracted: (data: {
    fornitore?: string | null;
    categoria?: string | null;
    importo?: number | null;
    data?: string | null;
  }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  if (!open) return null;

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-ricevuta", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Errore server (${res.status})`);
        return;
      }
      onExtracted(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore upload");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Carica scontrino / fattura
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!loading && (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-brand/40 bg-brand/10"
                  : "border-gray-300 hover:border-brand/40 hover:bg-gray-50"
              }`}
            >
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Trascina foto o PDF qui
              </p>
              <p className="text-xs text-gray-500 mt-1">
                oppure clicca per selezionare (.jpg, .png, .pdf)
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
              />
            </div>
            <p className="text-xs text-gray-400 text-center">
              I dati estratti verranno precompilati nel form, poi potrai
              modificarli prima di salvare.
            </p>
            {error && (
              <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="py-8 text-center space-y-2">
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <Camera className="w-5 h-5 text-brand animate-pulse" />
              Estrazione dati in corso...
            </div>
            {fileName && <p className="text-xs text-gray-400">{fileName}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

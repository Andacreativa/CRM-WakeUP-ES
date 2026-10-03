"use client";

import { ExportBar, ExportButton } from "@/components/ExportBar";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { cn, matchQ } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Download,
  FileSpreadsheet,
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
import SpesaFormModal, { type SpesaBase, type SpesaIniziale } from "@/components/spese/SpesaFormModal";

type Spesa = SpesaBase;

export default function SpesePage() {
  const [spese, setSpese] = useState<Spesa[]>([]);
  const router = useRouter();
  // Form: null = chiuso, {} = nuova vuota, con dati = precompilata (ricevuta)
  const [nuova, setNuova] = useState<SpesaIniziale | null>(null);
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
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [showEstrai, setShowEstrai] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    if (anno > 0) params.set("anno", String(anno));
    if (azienda) params.set("azienda", azienda);
    const s = await (await fetch(`/api/spese?${params}`)).json();
    setSpese(Array.isArray(s) ? s : []);
  };
  useEffect(() => {
    load();
  }, [anno, azienda]);

  const openNewFromExtract = (data: {
    fornitore?: string | null;
    categoria?: string | null;
    importo?: number | null;
    data?: string | null;
  }) => {
    let mese: number | undefined;
    let annoEstr: number | undefined;
    if (data.data) {
      const m = data.data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        mese = parseInt(m[2], 10);
        annoEstr = parseInt(m[3], 10);
      }
    }
    setShowEstrai(false);
    setNuova({
      fornitore: data.fornitore || "",
      categoria: data.categoria && CATEGORIE_SPESA.includes(data.categoria) ? data.categoria : undefined,
      importo: data.importo ?? null,
      mese,
      anno: annoEstr,
    });
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
            onClick={() => setNuova({})}
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
                    colSpan={exportMode ? 6 : 5}
                    className="text-center text-gray-400 py-12 text-sm"
                  >
                    Nessuna spesa trovata
                  </td>
                </tr>
              )}
              {paged.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => (exportMode ? toggleSel(s.id) : router.push(`/finance/spese/${s.id}`))}
                  className={cn("cursor-pointer", exportMode && selectedIds.has(s.id) && "bg-brand/10 hover:bg-brand/15")}
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
                  <td>
                    <Link
                      href={`/finance/spese/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-brand hover:underline"
                    >
                      {s.fornitore}
                    </Link>
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

      {nuova && (
        <SpesaFormModal
          spesa={null}
          iniziale={nuova}
          annoDefault={anno}
          onClose={() => setNuova(null)}
          onSaved={() => {
            setNuova(null);
            load();
          }}
        />
      )}

      <EstraiRicevutaModal
        open={showEstrai}
        onClose={() => setShowEstrai(false)}
        onExtracted={openNewFromExtract}
      />
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

"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Download,
  FileSpreadsheet,
  Upload,
  Wallet,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fmt, MESI, AZIENDE, AZIENDA_COLORI } from "@/lib/constants";
import FiltriBar from "@/components/FiltriBar";
import { useAnno } from "@/lib/anno-context";
import {
  exportExcel,
  exportPDF,
  fattureToExcel,
  fattureToPDF,
} from "@/lib/export";
import AltriIngressi from "@/components/AltriIngressi";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import ImportFattureModal from "@/components/ImportFattureModal";

interface Cliente {
  id: number;
  nome: string;
  paese: string;
}
interface Acconto {
  id: number;
  importo: number;
  data: string;
  metodoPagamento: string | null;
  note: string | null;
}
interface Fattura {
  id: number;
  numero: string | null;
  data: string | null;
  clienteId: number | null;
  cliente: Cliente | null;
  azienda: string;
  aziendaNota: string | null;
  mese: number;
  anno: number;
  importo: number;
  tipoIva: string;
  iva: number;
  pagato: boolean;
  metodo: string | null;
  commerciale: string | null;
  scadenza: string | null;
  acconti: Acconto[];
}

const totalePagato = (f: Fattura) =>
  (f.acconti ?? []).reduce((s, a) => s + a.importo, 0);
const residuo = (f: Fattura) => Math.max(0, f.importo - totalePagato(f));
const statoCalcolato = (f: Fattura): "pagato" | "acconto" | "attesa" => {
  if (f.pagato || totalePagato(f) >= f.importo) return "pagato";
  if (totalePagato(f) > 0) return "acconto";
  return "attesa";
};

type TipoIva = "igic_exenta" | "igic7";
const TIPO_IVA_OPTIONS: { value: TipoIva; label: string }[] = [
  { value: "igic_exenta", label: "IGIC Exenta" },
  { value: "igic7", label: "IGIC 7%" },
];

const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

const numeroKey = (n: string | null): number => {
  if (!n) return -Infinity;
  const digits = n.match(/\d+/g)?.join("") ?? "";
  return digits ? parseInt(digits, 10) : -Infinity;
};

const nextNumero = (
  fatture: { numero: string | null }[],
  year: number,
): string => {
  let maxCounter = 0;
  for (const f of fatture) {
    if (!f.numero) continue;
    const m = f.numero.match(/^F(\d{4})(\d+)$/);
    if (!m || parseInt(m[1], 10) !== year) continue;
    const counter = parseInt(m[2], 10);
    if (counter > maxCounter) maxCounter = counter;
  }
  return `F${year}${maxCounter + 1}`;
};

const emptyForm = {
  numero: "",
  clienteId: "",
  azienda: AZIENDE[0],
  aziendaNota: "",
  commerciale: "",
  mese: new Date().getMonth() + 1,
  anno: 2025,
  importo: "",
  tipoIva: "igic_exenta" as TipoIva,
  pagato: false,
  scadenza: "",
};

export default function FatturePage() {
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fattura | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filtroMese, setFiltroMese] = useState(0);
  const [filtroClienteId, setFiltroClienteId] = useState<number>(0);
  const [filtroPagato, setFiltroPagato] = useState<
    "tutti" | "pagato" | "attesa"
  >("tutti");
  const { anno, setAnno } = useAnno();
  const [azienda, setAzienda] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [accontoTarget, setAccontoTarget] = useState<Fattura | null>(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (anno > 0) params.set("anno", String(anno));
    if (azienda) params.set("azienda", azienda);
    const [f, c] = await Promise.all([
      (await fetch(`/api/fatture?${params}`)).json() as Promise<any>,
      (await fetch("/api/clienti")).json() as Promise<any>,
    ]);
    setFatture(Array.isArray(f) ? f : []);
    setClienti(Array.isArray(c) ? c : []);
  };
  useEffect(() => {
    load();
  }, [anno, azienda]);

  const openNew = () => {
    setEditing(null);
    const annoNuova = anno > 0 ? anno : new Date().getFullYear();
    setForm({
      ...emptyForm,
      anno: annoNuova,
      numero: nextNumero(fatture, annoNuova),
    });
    setShowForm(true);
  };
  const openEdit = (f: Fattura) => {
    setEditing(f);
    setForm({
      numero: f.numero || "",
      clienteId: f.clienteId != null ? String(f.clienteId) : "",
      azienda: f.azienda,
      aziendaNota: f.aziendaNota || "",
      commerciale: f.commerciale || "",
      mese: f.mese,
      anno: f.anno,
      importo: String(f.importo),
      tipoIva: (f.tipoIva === "igic7" ? "igic7" : "igic_exenta") as TipoIva,
      pagato: f.pagato,
      scadenza: f.scadenza ? f.scadenza.slice(0, 10) : "",
    });
    setShowForm(true);
  };
  const save = async () => {
    if (!form.importo) return;
    const ivaPct = form.tipoIva === "igic7" ? 7 : 0;
    const payload = {
      ...form,
      clienteId: form.clienteId ? parseInt(form.clienteId) : null,
      importo: parseFloat(form.importo),
      iva: ivaPct,
      scadenza: form.scadenza || null,
      aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
    };
    if (editing)
      await fetch(`/api/fatture/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    else
      await fetch("/api/fatture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    setShowForm(false);
    load();
  };
  const togglePagato = async (f: Fattura) => {
    await fetch(`/api/fatture/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagato: !f.pagato }),
    });
    load();
  };
  const del = async (id: number) => {
    if (!confirm("Eliminare questa fattura?")) return;
    await fetch(`/api/fatture/${id}`, { method: "DELETE" });
    load();
  };

  const filtered = (fatture ?? [])
    .filter((f) => {
      if (filtroMese && f.mese !== filtroMese) return false;
      if (filtroClienteId && f.clienteId !== filtroClienteId) return false;
      const stato = statoCalcolato(f);
      if (filtroPagato === "pagato" && stato !== "pagato") return false;
      if (
        filtroPagato === "attesa" &&
        stato !== "attesa" &&
        stato !== "acconto"
      )
        return false;
      return true;
    })
    .sort((a, b) => numeroKey(b.numero) - numeroKey(a.numero));

  const clienteFiltrato = filtroClienteId
    ? (clienti.find((c) => c.id === filtroClienteId) ?? null)
    : null;

  // Reset page se i filtri restringono il dataset
  useEffect(() => {
    setPage(1);
  }, [filtroMese, filtroClienteId, filtroPagato, anno, azienda, pageSize]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totale = filtered.reduce((s, f) => s + (f?.importo ?? 0), 0);
  const pagate = filtered.reduce(
    (s, f) =>
      s +
      (statoCalcolato(f) === "pagato" ? (f?.importo ?? 0) : totalePagato(f)),
    0,
  );
  const daIncassare = filtered.reduce(
    (s, f) => s + (statoCalcolato(f) === "pagato" ? 0 : residuo(f)),
    0,
  );

  const oggi = new Date();
  const isScaduta = (f: Fattura) =>
    !f.pagato && f.scadenza && new Date(f.scadenza) < oggi;
  const isInScadenza = (f: Fattura) => {
    if (!f.scadenza || f.pagato) return false;
    const d = new Date(f.scadenza);
    const giorni = Math.ceil((d.getTime() - oggi.getTime()) / 86400000);
    return giorni >= 0 && giorni <= 7;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fatture</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {filtered.length} fatture
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar
            anno={anno}
            azienda={azienda}
            onAnno={setAnno}
            onAzienda={setAzienda}
            hideOptions={["Altro"]}
            includeAllYears
          />
          <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
          <button
            onClick={() => {
              const annoLabel = anno > 0 ? String(anno) : "tutti";
              const slug = clienteFiltrato
                ? `_${clienteFiltrato.nome.replace(/\s+/g, "")}`
                : "";
              exportExcel(
                fattureToExcel(filtered, MESI),
                `fatture_${annoLabel}${slug}`,
              );
            }}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
          <button
            onClick={() => {
              const aziendaLabel = azienda || "Tutte";
              const annoStr = anno > 0 ? String(anno) : "tutti gli anni";
              const annoFile = anno > 0 ? String(anno) : "tutti";
              const titolo = clienteFiltrato
                ? `Fatture ${annoStr} — ${aziendaLabel} · ${clienteFiltrato.nome}`
                : `Fatture ${annoStr} — ${aziendaLabel}`;
              const slug = clienteFiltrato
                ? `_${clienteFiltrato.nome.replace(/\s+/g, "")}`
                : "";
              const { cols, rows, title } = fattureToPDF(filtered, MESI, titolo);
              const totImporto = filtered.reduce(
                (s, f) => s + (f?.importo ?? 0),
                0,
              );
              const totIncassato = filtered
                .filter((f) => f?.pagato)
                .reduce((s, f) => s + (f?.importo ?? 0), 0);
              const totNonPagato = totImporto - totIncassato;
              const perMese = Array.from({ length: 12 }, (_, i) =>
                filtered
                  .filter((f) => f.mese === i + 1)
                  .reduce((s, f) => s + (f?.importo ?? 0), 0),
              );
              exportPDF(title, cols, rows, `fatture_${annoFile}${slug}`, {
                extraTables: [
                  {
                    columns: MESI,
                    rows: [perMese.map((v) => fmt(v))],
                  },
                ],
                footerCells: [
                  { label: "Totale fatture", value: String(rows.length) },
                  { label: "Totale importo", value: fmt(totImporto) },
                  {
                    label: "Totale incassato",
                    value: fmt(totIncassato),
                    color: [16, 185, 129],
                  },
                  {
                    label: "Totale non pagato",
                    value: fmt(totNonPagato),
                    color: [245, 158, 11],
                  },
                ],
              });
            }}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4 text-pink-600" /> Importa Fatture
          </button>
          <button
            onClick={openNew}
            className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" /> Nuova Fattura
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Totale", val: fmt(totale), color: "text-gray-900" },
          { label: "Incassato", val: fmt(pagate), color: "text-emerald-600" },
          {
            label: "Da Incassare",
            val: fmt(daIncassare),
            color: "text-amber-600",
          },
        ].map((k) => (
          <div key={k.label} className="glass-card rounded-2xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              {k.label}
            </p>
            <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={filtroMese}
          onChange={(e) => setFiltroMese(parseInt(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          <option value={0}>Tutti i mesi</option>
          {MESI.map((m, i) => (
            <option key={i} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <select
            value={filtroClienteId}
            onChange={(e) => setFiltroClienteId(parseInt(e.target.value) || 0)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-300 min-w-[180px]"
          >
            <option value={0}>Tutti i clienti</option>
            {[...clienti]
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
          {filtroClienteId > 0 && (
            <button
              onClick={() => setFiltroClienteId(0)}
              title="Rimuovi filtro cliente"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["tutti", "pagato", "attesa"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFiltroPagato(v)}
              className="text-sm px-3 py-1.5 rounded-md font-medium transition-colors"
              style={
                filtroPagato === v
                  ? { background: "#e8308a", color: "#fff" }
                  : { color: "#64748b" }
              }
            >
              {v === "tutti"
                ? "Tutti"
                : v === "pagato"
                  ? "Pagati"
                  : "In Attesa"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabella fatture */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {[
                "Numero",
                "Cliente",
                "Azienda",
                "Mese",
                "Scadenza",
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
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessuna fattura trovata
                </td>
              </tr>
            )}
            {paged.map((f, i) => (
              <tr
                key={f.id}
                className={`border-b border-gray-50 transition-colors ${i % 2 === 1 ? "bg-[#F9F9F9]" : "bg-white"}`}
              >
                <td className="px-4 py-3 text-sm font-mono font-medium text-gray-700 whitespace-nowrap">
                  {f.numero ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {f.cliente?.nome ?? "—"}
                  <span className="ml-1 text-xs text-gray-400">
                    {f.cliente?.paese ?? ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      background:
                        f.azienda === "Spagna"
                          ? "#fef2f2"
                          : f.azienda === "Italia"
                            ? "#f0fdf4"
                            : "#f8fafc",
                      color:
                        f.azienda === "Spagna"
                          ? "#ef4444"
                          : f.azienda === "Italia"
                            ? "#22c55e"
                            : "#64748b",
                    }}
                  >
                    {f.azienda === "Altro" && f.aziendaNota
                      ? f.aziendaNota
                      : f.azienda}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {MESI[f.mese - 1]}
                </td>
                <td className="px-4 py-3 text-sm">
                  {f.scadenza ? (
                    <span
                      className={`text-xs font-medium ${isScaduta(f) ? "text-red-600" : isInScadenza(f) ? "text-amber-600" : "text-gray-500"}`}
                    >
                      {new Date(f.scadenza).toLocaleDateString("it-IT")}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                  {fmt(f.importo)}
                </td>
                <td className="px-4 py-3 text-center">
                  {(() => {
                    const stato = statoCalcolato(f);
                    if (stato === "pagato") {
                      return (
                        <button
                          onClick={() => togglePagato(f)}
                          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        >
                          <Check className="w-3 h-3" /> Pagato
                        </button>
                      );
                    }
                    if (stato === "acconto") {
                      return (
                        <span
                          title={`${fmt(totalePagato(f))} ricevuti / ${fmt(residuo(f))} residuo`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full bg-orange-100 text-orange-700"
                        >
                          <Wallet className="w-3 h-3" /> Acconto
                        </span>
                      );
                    }
                    return (
                      <button
                        onClick={() => togglePagato(f)}
                        className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200"
                      >
                        <X className="w-3 h-3" /> In Attesa
                      </button>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    {statoCalcolato(f) !== "pagato" && (
                      <button
                        onClick={() => setAccontoTarget(f)}
                        title="Registra acconto"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(f)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => del(f.id)}
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
      </div>
      {filtered.length > 0 && (
        <PageNav
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          labelSuffix="fatture"
        />
      )}

      {/* Tabella Altri Ingressi — stesso formato delle fatture */}
      <AltriIngressi anno={anno} azienda={azienda} onChanged={load} />

      {/* Grafico Spagna vs Italia (solo pagate) */}
      <div className="glass-card rounded-2xl p-5">
        {(() => {
          const pagateAll = (fatture ?? []).filter((f) => f?.pagato);
          const totSpagna = pagateAll
            .filter((f) => f.azienda === "Spagna")
            .reduce((s: number, f) => s + (f?.importo ?? 0), 0);
          const totItalia = pagateAll
            .filter((f) => f.azienda === "Italia")
            .reduce((s: number, f) => s + (f?.importo ?? 0), 0);
          const totale = totSpagna + totItalia;
          if (totale === 0) {
            return (
              <p className="text-xs text-gray-400 text-center py-8">
                Nessuna fattura pagata
              </p>
            );
          }
          const pctSpagna = (totSpagna / totale) * 100;
          const pctItalia = (totItalia / totale) * 100;
          const data = [
            {
              name: "Spagna",
              value: totSpagna,
              color: "#ef4444",
              pct: pctSpagna,
            },
            {
              name: "Italia",
              value: totItalia,
              color: "#22c55e",
              pct: pctItalia,
            },
          ];
          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              <div className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart
                    data={data}
                    layout="vertical"
                    margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{
                        fontSize: 12,
                        fill: "#475569",
                        fontWeight: 600,
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <Tooltip
                      formatter={(v) => fmt(Number(v))}
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                      {data.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm">
                  <span className="flex items-center gap-2 font-semibold text-gray-700">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ background: "#ef4444" }}
                    />
                    Spagna
                  </span>
                  <span className="font-semibold text-gray-900 text-right">
                    {fmt(totSpagna)}
                  </span>
                  <span className="text-gray-500 tabular-nums w-14 text-right">
                    {pctSpagna.toFixed(1)}%
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm">
                  <span className="flex items-center gap-2 font-semibold text-gray-700">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ background: "#22c55e" }}
                    />
                    Italia
                  </span>
                  <span className="font-semibold text-gray-900 text-right">
                    {fmt(totItalia)}
                  </span>
                  <span className="text-gray-500 tabular-nums w-14 text-right">
                    {pctItalia.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? "Modifica Fattura" : "Nuova Fattura"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Numero Fattura
                </label>
                <input
                  type="text"
                  value={form.numero}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, numero: e.target.value }))
                  }
                  placeholder="Es. F202641"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
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
                    placeholder="Specifica provenienza..."
                    className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Cliente *
                </label>
                <select
                  value={form.clienteId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clienteId: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option value="">Seleziona cliente...</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
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
              {/* Tipo Imposta */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Tipo Imposta
                </label>
                <div className="flex gap-2">
                  {TIPO_IVA_OPTIONS.map((o) => {
                    const active = form.tipoIva === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() =>
                          setForm((f) => ({ ...f, tipoIva: o.value }))
                        }
                        className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                        style={
                          active
                            ? {
                                background: "#fce7f3",
                                color: "#be185d",
                                borderColor: "#f9a8d4",
                              }
                            : {
                                background: "#fff",
                                borderColor: "#e2e8f0",
                                color: "#94a3b8",
                              }
                        }
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Riepilogo */}
              {(() => {
                const sub = parseFloat(form.importo) || 0;
                const pct = form.tipoIva === "igic7" ? 7 : 0;
                const imposta = (sub * pct) / 100;
                const tot = sub + imposta;
                const label =
                  form.tipoIva === "igic7" ? "IGIC 7%" : "IGIC Exenta";
                return (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotale</span>
                      <span className="font-medium">{fmt(sub)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>{label}</span>
                      <span className="font-medium">{fmt(imposta)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                      <span>TOTALE</span>
                      <span>{fmt(tot)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 pt-1">
                      <span>Guadagno netto</span>
                      <span className="font-semibold">{fmt(sub)}</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Scadenza
                </label>
                <input
                  type="date"
                  value={form.scadenza}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, scadenza: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Commerciale
                </label>
                <input
                  type="text"
                  value={form.commerciale}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, commerciale: e.target.value }))
                  }
                  placeholder="Nome o sigla commerciale di riferimento"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pagato}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pagato: e.target.checked }))
                  }
                  className="w-4 h-4"
                  style={{ accentColor: "#e8308a" }}
                />
                <span className="text-sm text-gray-700">Già pagata</span>
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

      <ImportFattureModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={load}
      />

      {accontoTarget && (
        <AccontoModal
          fattura={accontoTarget}
          onClose={() => setAccontoTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function AccontoModal({
  fattura,
  onClose,
  onSaved,
}: {
  fattura: Fattura;
  onClose: () => void;
  onSaved: () => void;
}) {
  const giaPagato = totalePagato(fattura);
  const residuoCorrente = residuo(fattura);
  const [importo, setImporto] = useState(
    residuoCorrente > 0 ? String(residuoCorrente) : "",
  );
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const importoNum = parseFloat(importo);
    if (!importoNum || importoNum <= 0) return;
    setSaving(true);
    const res = await fetch("/api/acconti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fatturaId: fattura.id,
        importo: importoNum,
        data,
        metodoPagamento: metodoPagamento || null,
        note: note || null,
      }),
    });
    setSaving(false);
    if (!res.ok) return;
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Registra Acconto</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Fattura {fattura.numero ?? "—"} · {fattura.cliente?.nome ?? "—"}
          </p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between text-gray-700">
            <span>Importo fattura</span>
            <span className="font-semibold">{fmt(fattura.importo)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Già ricevuto</span>
            <span className="font-semibold text-emerald-700">
              {fmt(giaPagato)}
            </span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 border-t border-orange-200 pt-1">
            <span>Residuo da incassare</span>
            <span className="text-orange-700">{fmt(residuoCorrente)}</span>
          </div>
        </div>

        {fattura.acconti && fattura.acconti.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-600">
              Acconti registrati
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {fattura.acconti.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1"
                >
                  <span className="text-gray-700">
                    {new Date(a.data).toLocaleDateString("it-IT")}
                    {a.metodoPagamento ? ` · ${a.metodoPagamento}` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {fmt(a.importo)}
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm("Eliminare questo acconto?")) return;
                        await fetch(`/api/acconti/${a.id}`, {
                          method: "DELETE",
                        });
                        onSaved();
                        onClose();
                      }}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Importo acconto (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Data *
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Metodo Pagamento
            </label>
            <input
              type="text"
              value={metodoPagamento}
              onChange={(e) => setMetodoPagamento(e.target.value)}
              placeholder="Bonifico, Contanti, ..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="glass-btn-primary flex-1 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Registra"}
          </button>
        </div>
      </div>
    </div>
  );
}

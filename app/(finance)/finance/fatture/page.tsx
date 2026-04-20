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

interface Cliente {
  id: number;
  nome: string;
  paese: string;
}
interface Fattura {
  id: number;
  numero: string | null;
  data: string | null;
  clienteId: number | null;
  cliente: Cliente | null;
  azienda: string;
  aziendaNota: string | null;
  descrizione: string | null;
  mese: number;
  anno: number;
  importo: number;
  tipoIva: string;
  iva: number;
  pagato: boolean;
  metodo: string | null;
  commerciale: string | null;
  scadenza: string | null;
}

type TipoIva = "igic_exenta" | "igic7";
const TIPO_IVA_OPTIONS: { value: TipoIva; label: string }[] = [
  { value: "igic_exenta", label: "IGIC Exente" },
  { value: "igic7", label: "IGIC 7%" },
];

const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
const emptyForm = {
  clienteId: "",
  azienda: AZIENDE[0],
  aziendaNota: "",
  descrizione: "",
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
  const [filtroPagato, setFiltroPagato] = useState<
    "tutti" | "pagato" | "attesa"
  >("tutti");
  const { anno, setAnno } = useAnno();
  const [azienda, setAzienda] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const load = async () => {
    const params = new URLSearchParams({ anno: String(anno) });
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
    setForm({ ...emptyForm, anno });
    setShowForm(true);
  };
  const openEdit = (f: Fattura) => {
    setEditing(f);
    setForm({
      clienteId: f.clienteId != null ? String(f.clienteId) : "",
      azienda: f.azienda,
      aziendaNota: f.aziendaNota || "",
      descrizione: f.descrizione || "",
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

  const filtered = (fatture ?? []).filter((f) => {
    if (filtroMese && f.mese !== filtroMese) return false;
    if (filtroPagato === "pagato" && !f.pagato) return false;
    if (filtroPagato === "attesa" && f.pagato) return false;
    return true;
  });

  // Reset page se i filtri restringono il dataset
  useEffect(() => {
    setPage(1);
  }, [filtroMese, filtroPagato, anno, azienda, pageSize]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totale = filtered.reduce((s, f) => s + (f?.importo ?? 0), 0);
  const pagate = filtered
    .filter((f) => f?.pagato)
    .reduce((s, f) => s + (f?.importo ?? 0), 0);

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
          />
          <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
          <button
            onClick={() =>
              exportExcel(fattureToExcel(filtered, MESI), `fatture_${anno}`)
            }
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
          <button
            onClick={() => {
              const { cols, rows, title } = fattureToPDF(
                filtered,
                MESI,
                `Fatture ${anno}`,
              );
              exportPDF(title, cols, rows, `fatture_${anno}`);
            }}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4 text-red-500" /> PDF
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
            val: fmt(totale - pagate),
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
      <div className="flex gap-3 flex-wrap">
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
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center text-gray-400 py-12 text-sm"
                  >
                    Nessuna fattura trovata
                  </td>
                </tr>
              )}
              {paged.map((f, i) => (
                <tr
                  key={f.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isScaduta(f) ? "bg-red-50" : isInScadenza(f) ? "bg-amber-50" : i % 2 === 1 ? "bg-[#F0F0F0]" : ""}`}
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
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {f.descrizione || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    {fmt(f.importo)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => togglePagato(f)}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors ${f.pagato ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`}
                    >
                      {f.pagato ? (
                        <>
                          <Check className="w-3 h-3" /> Pagato
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3" /> In Attesa
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
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
                          // eslint-disable-next-line @typescript-eslint/no-deprecated
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
                  Azienda *
                </label>
                <div className="flex gap-2">
                  {AZIENDE.map((a) => {
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
                  form.tipoIva === "igic7" ? "IGIC 7%" : "IGIC Exente";
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

              <div className="grid grid-cols-2 gap-3">
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
                    placeholder="Es. Consulenza"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
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
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Commerciale
                  </label>
                  <input
                    type="text"
                    value={form.commerciale}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commerciale: e.target.value }))
                    }
                    placeholder='Opzionale. Scrivi "Finn" per attivare lo split automatico 15%/85%'
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
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
    </div>
  );
}

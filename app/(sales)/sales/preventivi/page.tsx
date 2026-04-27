"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Download, X, Check } from "lucide-react";
import { fmt } from "@/lib/constants";
import { exportPreventivoPDF, VocePreventivoData } from "@/lib/export";

interface Preventivo {
  id: number;
  numero: string;
  nomeCliente: string;
  emailCliente: string | null;
  aziendaCliente: string | null;
  azienda: string;
  oggetto: string;
  voci: string;
  iva: number;
  subtotale: number;
  totale: number;
  feeCommerciale: number;
  status: string;
  note: string | null;
  condizioni: string | null;
  dataScadenza: string | null;
  createdAt: string;
}

interface Contatto {
  id: number;
  nome: string;
  email: string | null;
}

interface Voce {
  id: string;
  servizio: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
}

const STATUS_OPTIONS = [
  {
    value: "attesa",
    label: "In Attesa",
    bg: "#fef9c3",
    text: "#a16207",
    border: "#fde047",
  },
  {
    value: "accettato",
    label: "Accettato",
    bg: "#dcfce7",
    text: "#166534",
    border: "#86efac",
  },
  {
    value: "rifiutato",
    label: "Rifiutato",
    bg: "#fee2e2",
    text: "#991b1b",
    border: "#fca5a5",
  },
];

const statusStyle = (s: string) =>
  STATUS_OPTIONS.find((o) => o.value === s) ?? STATUS_OPTIONS[0];

const BRAND = "#db291b";

const DEFAULT_CONDIZIONI = `Saldo fattura entro 30 giorni dalla data di emissione.
Inclusa 1 revisione per asset prodotto.
Revisioni aggiuntive a € 80/ora.
Validità offerta: 30 giorni dalla data di emissione.
Lingua contratto: Italiano.`;

const newVoce = (): Voce => ({
  id: Math.random().toString(36).slice(2),
  servizio: "",
  descrizione: "",
  quantita: 1,
  prezzoUnitario: 0,
});

const emptyForm = {
  oggetto: "",
  nomeCliente: "",
  emailCliente: "",
  aziendaCliente: "",
  azienda: "Anda",
  iva: 0,
  feeCommerciale: 0,
  status: "attesa",
  note: "",
  condizioni: DEFAULT_CONDIZIONI,
  dataScadenza: "",
};

export default function PreventiviPage() {
  const [preventivi, setPreventivi] = useState<Preventivo[]>([]);
  const [contatti, setContatti] = useState<Contatto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Preventivo | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [voci, setVoci] = useState<Voce[]>([newVoce()]);
  const [filtroStatus, setFiltroStatus] = useState("tutti");

  const load = async () => {
    const [p, c]: any[] = await Promise.all([
      fetch("/api/preventivi").then((r) => r.json()),
      fetch("/api/contatti").then((r) => r.json()),
    ]);
    setPreventivi(Array.isArray(p) ? p : []);
    setContatti(Array.isArray(c) ? c : []);
  };
  useEffect(() => {
    load();
  }, []);

  const subtotale = (voci ?? []).reduce(
    (s, v) => s + (Number(v?.quantita) || 0) * (Number(v?.prezzoUnitario) || 0),
    0,
  );
  const ivaAmt = (subtotale * (Number(form.iva) || 0)) / 100;
  const totale = subtotale + ivaAmt;

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setVoci([newVoce()]);
    setShowForm(true);
  };

  const openEdit = (p: Preventivo) => {
    setEditing(p);
    setForm({
      oggetto: p.oggetto,
      nomeCliente: p.nomeCliente,
      emailCliente: p.emailCliente || "",
      aziendaCliente: p.aziendaCliente || "",
      azienda: p.azienda,
      iva: p.iva,
      feeCommerciale: p.feeCommerciale ?? 0,
      status: p.status,
      note: p.note || "",
      condizioni: p.condizioni || DEFAULT_CONDIZIONI,
      dataScadenza: p.dataScadenza ? p.dataScadenza.slice(0, 10) : "",
    });
    try {
      const parsed: VocePreventivoData[] = JSON.parse(p.voci);
      setVoci(
        parsed.map((v) => ({ ...v, id: Math.random().toString(36).slice(2) })),
      );
    } catch {
      setVoci([newVoce()]);
    }
    setShowForm(true);
  };

  const applyContatto = (id: string) => {
    const c = (contatti ?? []).find((x) => x.id === parseInt(id));
    if (c)
      setForm((f) => ({
        ...f,
        nomeCliente: c.nome ?? "",
        emailCliente: c.email ?? "",
      }));
  };

  const save = async () => {
    if (!form.oggetto || !form.nomeCliente || voci.length === 0) return;
    const payload = {
      ...form,
      iva: Number(form.iva),
      voci: voci.map(({ servizio, descrizione, quantita, prezzoUnitario }) => ({
        servizio,
        descrizione,
        quantita: Number(quantita),
        prezzoUnitario: Number(prezzoUnitario),
      })),
      dataScadenza: form.dataScadenza || null,
    };
    if (editing) {
      await fetch(`/api/preventivi/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/preventivi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    load();
  };

  const del = async (id: number) => {
    if (!confirm("Eliminare questo preventivo?")) return;
    await fetch(`/api/preventivi/${id}`, { method: "DELETE" });
    load();
  };

  const quickStatus = async (p: Preventivo, status: string) => {
    await fetch(`/api/preventivi/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const downloadPDF = (p: Preventivo) => {
    exportPreventivoPDF({
      numero: p.numero,
      nomeCliente: p.nomeCliente,
      emailCliente: p.emailCliente,
      aziendaCliente: p.aziendaCliente,
      azienda: p.azienda,
      oggetto: p.oggetto,
      voci: p.voci,
      iva: p.iva,
      subtotale: p.subtotale,
      totale: p.totale,
      condizioni: p.condizioni,
      note: p.note,
      createdAt: p.createdAt,
    });
  };

  const filtered = (preventivi ?? []).filter(
    (p) => filtroStatus === "tutti" || p.status === filtroStatus,
  );

  const updateVoce = (
    id: string,
    field: keyof Omit<Voce, "id">,
    val: string | number,
  ) => {
    setVoci((vs) => vs.map((v) => (v.id === id ? { ...v, [field]: val } : v)));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pl-10 md:pl-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Preventivi</h1>
          <p className="text-gray-500 text-sm mt-1">
            {preventivi.length} preventivi totali
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all"
          style={{ background: BRAND }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.opacity = "0.85")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.opacity = "1")
          }
        >
          <Plus className="w-4 h-4" /> Crea preventivo
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[{ value: "tutti", label: "Tutti" }, ...STATUS_OPTIONS].map((o) => (
          <button
            key={o.value}
            onClick={() => setFiltroStatus(o.value)}
            className="text-sm px-3 py-1.5 rounded-md font-medium transition-colors"
            style={
              filtroStatus === o.value
                ? { background: BRAND, color: "#fff" }
                : { color: "#64748b" }
            }
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: "Totale valore",
            val: fmt(
              (preventivi ?? []).reduce((s, p) => s + (p?.totale ?? 0), 0),
            ),
            color: "text-gray-900",
          },
          {
            label: "Accettati",
            val: fmt(
              (preventivi ?? [])
                .filter((p) => p?.status === "accettato")
                .reduce((s, p) => s + (p?.totale ?? 0), 0),
            ),
            color: "text-emerald-600",
          },
          {
            label: "In Attesa",
            val: fmt(
              (preventivi ?? [])
                .filter((p) => p?.status === "attesa")
                .reduce((s, p) => s + (p?.totale ?? 0), 0),
            ),
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

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {[
                "Numero",
                "Cliente",
                "Oggetto",
                "Data",
                "Scadenza",
                "Totale",
                "Status",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 ${h === "Totale" ? "text-right" : h === "Status" ? "text-center" : "text-left"}`}
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
                  Nessun preventivo trovato
                </td>
              </tr>
            )}
            {filtered.map((p, i) => {
              const st = statusStyle(p.status);
              const isScaduto =
                !["accettato"].includes(p.status) &&
                p.dataScadenza &&
                new Date(p.dataScadenza) < new Date();
              return (
                <tr
                  key={p.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isScaduto ? "bg-red-50" : i % 2 === 1 ? "bg-[#F0F0F0]" : ""}`}
                >
                  <td className="px-4 py-3 text-sm font-mono font-medium text-gray-700">
                    {p.numero ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {p.nomeCliente ?? "—"}
                    </p>
                    {p.aziendaCliente && (
                      <p className="text-xs text-gray-400">
                        {p.aziendaCliente}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate">
                    {p.oggetto ?? ""}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(p.createdAt).toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {p.dataScadenza ? (
                      <span
                        className={`text-xs font-medium ${isScaduto ? "text-red-600" : "text-gray-500"}`}
                      >
                        {new Date(p.dataScadenza).toLocaleDateString("it-IT")}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    {fmt(p.totale ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => {
                        const next =
                          p.status === "attesa"
                            ? "accettato"
                            : p.status === "accettato"
                              ? "rifiutato"
                              : "attesa";
                        quickStatus(p, next);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full border transition-colors"
                      style={{
                        background: st.bg,
                        color: st.text,
                        borderColor: st.border,
                      }}
                    >
                      {p.status === "accettato" && (
                        <Check className="w-3 h-3" />
                      )}
                      {p.status === "rifiutato" && <X className="w-3 h-3" />}
                      {st.label}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => downloadPDF(p)}
                        title="Scarica PDF"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(p.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
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

      {/* FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-start justify-center z-50 p-0 md:p-4 overflow-y-auto">
          <div className="glass-modal rounded-t-2xl md:rounded-2xl w-full max-w-3xl md:my-4 p-4 md:p-6 space-y-4 md:space-y-5 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? `Modifica ${editing.numero}` : "Nuovo Preventivo"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Row 1: Oggetto + Azienda */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Oggetto / Titolo *
                </label>
                <input
                  type="text"
                  value={form.oggetto}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, oggetto: e.target.value }))
                  }
                  placeholder="Es. Servizi di Marketing Digitale & Social Media"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Azienda *
                </label>
                <div className="flex gap-2">
                  {[
                    { val: "Anda", color: "#E91E8C", iva: 0 },
                    { val: "Wake Up", color: "#DB291B", iva: 22 },
                  ].map(({ val, color, iva }) => {
                    const active = form.azienda === val;
                    return (
                      <button
                        key={val}
                        onClick={() =>
                          setForm((f) => ({ ...f, azienda: val, iva }))
                        }
                        className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                        style={
                          active
                            ? {
                                background: color,
                                color: "#fff",
                                borderColor: color,
                              }
                            : {
                                background: "#fff",
                                borderColor: "#e2e8f0",
                                color: "#94a3b8",
                              }
                        }
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Status
                </label>
                <div className="flex gap-2">
                  {STATUS_OPTIONS.map((o) => {
                    const active = form.status === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() =>
                          setForm((f) => ({ ...f, status: o.value }))
                        }
                        className="flex-1 text-xs py-2 rounded-lg border font-semibold transition-all"
                        style={
                          active
                            ? {
                                background: o.bg,
                                color: o.text,
                                borderColor: o.border,
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
            </div>

            {/* Row 2: Cliente */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Cliente
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <select
                    onChange={(e) => applyContatto(e.target.value)}
                    defaultValue=""
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 text-gray-500"
                  >
                    <option value="">Seleziona da contatti...</option>
                    {(contatti ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome ?? "—"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    value={form.nomeCliente}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nomeCliente: e.target.value }))
                    }
                    placeholder="Nome cliente *"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={form.aziendaCliente}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, aziendaCliente: e.target.value }))
                    }
                    placeholder="Ragione sociale"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="email"
                    value={form.emailCliente}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, emailCliente: e.target.value }))
                    }
                    placeholder="Email cliente"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={form.dataScadenza}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dataScadenza: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 text-gray-700"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Voci */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">
                  Voci / Servizi *
                </label>
                <button
                  onClick={() => setVoci((vs) => [...vs, newVoce()])}
                  className="text-xs font-medium px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Aggiungi voce
                </button>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-left w-[32%]">
                        Servizio
                      </th>
                      <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-left w-[30%]">
                        Descrizione
                      </th>
                      <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-center w-[10%]">
                        Q.tà
                      </th>
                      <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-right w-[14%]">
                        €/Unit.
                      </th>
                      <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-right w-[12%]">
                        Totale
                      </th>
                      <th className="w-[2%]" />
                    </tr>
                  </thead>
                  <tbody className="zebra">
                    {voci.map((v) => (
                      <tr key={v.id} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={v.servizio}
                            onChange={(e) =>
                              updateVoce(v.id, "servizio", e.target.value)
                            }
                            placeholder="Es. Social Media Management"
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={v.descrizione}
                            onChange={(e) =>
                              updateVoce(v.id, "descrizione", e.target.value)
                            }
                            placeholder="Dettaglio breve"
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={1}
                            value={v.quantita}
                            onChange={(e) =>
                              updateVoce(
                                v.id,
                                "quantita",
                                parseFloat(e.target.value) || 1,
                              )
                            }
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-red-300"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={v.prezzoUnitario}
                            onChange={(e) =>
                              updateVoce(
                                v.id,
                                "prezzoUnitario",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-300"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-xs font-semibold text-gray-900 text-right whitespace-nowrap">
                          {fmt(
                            (Number(v.quantita) || 0) *
                              (Number(v.prezzoUnitario) || 0),
                          )}
                        </td>
                        <td className="px-1 py-1.5">
                          {voci.length > 1 && (
                            <button
                              onClick={() =>
                                setVoci((vs) => vs.filter((x) => x.id !== v.id))
                              }
                              className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totali */}
              <div className="mt-3 flex justify-end">
                <div className="space-y-1 text-sm min-w-[240px]">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotale</span>
                    <span className="font-medium">{fmt(subtotale)}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-600">
                    <span>IVA</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.iva}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            iva: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-14 border border-gray-200 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-300"
                      />
                      <span className="text-xs text-gray-400">%</span>
                      <span className="font-medium ml-1">{fmt(ivaAmt)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-gray-600">
                    <span>Fee commerciale</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={form.feeCommerciale}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            feeCommerciale: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-16 border border-gray-200 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-300"
                      />
                      <span className="text-xs text-gray-400">%</span>
                      <span className="font-medium ml-1 text-orange-600">
                        {fmt((subtotale * (form.feeCommerciale || 0)) / 100)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                    <span>TOTALE</span>
                    <span>{fmt(totale)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Guadagno netto</span>
                    <span>
                      {fmt(subtotale * (1 - (form.feeCommerciale || 0) / 100))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 4: Condizioni + Note */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Condizioni commerciali
                </label>
                <textarea
                  value={form.condizioni}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, condizioni: e.target.value }))
                  }
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
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
                  rows={4}
                  placeholder="Note non visibili nel PDF..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                />
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex gap-3 pt-1 border-t border-gray-100">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={save}
                className="flex-1 text-white text-sm font-medium py-2.5 rounded-xl transition-all"
                style={{ background: BRAND }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.opacity = "0.85")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.opacity = "1")
                }
              >
                {editing ? "Salva Modifiche" : "Crea Preventivo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

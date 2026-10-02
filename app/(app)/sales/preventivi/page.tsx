"use client";

import Pills from "@/components/Pills";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { matchQ } from "@/lib/utils";
import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  X,
  Check,
  FileText,
} from "lucide-react";
import { fmt } from "@/lib/constants";
import {
  exportPreventivoPDF,
  exportContrattoPDF,
  VocePreventivoData,
} from "@/lib/export";

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
  lingua: string;
  createdAt: string;
}

type Lingua = "it" | "es" | "en";

interface Contatto {
  id: number;
  nome: string;
  email: string | null;
}

type TipoVoce = "mensile" | "una_tantum";

interface Voce {
  id: string;
  servizio: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  tipo: TipoVoce;
}

const STATUS_OPTIONS = [
  {
    value: "attesa",
    label: "In Attesa",
    bg: "#f59e0b",
    text: "#ffffff",
    border: "#f59e0b",
  },
  {
    value: "accettato",
    label: "Accettato",
    bg: "#22c55e",
    text: "#ffffff",
    border: "#22c55e",
  },
  {
    value: "rifiutato",
    label: "Rifiutato",
    bg: "#ef4444",
    text: "#ffffff",
    border: "#ef4444",
  },
];

const statusStyle = (s: string) =>
  STATUS_OPTIONS.find((o) => o.value === s) ?? STATUS_OPTIONS[0];

const BRAND = "#e8308a";

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
  tipo: "mensile",
});

const emptyForm: {
  oggetto: string;
  nomeCliente: string;
  emailCliente: string;
  aziendaCliente: string;
  azienda: string;
  iva: number;
  feeCommerciale: number;
  status: string;
  note: string;
  condizioni: string;
  dataScadenza: string;
  lingua: Lingua;
} = {
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
  lingua: "it",
};

export default function PreventiviPage() {
  const [preventivi, setPreventivi] = useState<Preventivo[]>([]);
  const [contatti, setContatti] = useState<Contatto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Preventivo | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [voci, setVoci] = useState<Voce[]>([newVoce()]);
  const [filtroStatus, setFiltroStatus] = useState("tutti");
  const [q, setQ] = useState("");
  const [genContratto, setGenContratto] = useState<Preventivo | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

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
      lingua: (p.lingua === "es"
        ? "es"
        : p.lingua === "en"
          ? "en"
          : "it") as Lingua,
    });
    try {
      const parsed: (VocePreventivoData & { tipo?: TipoVoce })[] = JSON.parse(
        p.voci,
      );
      setVoci(
        parsed.map((v) => ({
          ...v,
          id: Math.random().toString(36).slice(2),
          tipo: (v.tipo === "una_tantum" ? "una_tantum" : "mensile") as TipoVoce,
        })),
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
      voci: voci.map(
        ({ servizio, descrizione, quantita, prezzoUnitario, tipo }) => ({
          servizio,
          descrizione,
          quantita: Number(quantita),
          prezzoUnitario: Number(prezzoUnitario),
          tipo,
        }),
      ),
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

  const downloadPDF = async (p: Preventivo) => {
    if (downloadingId === p.id) return;
    setDownloadingId(p.id);
    try {
    const lingua: Lingua = (p.lingua === "es"
      ? "es"
      : p.lingua === "en"
        ? "en"
        : "it") as Lingua;

    let oggetto = p.oggetto;
    let vociJson = p.voci;
    let condizioni = p.condizioni;
    let note = p.note;

    if (lingua !== "it") {
      try {
        const vociParsed = JSON.parse(p.voci);
        const res = await fetch("/api/translate-preventivo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetLang: lingua,
            oggetto: p.oggetto,
            condizioni: p.condizioni ?? "",
            note: p.note ?? "",
            voci: vociParsed,
          }),
        });
        if (res.ok) {
          const t = await res.json();
          oggetto = t.oggetto ?? oggetto;
          condizioni = t.condizioni ?? condizioni;
          note = t.note ?? note;
          vociJson = JSON.stringify(t.voci ?? vociParsed);
        } else {
          const err = await res.json().catch(() => ({}));
          alert(
            `Traduzione fallita (${res.status}): ${err.error ?? "errore"}\nPDF generato con testo originale.`,
          );
        }
      } catch (e) {
        console.error("[downloadPDF] translate error:", e);
        alert(
          "Errore traduzione. PDF generato con testo originale.\n" +
            (e instanceof Error ? e.message : String(e)),
        );
      }
    }

    exportPreventivoPDF({
      numero: p.numero,
      nomeCliente: p.nomeCliente,
      emailCliente: p.emailCliente,
      aziendaCliente: p.aziendaCliente,
      azienda: p.azienda,
      oggetto,
      voci: vociJson,
      iva: p.iva,
      subtotale: p.subtotale,
      totale: p.totale,
      condizioni,
      note,
      createdAt: p.createdAt,
      lingua,
    });
    } finally {
      setDownloadingId(null);
    }
  };

  const filtered = (preventivi ?? []).filter(
    (p) =>
      (filtroStatus === "tutti" || p.status === filtroStatus) &&
      matchQ(q, p.numero, p.nomeCliente, p.aziendaCliente, p.oggetto),
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
          <h1 className="page-title">Preventivi</h1>
          <p className="page-sub">
            {preventivi.length} preventivi totali
          </p>
        </div>
        <button
          onClick={openNew}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" /> Crea preventivo
        </button>
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca numero, cliente, oggetto…" />
        <Pills
          value={filtroStatus}
          onChange={setFiltroStatus}
          options={[{ value: "tutti", label: "Tutti" }, ...STATUS_OPTIONS].map((o) => ({ val: o.value, label: o.label }))}
        />
      </div>

      {/* KPI cards */}
      <KpiGrid cols={3}>
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
            color: "text-ok",
          },
          {
            label: "In Attesa",
            val: fmt(
              (preventivi ?? [])
                .filter((p) => p?.status === "attesa")
                .reduce((s, p) => s + (p?.totale ?? 0), 0),
            ),
            color: "text-warn",
          },
        ].map((k) => (
          <Kpi key={k.label} label={k.label} value={k.val} valueClass={k.color} />
        ))}
      </KpiGrid>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden overflow-x-auto">
        <table className="tbl min-w-[700px]">
          <thead>
            <tr>
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
                  className={`${h ==="Totale" ? "text-right" : h === "Status" ? "text-center" : "text-left"}`}
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
                  className={isScaduto ? "bg-bad/10" : undefined}
                >
                  <td className="font-mono font-medium">
                    {p.numero ?? "—"}
                  </td>
                  <td>
                    <p className="text-sm font-medium text-gray-900">
                      {p.nomeCliente ?? "—"}
                    </p>
                    {p.aziendaCliente && (
                      <p className="text-xs text-gray-400">
                        {p.aziendaCliente}
                      </p>
                    )}
                  </td>
                  <td className="max-w-[180px] truncate">
                    {p.oggetto ?? ""}
                  </td>
                  <td className="text-gray-500">
                    {new Date(p.createdAt).toLocaleDateString("it-IT")}
                  </td>
                  <td>
                    {p.dataScadenza ? (
                      <span
                        className={`text-xs font-medium ${isScaduto ? "text-bad" : "text-gray-500"}`}
                      >
                        {new Date(p.dataScadenza).toLocaleDateString("it-IT")}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="font-semibold text-gray-900 text-right">
                    {fmt(p.totale ?? 0)}
                  </td>
                  <td className="text-center">
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
                      className={p.status === "accettato" ? "pill-ok" : p.status === "rifiutato" ? "pill-late" : "pill-wait"}
                      title="Clicca per cambiare stato"
                    >
                      {p.status === "accettato" && (
                        <Check className="w-3 h-3" />
                      )}
                      {p.status === "rifiutato" && <X className="w-3 h-3" />}
                      {st.label}
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      {p.status === "accettato" && (
                        <button
                          onClick={() => setGenContratto(p)}
                          title="Genera Contratto"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-bad hover:bg-bad/10 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => downloadPDF(p)}
                        disabled={downloadingId === p.id}
                        title={
                          downloadingId === p.id
                            ? "Traduzione in corso..."
                            : "Scarica PDF"
                        }
                        className="p-1.5 rounded-lg text-gray-400 hover:text-bad hover:bg-bad/10 transition-colors disabled:opacity-50 disabled:cursor-wait"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-bad hover:bg-bad/10 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(p.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-bad hover:bg-bad/10 transition-colors"
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
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
                                borderColor: "#e5e7eb",
                                color: "#9ca3af",
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

            {/* Lingua PDF */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Lingua PDF
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { v: "it", l: "Italiano" },
                    { v: "es", l: "Español" },
                    { v: "en", l: "English" },
                  ] as const
                ).map(({ v, l }) => {
                  const active = form.lingua === v;
                  return (
                    <button
                      key={v}
                      onClick={() =>
                        setForm((f) => ({ ...f, lingua: v as Lingua }))
                      }
                      className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                      style={
                        active
                          ? {
                              background: BRAND,
                              color: "#fff",
                              borderColor: BRAND,
                            }
                          : {
                              background: "#fff",
                              borderColor: "#e5e7eb",
                              color: "#9ca3af",
                            }
                      }
                    >
                      {l}
                    </button>
                  );
                })}
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 text-gray-500"
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={form.dataScadenza}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dataScadenza: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 text-gray-700"
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
                <table className="tbl">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-left w-[26%]">
                        Servizio
                      </th>
                      <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-left w-[22%]">
                        Descrizione
                      </th>
                      <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-left w-[14%]">
                        Tipo
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
                  <tbody>
                    {voci.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <input
                            type="text"
                            value={v.servizio}
                            onChange={(e) =>
                              updateVoce(v.id, "servizio", e.target.value)
                            }
                            placeholder="Es. Social Media Management"
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand/30"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={v.descrizione}
                            onChange={(e) =>
                              updateVoce(v.id, "descrizione", e.target.value)
                            }
                            placeholder="Dettaglio breve"
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand/30"
                          />
                        </td>
                        <td>
                          <select
                            value={v.tipo}
                            onChange={(e) =>
                              updateVoce(
                                v.id,
                                "tipo",
                                e.target.value as TipoVoce,
                              )
                            }
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                          >
                            <option value="mensile">Mensile</option>
                            <option value="una_tantum">Una Tantum</option>
                          </select>
                        </td>
                        <td>
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
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand/30"
                          />
                        </td>
                        <td>
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
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand/30"
                          />
                        </td>
                        <td className="text-xs font-semibold text-gray-900 text-right whitespace-nowrap">
                          {fmt(
                            (Number(v.quantita) || 0) *
                              (Number(v.prezzoUnitario) || 0),
                          )}
                        </td>
                        <td>
                          {voci.length > 1 && (
                            <button
                              onClick={() =>
                                setVoci((vs) => vs.filter((x) => x.id !== v.id))
                              }
                              className="p-1 rounded text-gray-400 hover:text-bad transition-colors"
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
                        className="w-14 border border-gray-200 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand/30"
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
                        className="w-16 border border-gray-200 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                      <span className="text-xs text-gray-400">%</span>
                      <span className="font-medium ml-1 text-partial">
                        {fmt((subtotale * (form.feeCommerciale || 0)) / 100)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                    <span>TOTALE</span>
                    <span>{fmt(totale)}</span>
                  </div>
                  <div className="flex justify-between text-ok font-semibold">
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex gap-3 pt-1 border-t border-gray-100">
              <button
                onClick={() => setShowForm(false)}
                className="btn btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                onClick={save}
                className="btn btn-primary flex-1"
              >
                {editing ? "Salva Modifiche" : "Crea Preventivo"}
              </button>
            </div>
            {editing && editing.status === "accettato" && (
              <button
                onClick={() => {
                  setShowForm(false);
                  setGenContratto(editing);
                }}
                className="w-full flex items-center justify-center gap-2 border border-bad/30 text-bad text-sm font-medium py-2.5 rounded-xl hover:bg-bad/10 transition-colors"
              >
                <FileText className="w-4 h-4" /> Genera Contratto
              </button>
            )}
          </div>
        </div>
      )}

      {genContratto && (
        <GeneraContrattoModal
          preventivo={genContratto}
          onClose={() => setGenContratto(null)}
        />
      )}
    </div>
  );
}

// ─── Genera Contratto Modal ─────────────────────────────────────────────────
interface ClienteAnag {
  id: number;
  nome: string;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  partitaIva: string | null;
}
function GeneraContrattoModal({
  preventivo,
  onClose,
}: {
  preventivo: Preventivo;
  onClose: () => void;
}) {
  const [clienti, setClienti] = useState<ClienteAnag[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [rappresentante, setRappresentante] = useState("");
  const [dataDecorrenza, setDataDecorrenza] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // Deriva importo mensile, durata e una tantum dalle voci del preventivo
  const { vociMensili, vociTantum, importoMensileAuto, durataAuto, totUnaTantum } = (() => {
    type V = { quantita?: number; prezzoUnitario?: number; tipo?: string };
    let parsed: V[] = [];
    try {
      parsed = JSON.parse(preventivo.voci);
    } catch {
      parsed = [];
    }
    const mens = parsed.filter((v) => v.tipo !== "una_tantum");
    const tan = parsed.filter((v) => v.tipo === "una_tantum");
    const im = mens.reduce((s, v) => s + (Number(v.prezzoUnitario) || 0), 0);
    const du = mens.length > 0 ? Math.max(...mens.map((v) => Number(v.quantita) || 0)) : 6;
    const tt = tan.reduce(
      (s, v) => s + (Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0),
      0,
    );
    return {
      vociMensili: mens.length,
      vociTantum: tan.length,
      importoMensileAuto: im,
      durataAuto: du > 0 ? du : 6,
      totUnaTantum: tt,
    };
  })();

  const [durataMesi, setDurataMesi] = useState(durataAuto);
  const [importoMensile, setImportoMensile] = useState(importoMensileAuto);
  const [numeroRate, setNumeroRate] = useState(durataAuto);
  const [lingua, setLingua] = useState<"it" | "es">("it");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clienti")
      .then((r) => r.json())
      .then((data) => {
        const arr: ClienteAnag[] = Array.isArray(data) ? data : [];
        setClienti(arr);
        // Match per nome
        const match = arr.find(
          (c) =>
            c.nome.toLowerCase() === preventivo.nomeCliente.toLowerCase() ||
            (preventivo.aziendaCliente &&
              c.nome.toLowerCase() ===
                preventivo.aziendaCliente.toLowerCase()),
        );
        if (match) setClienteId(match.id);
      });
  }, [preventivo.nomeCliente, preventivo.aziendaCliente]);

  const cliente = clienti.find((c) => c.id === clienteId) ?? null;
  const totaleRicorrente = importoMensile * numeroRate;
  const totale = totaleRicorrente + totUnaTantum;

  const submit = async () => {
    if (!clienteId) {
      setError("Seleziona un cliente dall'anagrafica");
      return;
    }
    if (!rappresentante.trim()) {
      setError("Inserisci il rappresentante legale");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/contratti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preventivoId: preventivo.id,
          clienteId,
          rappresentanteLegale: rappresentante,
          dataDecorrenza,
          durataMesi,
          importoMensile,
          numeroRate,
          oggetto: preventivo.oggetto,
          voci: preventivo.voci,
          lingua,
          status: "bozza",
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Errore salvataggio");
        return;
      }
      const c = await res.json();
      // Download PDF
      await exportContrattoPDF({
        numero: c.numero,
        cliente: {
          nome: c.cliente.nome,
          via: c.cliente.via,
          cap: c.cliente.cap,
          citta: c.cliente.citta,
          provincia: c.cliente.provincia,
          partitaIva: c.cliente.partitaIva,
        },
        rappresentanteLegale: c.rappresentanteLegale,
        oggetto: c.oggetto,
        voci: c.voci,
        dataDecorrenza: c.dataDecorrenza,
        durataMesi: c.durataMesi,
        importoMensile: c.importoMensile,
        numeroRate: c.numeroRate,
        totaleContratto: c.totaleContratto,
        lingua: c.lingua === "es" ? "es" : "it",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Genera Contratto da {preventivo.numero}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Cliente (anagrafica) *
            </label>
            <select
              value={clienteId ?? ""}
              onChange={(e) => setClienteId(parseInt(e.target.value) || null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">Seleziona cliente...</option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {cliente && (
              <p className="text-[11px] text-gray-500 mt-1">
                {[cliente.via, cliente.cap, cliente.citta]
                  .filter(Boolean)
                  .join(", ")}
                {cliente.partitaIva ? ` — P.IVA ${cliente.partitaIva}` : ""}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Rappresentante Legale *
            </label>
            <input
              type="text"
              value={rappresentante}
              onChange={(e) => setRappresentante(e.target.value)}
              placeholder="Es. Eugenio Zuppichin"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Lingua contratto
            </label>
            <div className="flex gap-2">
              {(
                [
                  { v: "it", l: "Italiano" },
                  { v: "es", l: "Spagnolo" },
                ] as const
              ).map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setLingua(v)}
                  className="flex-1 text-sm py-2 rounded-lg border font-semibold"
                  style={
                    lingua === v
                      ? {
                          background: "#e8308a",
                          color: "#fff",
                          borderColor: "#e8308a",
                        }
                      : {
                          background: "#fff",
                          borderColor: "#e5e7eb",
                          color: "#9ca3af",
                        }
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Decorrenza
              </label>
              <input
                type="date"
                value={dataDecorrenza}
                onChange={(e) => setDataDecorrenza(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Durata (mesi)
              </label>
              <input
                type="number"
                min={1}
                value={durataMesi}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 1;
                  setDurataMesi(v);
                  setNumeroRate(v);
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Importo mensile (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={importoMensile}
                onChange={(e) =>
                  setImportoMensile(parseFloat(e.target.value) || 0)
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Numero rate
              </label>
              <input
                type="number"
                min={1}
                value={numeroRate}
                onChange={(e) => setNumeroRate(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
            {vociMensili > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Ricorrente ({numeroRate} × {fmt(importoMensile)}/mese)
                </span>
                <span className="font-medium text-gray-900">
                  {fmt(totaleRicorrente)}
                </span>
              </div>
            )}
            {vociTantum > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Una tantum</span>
                <span className="font-medium text-gray-900">
                  {fmt(totUnaTantum)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1.5">
              <span className="text-gray-700 font-semibold">
                Totale contratto
              </span>
              <span className="font-bold text-gray-900">{fmt(totale)}</span>
            </div>
            <p className="text-[11px] text-gray-500">
              {vociMensili > 0
                ? `Importo mensile = somma costi mensili (${vociMensili} servizi). Durata = max mesi tra i servizi mensili.`
                : "Nessun servizio mensile nel preventivo — solo una tantum."}
            </p>
          </div>

          {error && (
            <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="btn btn-primary flex-1 disabled:opacity-60"
          >
            {saving ? "Generazione..." : "Genera e Scarica PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

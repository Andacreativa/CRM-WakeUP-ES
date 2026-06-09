"use client";

import { useEffect, useState } from "react";
import {
  Pencil,
  Trash2,
  Check,
  X,
  Download,
  FileSpreadsheet,
  Wallet,
  Send,
  Plus,
} from "lucide-react";
import {
  fmt,
  MESI,
  AZIENDE,
  AZIENDA_COLORI,
  TIPO_IMPOSTA_OPTIONS,
} from "@/lib/constants";
import AddressFields from "@/components/AddressFields";
import FiltriBar from "@/components/FiltriBar";
import { useAnno } from "@/lib/anno-context";
import {
  exportExcel,
  exportPDF,
  fattureToExcel,
  fattureToPDF,
} from "@/lib/export";
import { PageSizeSelect, PageNav } from "@/components/Pagination";

const BRAND = "#db291b";

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
interface ContrattoMini {
  id: number;
  numero: string;
}
interface Contratto {
  id: number;
  numero: string;
  clienteId: number | null;
  cliente: { nome: string } | null;
}
interface Fattura {
  id: number;
  numero: string | null;
  data: string | null;
  clienteId: number | null;
  cliente: Cliente | null;
  contrattoId: number | null;
  contratto: ContrattoMini | null;
  azienda: string;
  aziendaNota: string | null;
  mese: number;
  anno: number;
  importo: number;
  tipoIva: string;
  iva: number;
  pagato: boolean;
  inviata: boolean;
  dataInvio: string | null;
  checkInvio: string;
  metodo: string | null;
  commerciale: string | null;
  scadenza: string | null;
  acconti: Acconto[];
}

const totalePagato = (f: Fattura) =>
  (f.acconti ?? []).reduce((s, a) => s + a.importo, 0);
const residuo = (f: Fattura) => Math.max(0, f.importo - totalePagato(f));
const statoCalcolato = (f: Fattura): "pagato" | "acconto" | "attesa" => {
  if (f.pagato) return "pagato";
  if (totalePagato(f) >= f.importo) return "pagato";
  if (totalePagato(f) > 0) return "acconto";
  return "attesa";
};

type TipoIva = "igic_exenta" | "igic7";
const TIPO_IVA_OPTIONS: { value: TipoIva; label: string }[] = [
  { value: "igic_exenta", label: "IGIC Exenta" },
  { value: "igic7", label: "IGIC 7%" },
];

const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

const emptyForm = {
  numero: "",
  clienteId: "",
  contrattoId: "",
  azienda: AZIENDE[0],
  aziendaNota: "",
  commerciale: "",
  mese: new Date().getMonth() + 1,
  anno: new Date().getFullYear(),
  importo: "",
  tipoIva: "igic_exenta" as TipoIva,
  pagato: false,
  inviata: false,
  dataInvio: "",
  scadenza: "",
};

export default function FattureContrattiPage() {
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [contratti, setContratti] = useState<Contratto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fattura | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filtroMese, setFiltroMese] = useState(0);
  const [filtroClienteId, setFiltroClienteId] = useState<number>(0);
  const [filtroInvio, setFiltroInvio] = useState<
    "tutte" | "emesse" | "non_emesse"
  >("tutte");
  const { anno, setAnno } = useAnno();
  const [azienda, setAzienda] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [accontoTarget, setAccontoTarget] = useState<Fattura | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [togglingInvioId, setTogglingInvioId] = useState<number | null>(null);
  const [togglingCheckId, setTogglingCheckId] = useState<number | null>(null);

  const toggleCheckInvio = async (f: Fattura) => {
    if (togglingCheckId === f.id) return;
    setTogglingCheckId(f.id);
    try {
      const next =
        f.checkInvio === "ok_invia" ? "in_attesa" : "ok_invia";
      const res = await fetch(`/api/fatture/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkInvio: next }),
      });
      const body = await res
        .json()
        .catch(() => ({ error: "non-JSON response" }));
      if (!res.ok) {
        alert(
          `Errore check invio (${res.status}): ${body.error ?? "errore"}`,
        );
        return;
      }
      setFatture((prev) =>
        prev.map((x) =>
          x.id === f.id ? { ...x, checkInvio: body.checkInvio } : x,
        ),
      );
    } finally {
      setTogglingCheckId(null);
    }
  };
  const [showNewCliente, setShowNewCliente] = useState(false);
  const emptyNewCliente = {
    nome: "",
    paese: "Spagna",
    email: "",
    telefono: "",
    partitaIva: "",
    tipoImposta: "IGIC Exenta",
    via: "",
    cap: "",
    citta: "",
    provincia: "",
    note: "",
  };
  const [newCliente, setNewCliente] = useState({ ...emptyNewCliente });
  const [savingCliente, setSavingCliente] = useState(false);

  const saveNewCliente = async () => {
    if (!newCliente.nome.trim()) return;
    setSavingCliente(true);
    try {
      const res = await fetch("/api/clienti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: newCliente.nome.trim(),
          paese: newCliente.paese,
          email: newCliente.email || null,
          telefono: newCliente.telefono || null,
          partitaIva: newCliente.partitaIva || null,
          tipoImposta: newCliente.tipoImposta,
          via: newCliente.via || null,
          cap: newCliente.cap || null,
          citta: newCliente.citta || null,
          provincia: newCliente.provincia || null,
          note: newCliente.note || null,
        }),
      });
      if (!res.ok) {
        alert(`Errore creazione cliente (${res.status})`);
        return;
      }
      const created = await res.json();
      const lista = (await (await fetch("/api/clienti")).json()) as Cliente[];
      setClienti(Array.isArray(lista) ? lista : []);
      setForm((f) => ({
        ...f,
        clienteId: String(created.id),
        contrattoId: "",
      }));
      setShowNewCliente(false);
      setNewCliente({ ...emptyNewCliente });
    } finally {
      setSavingCliente(false);
    }
  };

  const load = async () => {
    const params = new URLSearchParams();
    if (anno > 0) params.set("anno", String(anno));
    if (azienda) params.set("azienda", azienda);
    const [f, c, ctr] = await Promise.all([
      (await fetch(`/api/contratti/fatture?${params}`)).json() as Promise<any>,
      (await fetch("/api/clienti")).json() as Promise<any>,
      (await fetch("/api/contratti")).json() as Promise<any>,
    ]);
    setFatture(Array.isArray(f) ? f : []);
    setClienti(Array.isArray(c) ? c : []);
    setContratti(Array.isArray(ctr) ? ctr : []);
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

  const openEdit = (f: Fattura) => {
    setEditing(f);
    setForm({
      numero: f.numero || "",
      clienteId: f.clienteId != null ? String(f.clienteId) : "",
      contrattoId: f.contrattoId != null ? String(f.contrattoId) : "",
      azienda: f.azienda,
      aziendaNota: f.aziendaNota || "",
      commerciale: f.commerciale || "",
      mese: f.mese,
      anno: f.anno,
      importo: String(f.importo),
      tipoIva: (f.tipoIva === "igic7" ? "igic7" : "igic_exenta") as TipoIva,
      pagato: f.pagato,
      inviata: f.inviata,
      dataInvio: f.dataInvio ? f.dataInvio.slice(0, 10) : "",
      scadenza: f.scadenza ? f.scadenza.slice(0, 10) : "",
    });
    setShowForm(true);
  };

  const save = async () => {
    console.log("[save] chiamato", form);
    if (!form.importo) return;
    const ivaPct = form.tipoIva === "igic7" ? 7 : 0;
    const payload = {
      ...form,
      clienteId: form.clienteId ? parseInt(form.clienteId) : null,
      contrattoId: form.contrattoId ? parseInt(form.contrattoId) : null,
      importo: parseFloat(form.importo),
      iva: ivaPct,
      scadenza: form.scadenza || null,
      dataInvio: form.dataInvio || null,
      aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
    };
    const url = editing ? `/api/fatture/${editing.id}` : "/api/fatture";
    const method = editing ? "PATCH" : "POST";
    console.log("[save] payload:", payload);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log("[save] status:", res.status);
    const body = await res.json().catch(() => ({}));
    console.log("[save] body:", body);
    if (!res.ok) {
      alert(
        `Errore salvataggio (${res.status}): ${body.error ?? "errore"}${body.stage ? ` [stage=${body.stage}]` : ""}`,
      );
      return;
    }
    setShowForm(false);
    if (editing) {
      setFatture((prev) =>
        prev.map((x) => (x.id === editing.id ? { ...x, ...body } : x)),
      );
    }
    load();
  };

  const togglePagato = async (f: Fattura) => {
    if (togglingId === f.id) return;
    setTogglingId(f.id);
    try {
      const newPagato = !f.pagato;
      const res = await fetch(`/api/fatture/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagato: newPagato }),
      });
      const body = await res
        .json()
        .catch(() => ({ error: "non-JSON response" }));
      if (!res.ok) {
        alert(
          `Errore aggiornamento stato (${res.status}): ${body.error ?? "errore"}`,
        );
      } else {
        setFatture((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, pagato: body.pagato } : x)),
        );
      }
    } finally {
      setTogglingId(null);
    }
  };

  const toggleInvio = async (f: Fattura) => {
    if (togglingInvioId === f.id) return;
    setTogglingInvioId(f.id);
    try {
      const newInviata = !f.inviata;
      const payload: Record<string, unknown> = { inviata: newInviata };
      if (newInviata) {
        payload.dataInvio = new Date().toISOString().slice(0, 10);
      } else {
        payload.dataInvio = null;
      }
      const res = await fetch(`/api/fatture/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res
        .json()
        .catch(() => ({ error: "non-JSON response" }));
      if (!res.ok) {
        alert(
          `Errore aggiornamento invio (${res.status}): ${body.error ?? "errore"}`,
        );
      } else {
        setFatture((prev) =>
          prev.map((x) =>
            x.id === f.id
              ? { ...x, inviata: body.inviata, dataInvio: body.dataInvio }
              : x,
          ),
        );
      }
    } finally {
      setTogglingInvioId(null);
    }
  };

  const del = async (id: number) => {
    if (!confirm("Eliminare questa fattura?")) return;
    await fetch(`/api/fatture/${id}`, { method: "DELETE" });
    load();
  };

  const filtered = (fatture ?? []).filter((f) => {
    if (filtroMese && f.mese !== filtroMese) return false;
    if (filtroClienteId && f.clienteId !== filtroClienteId) return false;
    if (filtroInvio === "emesse" && !f.inviata) return false;
    if (filtroInvio === "non_emesse" && f.inviata) return false;
    return true;
  });

  const clienteFiltrato = filtroClienteId
    ? (clienti.find((c) => c.id === filtroClienteId) ?? null)
    : null;

  useEffect(() => {
    setPage(1);
  }, [filtroMese, filtroClienteId, filtroInvio, anno, azienda, pageSize]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totale = filtered.reduce((s, f) => s + (f?.importo ?? 0), 0);
  const totaleEmesse = filtered
    .filter((f) => f.inviata)
    .reduce((s, f) => s + (f?.importo ?? 0), 0);
  const totaleNonEmesse = filtered
    .filter((f) => !f.inviata)
    .reduce((s, f) => s + (f?.importo ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fatture Contratti</h1>
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
            showAzienda={false}
            includeAllYears
          />
          <button
            onClick={() => {
              const aziendaLabel = azienda || "Tutte";
              const annoStr = anno > 0 ? String(anno) : "tutti gli anni";
              const annoFile = anno > 0 ? String(anno) : "tutti";
              const titolo = clienteFiltrato
                ? `Fatture Contratti ${annoStr} — ${aziendaLabel} · ${clienteFiltrato.nome}`
                : `Fatture Contratti ${annoStr} — ${aziendaLabel}`;
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
              exportPDF(
                title,
                cols,
                rows,
                `fatture_contratti_${annoFile}${slug}`,
                {
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
                },
              );
            }}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
          <button
            onClick={openNew}
            style={{ background: BRAND }}
            className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Nuova Fattura
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Totale", val: fmt(totale), color: "text-gray-900" },
          {
            label: "Emesse",
            val: fmt(totaleEmesse),
            color: "text-emerald-600",
          },
          {
            label: "Non Emesse",
            val: fmt(totaleNonEmesse),
            color: "text-gray-500",
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
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300"
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
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300 min-w-[180px]"
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
          {(["tutte", "emesse", "non_emesse"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFiltroInvio(v)}
              className="text-sm px-3 py-1.5 rounded-md font-medium transition-colors"
              style={
                filtroInvio === v
                  ? { background: BRAND, color: "#fff" }
                  : { color: "#64748b" }
              }
            >
              {v === "tutte"
                ? "Tutte"
                : v === "emesse"
                  ? "Emesse"
                  : "Non Emesse"}
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
                "Cliente",
                "Azienda",
                "Mese",
                "Data Invio",
                "Importo",
                "Validazione",
                "Invio",
                "Stato",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 ${h === "Importo" ? "text-right" : h === "Stato" || h === "Invio" || h === "Validazione" ? "text-center" : "text-left"}`}
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
                key={`${f.id}-${f.pagato}-${f.inviata}-${totalePagato(f)}`}
                className={`border-b border-gray-50 transition-colors ${i % 2 === 1 ? "bg-[#F9F9F9]" : "bg-white"}`}
              >
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
                  {f.dataInvio ? (
                    <span className="text-xs font-medium text-gray-600">
                      {new Date(f.dataInvio).toLocaleDateString("it-IT")}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                  {fmt(f.importo)}
                </td>
                <td className="px-4 py-3 text-center">
                  {f.checkInvio === "ok_invia" ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCheckInvio(f);
                      }}
                      disabled={togglingCheckId === f.id}
                      className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-60 disabled:cursor-wait"
                    >
                      <Check className="w-3 h-3" /> Ok Invia
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCheckInvio(f);
                      }}
                      disabled={togglingCheckId === f.id}
                      className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-60 disabled:cursor-wait"
                    >
                      <X className="w-3 h-3" /> In Attesa
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleInvio(f);
                    }}
                    disabled={togglingInvioId === f.id}
                    className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors disabled:opacity-60 disabled:cursor-wait ${
                      f.inviata
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {f.inviata ? (
                      <>
                        <Check className="w-3 h-3" /> Emessa
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" /> Non Emessa
                      </>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  {(() => {
                    const stato = statoCalcolato(f);
                    if (stato === "pagato") {
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (f.acconti && f.acconti.length > 0) {
                              setAccontoTarget(f);
                            } else {
                              togglePagato(f);
                            }
                          }}
                          disabled={togglingId === f.id}
                          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-60 disabled:cursor-wait"
                        >
                          <Check className="w-3 h-3" /> Pagato
                        </button>
                      );
                    }
                    if (stato === "acconto") {
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAccontoTarget(f);
                          }}
                          title={`${fmt(totalePagato(f))} ricevuti / ${fmt(residuo(f))} residuo`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                        >
                          <Wallet className="w-3 h-3" /> Acconto
                        </button>
                      );
                    }
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePagato(f);
                        }}
                        disabled={togglingId === f.id}
                        className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-60 disabled:cursor-wait"
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
                        style={{ color: "#9ca3af" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color =
                            BRAND;
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.background = "#fef2f2";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color =
                            "#9ca3af";
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.background = "transparent";
                        }}
                        className="p-1.5 rounded-lg transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(f)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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

      {/* Modal Modifica */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? "Modifica Fattura" : "Nuova Fattura"}
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
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600">
                    Cliente *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewCliente(true)}
                    className="text-xs font-medium hover:underline"
                    style={{ color: BRAND }}
                  >
                    + Nuovo Cliente
                  </button>
                </div>
                <select
                  value={form.clienteId}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      clienteId: e.target.value,
                      contrattoId: "",
                    }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  <option value="">Seleziona cliente...</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Contratto
                </label>
                <select
                  value={form.contrattoId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contrattoId: e.target.value }))
                  }
                  disabled={!form.clienteId}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {form.clienteId
                      ? "Nessun contratto"
                      : "Seleziona prima il cliente..."}
                  </option>
                  {contratti
                    .filter(
                      (c) =>
                        form.clienteId &&
                        c.clienteId === parseInt(form.clienteId),
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero}
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
                      setForm((f) => ({
                        ...f,
                        mese: parseInt(e.target.value),
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.importo}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, importo: e.target.value }))
                      }
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                  </div>
                </div>
              </div>
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
                                background: "#fee2e2",
                                color: "#991b1b",
                                borderColor: "#fca5a5",
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Anno
                  </label>
                  <input
                    type="number"
                    min={2024}
                    value={form.anno}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        anno: parseInt(e.target.value) || new Date().getFullYear(),
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Data Invio
                  </label>
                  <input
                    type="date"
                    value={form.dataInvio}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dataInvio: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.inviata}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, inviata: e.target.checked }))
                  }
                  className="w-4 h-4"
                  style={{ accentColor: BRAND }}
                />
                <span className="text-sm text-gray-700">Fattura emessa</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pagato}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pagato: e.target.checked }))
                  }
                  className="w-4 h-4"
                  style={{ accentColor: BRAND }}
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
                style={{ background: BRAND }}
                className="flex-1 text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewCliente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900">Nuovo Cliente</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Paese
                </label>
                <div className="flex gap-2">
                  {(["Spagna", "Italia"] as const).map((p) => {
                    const active = newCliente.paese === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setNewCliente((c) => {
                            const stripped = c.partitaIva
                              .replace(/^IT/i, "")
                              .trim();
                            return {
                              ...c,
                              paese: p,
                              partitaIva:
                                p === "Italia"
                                  ? `IT${stripped}`
                                  : stripped,
                            };
                          })
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
                                borderColor: "#e2e8f0",
                                color: "#94a3b8",
                              }
                        }
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={newCliente.nome}
                  onChange={(e) =>
                    setNewCliente((c) => ({ ...c, nome: e.target.value }))
                  }
                  placeholder="Es. Acme Srl"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  P.IVA / NIF
                </label>
                <input
                  type="text"
                  value={newCliente.partitaIva}
                  onChange={(e) =>
                    setNewCliente((c) => ({
                      ...c,
                      partitaIva: e.target.value,
                    }))
                  }
                  placeholder={
                    newCliente.paese === "Italia" ? "IT12345678901" : "B12345678"
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newCliente.email}
                    onChange={(e) =>
                      setNewCliente((c) => ({ ...c, email: e.target.value }))
                    }
                    placeholder="email@esempio.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Telefono
                  </label>
                  <input
                    type="tel"
                    value={newCliente.telefono}
                    onChange={(e) =>
                      setNewCliente((c) => ({ ...c, telefono: e.target.value }))
                    }
                    placeholder="+34 ..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Tipo Imposta
                </label>
                <div className="flex gap-2">
                  {TIPO_IMPOSTA_OPTIONS.map((opt) => {
                    const active = newCliente.tipoImposta === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setNewCliente((c) => ({ ...c, tipoImposta: opt }))
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
                                borderColor: "#e2e8f0",
                                color: "#94a3b8",
                              }
                        }
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Indirizzo
                </p>
                <AddressFields
                  value={{
                    via: newCliente.via,
                    cap: newCliente.cap,
                    citta: newCliente.citta,
                    provincia: newCliente.provincia,
                    paese: newCliente.paese,
                  }}
                  onChange={(a) =>
                    setNewCliente((c) => ({
                      ...c,
                      via: a.via,
                      cap: a.cap,
                      citta: a.citta,
                      provincia: a.provincia,
                      paese: a.paese,
                    }))
                  }
                  inputClass="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Note
                </label>
                <textarea
                  value={newCliente.note}
                  onChange={(e) =>
                    setNewCliente((c) => ({ ...c, note: e.target.value }))
                  }
                  rows={2}
                  placeholder="Note interne..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowNewCliente(false);
                  setNewCliente({ ...emptyNewCliente });
                }}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={saveNewCliente}
                disabled={savingCliente || !newCliente.nome.trim()}
                style={{ background: BRAND }}
                className="flex-1 text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {savingCliente ? "Creo..." : "Crea Cliente"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
            style={{ background: BRAND }}
            className="flex-1 text-white text-sm font-medium py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Registra"}
          </button>
        </div>
      </div>
    </div>
  );
}

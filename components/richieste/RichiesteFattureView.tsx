"use client";

import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Link2,
  Unlink,
  FileSignature,
  FileText,
  FilePlus2,
  Check,
  Receipt,
} from "lucide-react";
import { fmt, MESI, CANALI, ANNI, canaleLabel } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import { cn } from "@/lib/utils";

// Richieste di fattura (Sales › Richieste fattura): validazione ed emissione,
// con le colonne di «Fatture da emettere» di Northstar.

interface ClienteMin {
  id: number;
  nome: string;
  paese?: string;
}
interface ContrattoMin {
  id: number;
  numero: string;
  oggetto: string;
  clienteId: number | null;
  cliente: { nome: string } | null;
  nomeClienteFallback: string | null;
  numeroRate: number;
  importoMensile: number;
}
interface Voce {
  descrizione: string;
  importo: number;
}
interface Richiesta {
  id: number;
  codice: string;
  clienteId: number | null;
  cliente: ClienteMin | null;
  nomeCliente: string | null;
  contrattoId: number | null;
  contratto: { id: number; numero: string; oggetto: string } | null;
  azienda: string;
  aziendaNota: string | null;
  descrizione: string;
  voci: string;
  imponibile: number;
  tipoIva: string;
  iva: number;
  totale: number;
  mese: number;
  anno: number;
  dataInvio: string | null;
  serieCodice: string | null;
  serieIndice: number | null;
  serieTotale: number | null;
  ricorrenza: string;
  responsabile: string | null;
  validazione: string;
  emessa: boolean;
  incassata: boolean;
  fatturaId: number | null;
  fattura: {
    id: number;
    numero: string | null;
    pagato: boolean;
    importo: number;
  } | null;
  origine: string;
  note: string | null;
  emessaEff: boolean;
  incassataEff: boolean;
  stato: "da_validare" | "da_fare" | "emessa" | "incassata";
}
interface FatturaCandidata {
  id: number;
  numero: string | null;
  data: string | null;
  mese: number;
  anno: number;
  importo: number;
  pagato: boolean;
  cliente: { nome: string } | null;
}

const STATI = [
  { value: "", label: "Tutte" },
  { value: "da_validare", label: "Da validare" },
  { value: "da_fare", label: "Da fare" },
  { value: "emesse", label: "Fatte" },
];
const RICORRENZE = [
  { value: "una_tantum", label: "Una tantum" },
  { value: "mensile", label: "Mensile" },
  { value: "trimestrale", label: "Trimestrale" },
  { value: "annuale", label: "Annuale" },
];
const ANNI_FORM = [new Date().getFullYear() + 1, ...ANNI];

const nomeCliente = (r: Richiesta) =>
  r.cliente?.nome || r.nomeCliente || "(cliente da assegnare)";

const parseVoci = (raw: string): Voce[] => {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

const emptyForm = () => ({
  clienteId: "",
  nomeCliente: "",
  contrattoId: "",
  responsabile: "",
  azienda: CANALI[0],
  aziendaNota: "",
  voci: [{ descrizione: "", importo: "" }] as { descrizione: string; importo: string }[],
  tipoIva: "igic_exenta",
  mese: new Date().getMonth() + 1,
  anno: new Date().getFullYear(),
  dataInvio: "",
  ricorrenza: "una_tantum",
  ripetizioni: "1",
  autorizzaTutte: false,
  note: "",
});
type FormState = ReturnType<typeof emptyForm>;

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";
const selectCls =
  "sel";

export default function RichiesteFattureView() {
  const { anno } = useAnno();
  const [rows, setRows] = useState<Richiesta[]>([]);
  const [clienti, setClienti] = useState<ClienteMin[]>([]);
  const [contratti, setContratti] = useState<ContrattoMin[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  // Filtri
  const [mese, setMese] = useState(0);
  const [clienteId, setClienteId] = useState(0);
  const [stato, setStato] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modali
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Richiesta | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [creaFattura, setCreaFattura] = useState<Richiesta | null>(null);
  const [collega, setCollega] = useState<Richiesta | null>(null);
  const [daContratto, setDaContratto] = useState(false);

  const notify = (text: string, kind: "ok" | "err" = "ok") => {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("anno", String(anno));
    if (mese) params.set("mese", String(mese));
    if (clienteId) params.set("clienteId", String(clienteId));
    if (stato) params.set("stato", stato);
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(`/api/richieste-fattura?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("load richieste", e);
    } finally {
      setLoading(false);
    }
  }, [anno, mese, clienteId, stato, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const [c, k] = await Promise.all([
          fetch("/api/clienti").then((r) => r.json()),
          fetch("/api/contratti").then((r) => r.json()),
        ]);
        setClienti(
          (Array.isArray(c) ? c : [])
            .map((x: ClienteMin) => ({ id: x.id, nome: x.nome, paese: x.paese }))
            .sort((a: ClienteMin, b: ClienteMin) => a.nome.localeCompare(b.nome)),
        );
        setContratti(Array.isArray(k) ? k : []);
      } catch (e) {
        console.error("load anagrafiche", e);
      }
    })();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [anno, mese, clienteId, stato, q, pageSize]);

  // KPI sul set filtrato
  const kpi = useMemo(() => {
    const daEmettere = rows.filter((r) => !r.emessaEff);
    return {
      daEmettere: daEmettere.reduce((s, r) => s + r.totale, 0),
      righe: rows.length,
      daValidare: rows.filter((r) => r.stato === "da_validare").length,
      daFare: rows.filter((r) => r.stato === "da_fare").length,
    };
  }, [rows]);

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  // ── Azioni ────────────────────────────────────────────────────────────
  const toggle = async (r: Richiesta, flag: "validazione" | "emessa") => {
    const res = await fetch(`/api/richieste-fattura/${r.id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      notify(j.error ?? "Operazione non riuscita", "err");
      return;
    }
    load();
  };

  const del = async (r: Richiesta) => {
    if (!confirm(`Eliminare la richiesta ${r.codice}?`)) return;
    await fetch(`/api/richieste-fattura/${r.id}`, { method: "DELETE" });
    setShowForm(false);
    load();
  };

  const scollega = async (r: Richiesta) => {
    if (!confirm("Scollegare la fattura da questa richiesta?")) return;
    await fetch(`/api/richieste-fattura/${r.id}/collega`, { method: "DELETE" });
    setShowForm(false);
    load();
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm(), anno: anno > 0 ? anno : new Date().getFullYear() });
    setShowForm(true);
  };

  const openEdit = (r: Richiesta) => {
    const voci = parseVoci(r.voci);
    setEditing(r);
    setForm({
      clienteId: r.clienteId ? String(r.clienteId) : "",
      nomeCliente: r.nomeCliente ?? "",
      contrattoId: r.contrattoId ? String(r.contrattoId) : "",
      responsabile: r.responsabile ?? "",
      azienda: r.azienda,
      aziendaNota: r.aziendaNota ?? "",
      voci: voci.length
        ? voci.map((v) => ({ descrizione: v.descrizione, importo: String(v.importo) }))
        : [{ descrizione: r.descrizione, importo: String(r.imponibile) }],
      tipoIva: r.tipoIva === "igic7" ? "igic7" : "igic_exenta",
      mese: r.mese,
      anno: r.anno,
      dataInvio: r.dataInvio ? r.dataInvio.slice(0, 10) : "",
      ricorrenza: r.ricorrenza,
      ripetizioni: "1",
      autorizzaTutte: false,
      note: r.note ?? "",
    });
    setShowForm(true);
  };

  const imponibileForm = form.voci.reduce(
    (s, v) => s + (parseFloat(String(v.importo).replace(",", ".")) || 0),
    0,
  );
  const ivaForm = form.tipoIva === "igic7" ? 7 : 0;
  const totaleForm = Math.round(imponibileForm * (1 + ivaForm / 100) * 100) / 100;

  const save = async () => {
    const voci = form.voci
      .map((v) => ({
        descrizione: v.descrizione.trim(),
        importo: parseFloat(String(v.importo).replace(",", ".")) || 0,
      }))
      .filter((v) => v.descrizione || v.importo);
    if (!voci.length || imponibileForm <= 0) {
      notify("Inserisci almeno una voce con importo", "err");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        clienteId: form.clienteId || null,
        nomeCliente: form.clienteId ? null : form.nomeCliente,
        contrattoId: form.contrattoId || null,
        responsabile: form.responsabile,
        azienda: form.azienda,
        aziendaNota: form.aziendaNota,
        descrizione: voci.map((v) => v.descrizione).filter(Boolean).join(", "),
        voci,
        tipoIva: form.tipoIva,
        mese: form.mese,
        anno: form.anno,
        dataInvio: form.dataInvio || null,
        ricorrenza: form.ricorrenza,
        ripetizioni: form.ripetizioni,
        autorizzaTutte: form.autorizzaTutte,
        note: form.note,
      };
      const res = await fetch(
        editing ? `/api/richieste-fattura/${editing.id}` : "/api/richieste-fattura",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        notify(j.error ?? "Salvataggio non riuscito", "err");
        return;
      }
      setShowForm(false);
      notify(editing ? "Richiesta aggiornata" : "Richiesta creata");
      load();
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={cn(
            "text-sm rounded-lg px-3 py-2 border",
            msg.kind === "ok"
              ? "bg-ok/10 border-ok/30 text-ok"
              : "bg-bad/10 border-bad/30 text-bad",
          )}
        >
          {msg.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Richieste fattura</h1>
          <p className="page-sub">
            Richieste di fatturazione dai contratti e dal commerciale: si validano e diventano fatture
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDaContratto(true)}
            className="btn btn-secondary"
          >
            <FileSignature className="w-4 h-4" /> Da contratto
          </button>
          <button
            onClick={openNew}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> Nuova richiesta
          </button>
        </div>
      </div>

      {/* KPI */}
      <KpiGrid cols={4}>
        {[
          { label: "Da emettere", value: fmt(kpi.daEmettere), color: "#e8308a" },
          { label: "Righe", value: String(kpi.righe), color: "#111827" },
          { label: "Da validare", value: String(kpi.daValidare), color: "#f59e0b" },
          { label: "Da fare", value: String(kpi.daFare), color: "#3b82f6" },
        ].map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} color={k.color} />
        ))}
      </KpiGrid>

      {/* Filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca cliente, descrizione, codice…" className="w-64" />
        <select value={mese} onChange={(e) => setMese(parseInt(e.target.value))} className={selectCls}>
          <option value={0}>Tutti i mesi</option>
          {MESI.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={clienteId}
          onChange={(e) => setClienteId(parseInt(e.target.value))}
          className={selectCls}
        >
          <option value={0}>Tutti i clienti</option>
          {clienti.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select value={stato} onChange={(e) => setStato(e.target.value)} className={selectCls}>
          {STATI.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
      </div>

      {/* Tabella */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          {/* Colonne come «Fatture da emettere» di Northstar */}
          <table className="tbl min-w-[900px]">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Responsabile</th>
                <th>Mese</th>
                <th>Data invio</th>
                <th className="text-right">Importo</th>
                <th className="text-center">Validazione</th>
                <th className="text-center">Emissione</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400">
                    Caricamento…
                  </td>
                </tr>
              )}
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                    Nessuna richiesta per i filtri scelti
                  </td>
                </tr>
              )}
              {paged.map((r) => {
                const validata = r.validazione === "ok";
                const nVoci = parseVoci(r.voci).length;
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="tbl-primary">{nomeCliente(r)}</div>
                      <div className="text-xs text-gray-500 max-w-[360px] truncate" title={r.descrizione}>
                        {r.descrizione}
                      </div>
                      {nVoci > 1 && <div className="tbl-muted">{nVoci} voci</div>}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.responsabile || <span className="text-xs text-warn">da assegnare</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {MESI[r.mese - 1]}
                      {anno > 0 ? "" : ` ${r.anno}`}
                      {r.serieTotale && (
                        <div className="tbl-muted">
                          {r.serieIndice}/{r.serieTotale}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.dataInvio ? new Date(r.dataInvio).toLocaleDateString("it-IT") : "—"}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="tbl-primary">{fmt(r.totale)}</div>
                      <div className="tbl-muted">
                        imp. {fmt(r.imponibile)}
                        {r.iva > 0 && ` · IGIC ${r.iva}%`}
                      </div>
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => toggle(r, "validazione")}
                        className={validata ? "pill-ok" : "pill-wait"}
                        title={
                          validata
                            ? "Validata: clicca per rimetterla in attesa"
                            : "Clicca quando è tutto ok per fatturare"
                        }
                      >
                        {validata ? <Check /> : <X />}
                        {validata ? "Ok invia" : "In attesa"}
                      </button>
                    </td>
                    {/* Un solo bottone, tre passi: non emessa → crea fattura → emessa */}
                    <td className="text-center">
                      {r.fatturaId ? (
                        <Link
                          href={`/finance/fatture/${r.fatturaId}`}
                          className="pill-ok"
                          title={`Emessa con la fattura ${r.fattura?.numero ?? ""}: clicca per aprirla`}
                        >
                          <Check /> Emessa
                        </Link>
                      ) : r.emessa ? (
                        <button
                          onClick={() => toggle(r, "emessa")}
                          className="pill-ok"
                          title="Segnata emessa a mano: clicca per annullare"
                        >
                          <Check /> Emessa
                        </button>
                      ) : validata ? (
                        <button
                          onClick={() => setCreaFattura(r)}
                          className="pill-wait"
                          title="Prepara la fattura con i dati di questa richiesta: non crea niente finché non confermi"
                        >
                          <FilePlus2 /> crea fattura
                        </button>
                      ) : (
                        <span
                          className="tag tag-soft-off"
                          title="Non ancora emessa: prima serve la validazione (colonna Validazione)"
                        >
                          <FileText /> Non emessa
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 text-gray-400 hover:text-gray-700"
                        title="Modifica"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {rows.length > 0 && (
        <PageNav
          total={rows.length}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          labelSuffix="richieste"
        />
      )}

      {/* ── Modal nuova / modifica ─────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editing ? `Modifica ${editing.codice}` : "Nuova richiesta di fattura"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {editing?.fatturaId && (
              <div className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2 border bg-ok/10 border-ok/30">
                <span className="text-gray-700">
                  Emessa con la fattura{" "}
                  <Link
                    href={`/finance/fatture/${editing.fatturaId}`}
                    className="font-semibold text-brand hover:underline"
                  >
                    {editing.fattura?.numero ?? "senza numero"}
                  </Link>
                </span>
                <button
                  onClick={() => scollega(editing)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-bad"
                  title="Stacca la fattura da questa richiesta (la fattura resta)"
                >
                  <Unlink className="w-3.5 h-3.5" /> Scollega
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Cliente</label>
                <select
                  value={form.clienteId}
                  onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">— nome libero —</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              {!form.clienteId ? (
                <div>
                  <label className={labelCls}>Nome cliente (non in anagrafica)</label>
                  <input
                    value={form.nomeCliente}
                    onChange={(e) => setForm((f) => ({ ...f, nomeCliente: e.target.value }))}
                    className={inputCls}
                    placeholder="Es. Studio Rossi"
                  />
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Contratto (opzionale)</label>
                  <select
                    value={form.contrattoId}
                    onChange={(e) => setForm((f) => ({ ...f, contrattoId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">— nessuno —</option>
                    {contratti
                      .filter((c) => String(c.clienteId) === form.clienteId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.numero} · {c.oggetto}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Responsabile commerciale</label>
                <input
                  value={form.responsabile}
                  onChange={(e) => setForm((f) => ({ ...f, responsabile: e.target.value }))}
                  className={inputCls}
                  placeholder="Chi segue il cliente"
                />
              </div>
              <div>
                <label className={labelCls}>Canale</label>
                <div className="flex gap-2">
                  {CANALI.map((a) => {
                    const active = form.azienda === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, azienda: a }))}
                        className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                        style={
                          active
                            ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" }
                            : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                        }
                      >
                        {canaleLabel(a)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Voci */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>Voci</label>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, voci: [...f.voci, { descrizione: "", importo: "" }] }))
                  }
                  className="text-xs font-semibold text-brand hover:text-brand flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Aggiungi voce
                </button>
              </div>
              <div className="space-y-2">
                {form.voci.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={v.descrizione}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          voci: f.voci.map((x, j) =>
                            j === i ? { ...x, descrizione: e.target.value } : x,
                          ),
                        }))
                      }
                      className={cn(inputCls, "flex-1")}
                      placeholder="Descrizione (es. Gestione social — Ottobre)"
                    />
                    <input
                      value={v.importo}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          voci: f.voci.map((x, j) => (j === i ? { ...x, importo: e.target.value } : x)),
                        }))
                      }
                      className={cn(inputCls, "w-32 text-right")}
                      placeholder="Importo"
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          voci: f.voci.length > 1 ? f.voci.filter((_, j) => j !== i) : f.voci,
                        }))
                      }
                      className="p-2 text-gray-400 hover:text-bad"
                      title="Rimuovi voce"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Tipo IVA</label>
                <div className="flex gap-2">
                  {[
                    { value: "igic_exenta", label: "IGIC Exenta" },
                    { value: "igic7", label: "IGIC 7%" },
                  ].map((o) => {
                    const active = form.tipoIva === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tipoIva: o.value }))}
                        className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                        style={
                          active
                            ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" }
                            : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                        }
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className={labelCls}>Mese di competenza</label>
                <select
                  value={form.mese}
                  onChange={(e) => setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))}
                  className={inputCls}
                >
                  {MESI.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Anno</label>
                <select
                  value={form.anno}
                  onChange={(e) => setForm((f) => ({ ...f, anno: parseInt(e.target.value) }))}
                  className={inputCls}
                >
                  {ANNI_FORM.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Data invio prevista</label>
                <input
                  type="date"
                  value={form.dataInvio}
                  onChange={(e) => setForm((f) => ({ ...f, dataInvio: e.target.value }))}
                  className={inputCls}
                />
              </div>
              {!editing && (
                <>
                  <div>
                    <label className={labelCls}>Ricorrenza</label>
                    <select
                      value={form.ricorrenza}
                      onChange={(e) => setForm((f) => ({ ...f, ricorrenza: e.target.value }))}
                      className={inputCls}
                    >
                      {RICORRENZE.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Numero richieste</label>
                    <input
                      type="number"
                      min={1}
                      max={36}
                      value={form.ripetizioni}
                      disabled={form.ricorrenza === "una_tantum"}
                      onChange={(e) => setForm((f) => ({ ...f, ripetizioni: e.target.value }))}
                      className={cn(inputCls, "disabled:opacity-50")}
                    />
                  </div>
                </>
              )}
            </div>

            <div>
              <label className={labelCls}>Note</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className={cn(inputCls, "min-h-[64px]")}
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-gray-100">
              <div className="text-sm text-gray-600">
                Imponibile <strong>{fmt(imponibileForm)}</strong>
                {ivaForm > 0 && <> · IGIC {ivaForm}%</>} · Totale{" "}
                <strong className="text-gray-900">{fmt(totaleForm)}</strong>
              </div>
              <div className="flex items-center gap-3">
                {!editing && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.autorizzaTutte}
                      onChange={(e) => setForm((f) => ({ ...f, autorizzaTutte: e.target.checked }))}
                    />
                    Autorizza subito l&apos;invio
                  </label>
                )}
                {editing && (
                  <button
                    onClick={() => del(editing)}
                    className="inline-flex items-center gap-1 text-sm text-bad hover:underline px-2 py-2"
                  >
                    <Trash2 className="w-4 h-4" /> Elimina
                  </button>
                )}
                <button
                  onClick={() => setShowForm(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
                >
                  Annulla
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="btn btn-primary disabled:opacity-60"
                >
                  {saving ? "Salvataggio…" : editing ? "Salva" : "Crea"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {creaFattura && (
        <CreaFatturaModal
          richiesta={creaFattura}
          onClose={() => setCreaFattura(null)}
          onCollega={() => {
            setCollega(creaFattura);
            setCreaFattura(null);
          }}
          onDone={(numero) => {
            setCreaFattura(null);
            notify(`Fattura ${numero} creata e collegata`);
            load();
          }}
        />
      )}
      {collega && (
        <CollegaModal
          richiesta={collega}
          onClose={() => setCollega(null)}
          onDone={() => {
            setCollega(null);
            notify("Fattura collegata");
            load();
          }}
        />
      )}
      {daContratto && (
        <DaContrattoModal
          contratti={contratti}
          onClose={() => setDaContratto(false)}
          onDone={(n) => {
            setDaContratto(false);
            notify(`${n} richieste generate dal contratto`);
            load();
          }}
        />
      )}
    </div>
  );
}

// ── Modal: crea fattura dalla richiesta ──────────────────────────────────
function CreaFatturaModal({
  richiesta,
  onClose,
  onCollega,
  onDone,
}: {
  richiesta: Richiesta;
  onClose: () => void;
  onCollega: () => void;
  onDone: (numero: string) => void;
}) {
  const oggi = new Date();
  const scad = new Date(oggi);
  scad.setDate(scad.getDate() + 30);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(toISODate(oggi));
  const [scadenza, setScadenza] = useState(toISODate(scad));
  const [metodo, setMetodo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/richieste-fattura/${richiesta.id}/crea-fattura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, data, scadenza, metodo }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Creazione non riuscita");
        return;
      }
      onDone(j.fattura?.numero ?? "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Crea fattura</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          <div className="font-semibold text-gray-900">{nomeCliente(richiesta)}</div>
          <div className="truncate">{richiesta.descrizione}</div>
          <div className="mt-1">
            {MESI[richiesta.mese - 1]} {richiesta.anno} · imponibile{" "}
            <strong>{fmt(richiesta.imponibile)}</strong>
            {richiesta.iva > 0 && <> · IGIC {richiesta.iva}%</>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Numero fattura</label>
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className={inputCls}
              placeholder="automatico (F2026…)"
            />
          </div>
          <div>
            <label className={labelCls}>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Scadenza</label>
            <input
              type="date"
              value={scadenza}
              onChange={(e) => setScadenza(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Metodo di pagamento</label>
            <input
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className={inputCls}
              placeholder="Es. Bonifico"
            />
          </div>
        </div>
        {err && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <p className="text-xs text-gray-400">
          La fattura viene creata nel registro Fatture con origine finance e collegata a questa
          richiesta. Potrai completarla da lì.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCollega}
            className="mr-auto inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-brand"
            title="La fattura esiste già nel registro: collegala invece di crearne una nuova"
          >
            <Link2 className="w-3.5 h-3.5" /> Collega a una esistente
          </button>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="btn btn-primary disabled:opacity-60"
          >
            {busy ? "Creazione…" : "Crea fattura"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: collega a fattura esistente ───────────────────────────────────
function CollegaModal({
  richiesta,
  onClose,
  onDone,
}: {
  richiesta: Richiesta;
  onClose: () => void;
  onDone: () => void;
}) {
  const [candidate, setCandidate] = useState<FatturaCandidata[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/richieste-fattura/${richiesta.id}/fatture-candidate`)
      .then((r) => r.json())
      .then((d) => setCandidate(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [richiesta.id]);

  const submit = async () => {
    if (!sel) return;
    const res = await fetch(`/api/richieste-fattura/${richiesta.id}/collega`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fatturaId: sel }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Collegamento non riuscito");
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Collega a una fattura</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Fatture non ancora collegate
          {richiesta.cliente ? ` di ${richiesta.cliente.nome}` : ` del ${richiesta.anno}`}.
        </p>
        <div className="flex-1 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
          {loading && <div className="p-4 text-sm text-gray-400">Caricamento…</div>}
          {!loading && candidate.length === 0 && (
            <div className="p-4 text-sm text-gray-400">Nessuna fattura disponibile.</div>
          )}
          {candidate.map((f) => (
            <label
              key={f.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50",
                sel === f.id && "bg-brand/10",
              )}
            >
              <input type="radio" name="fat" checked={sel === f.id} onChange={() => setSel(f.id)} />
              <span className="font-mono text-xs text-gray-500 w-20">{f.numero ?? "—"}</span>
              <span className="flex-1 truncate">{f.cliente?.nome ?? "(senza cliente)"}</span>
              <span className="text-xs text-gray-500">
                {MESI[f.mese - 1]?.slice(0, 3)} {f.anno}
              </span>
              <span className="font-semibold">{fmt(f.importo)}</span>
            </label>
          ))}
        </div>
        {err && <div className="text-sm text-bad">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={!sel}
            className="btn btn-primary disabled:opacity-60"
          >
            Collega
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: genera richieste da un contratto ──────────────────────────────
function DaContrattoModal({
  contratti,
  onClose,
  onDone,
}: {
  contratti: ContrattoMin[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [autorizza, setAutorizza] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const genera = async (c: ContrattoMin) => {
    setBusy(c.id);
    setErr(null);
    try {
      const res = await fetch("/api/richieste-fattura/da-contratto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrattoId: c.id, autorizzaTutte: autorizza }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Generazione non riuscita");
        return;
      }
      onDone(Array.isArray(j) ? j.length : 0);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Genera richieste da un contratto</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Crea una richiesta per ogni rata, a partire dal mese di decorrenza, più una per le voci
          una tantum. Non crea fatture.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={autorizza} onChange={(e) => setAutorizza(e.target.checked)} />
          Autorizza subito l&apos;invio di tutte le richieste
        </label>
        <div className="flex-1 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
          {contratti.length === 0 && (
            <div className="p-4 text-sm text-gray-400">Nessun contratto.</div>
          )}
          {contratti.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-gray-500 w-28">{c.numero}</span>
              <span className="flex-1 min-w-0">
                <span className="font-semibold text-gray-900">
                  {c.cliente?.nome ?? c.nomeClienteFallback ?? "(cliente da assegnare)"}
                </span>
                <span className="block text-xs text-gray-500 truncate">{c.oggetto}</span>
              </span>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {c.numeroRate} × {fmt(c.importoMensile)}
              </span>
              <button
                onClick={() => genera(c)}
                disabled={busy !== null}
                className="btn btn-primary text-xs disabled:opacity-60"
              >
                {busy === c.id ? "…" : "Genera"}
              </button>
            </div>
          ))}
        </div>
        {err && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}

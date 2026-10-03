"use client";

import { ExportBar, ExportButton } from "@/components/ExportBar";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Plus,
  XCircle,
} from "lucide-react";
import { fmt, paeseGruppo } from "@/lib/constants";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import ClienteFormModal, { type ClienteBase } from "@/components/crm/ClienteFormModal";
import SearchBox from "@/components/SearchBox";
import { cn, matchQ } from "@/lib/utils";

// Lista clienti come in Northstar: KPI, scheda filtri con ricerca e chip
// Stato/Paese, tabella ordinabile con stato Attivo/Inattivo e saldi,
// esporta CSV, stato vuoto.

interface Cliente extends ClienteBase {
  id: number;
  createdAt: string;
  fatture: {
    importo: number;
    pagato: boolean;
    anno: number;
    mese: number;
    data: string | null;
    acconti: { importo: number }[];
  }[];
  _count: { contatti: number; contratti: number };
}

type Ordine = "nome" | "data" | "fatturato" | "daIncassare";

const GIORNI_ATTIVO = 365; // fattura negli ultimi 12 mesi = cliente attivo
const GIORNI_NUOVO = 180; // creato da meno di 6 mesi senza fatture = ancora attivo

const stats = (c: Cliente) => {
  let fatturato = 0;
  let incassato = 0;
  let ultima: number | null = null;
  for (const f of c.fatture) {
    fatturato += f.importo;
    const acc = f.acconti.reduce((s, a) => s + a.importo, 0);
    incassato += f.pagato ? f.importo : Math.min(f.importo, acc);
    const t = f.data ? new Date(f.data).getTime() : new Date(f.anno, f.mese - 1, 1).getTime();
    if (ultima == null || t > ultima) ultima = t;
  }
  const giorno = 86400000;
  const attivo =
    (ultima != null && Date.now() - ultima < GIORNI_ATTIVO * giorno) ||
    (c.fatture.length === 0 && Date.now() - new Date(c.createdAt).getTime() < GIORNI_NUOVO * giorno);
  return {
    fatturato,
    incassato,
    daIncassare: Math.max(0, fatturato - incassato),
    n: c.fatture.length,
    ultima,
    attivo,
  };
};

const selectCls =
  "sel";


export default function ClientiPage() {
  const router = useRouter();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [exportMode, setExportMode] = useState(false);
  const [paese, setPaese] = useState("");
  const [stato, setStato] = useState<"" | "attivi" | "inattivi">("");
  const [soloSmh, setSoloSmh] = useState(false);
  const [ordine, setOrdine] = useState<Ordine>("nome");
  const [disc, setDisc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form, setForm] = useState<{ open: boolean; cliente: Cliente | null }>({ open: false, cliente: null });

  const load = useCallback(async () => {
    const data = await (await fetch("/api/clienti")).json();
    setClienti(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // Ogni cambio di filtro riparte dalla prima pagina
  const conReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const righe = useMemo(() => clienti.map((c) => ({ c, s: stats(c) })), [clienti]);

  const filtered = useMemo(() => {
    const rows = righe.filter(
      ({ c, s }) =>
        (!paese || paeseGruppo(c.paese) === paese) &&
        (!soloSmh || c.smh) &&
        (!stato || (stato === "attivi" ? s.attivo : !s.attivo)) &&
        matchQ(q, c.nome, c.email, c.partitaIva, c.citta, c.telefono),
    );
    const dir = disc ? -1 : 1;
    rows.sort((a, b) => {
      switch (ordine) {
        case "data":
          return dir * (new Date(a.c.createdAt).getTime() - new Date(b.c.createdAt).getTime());
        case "fatturato":
          return dir * (a.s.fatturato - b.s.fatturato);
        case "daIncassare":
          return dir * (a.s.daIncassare - b.s.daIncassare);
        default:
          return dir * a.c.nome.localeCompare(b.c.nome, "it");
      }
    });
    return rows;
  }, [righe, q, paese, stato, soloSmh, ordine, disc]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const tot = useMemo(() => {
    let attivi = 0;
    let daIncassare = 0;
    let fatturato = 0;
    for (const { s } of righe) {
      if (s.attivo) attivi++;
      daIncassare += s.daIncassare;
      fatturato += s.fatturato;
    }
    return { attivi, inattivi: righe.length - attivi, daIncassare, fatturato };
  }, [righe]);

  const filtriAttivi = [q.trim(), paese, stato, soloSmh].filter(Boolean).length;
  const azzera = () => {
    setQ("");
    setPaese("");
    setStato("");
    setSoloSmh(false);
    setPage(1);
  };

  const ordina = (col: Ordine) => {
    if (ordine === col) setDisc((d) => !d);
    else {
      setOrdine(col);
      setDisc(col !== "nome");
    }
  };
  const freccia = (col: Ordine) =>
    ordine === col && disc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />;


  const esportaCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Cliente", "P.IVA", "Email", "Telefono", "Paese", "Città", "Imposta", "Stato", "Fatturato", "Incassato", "Da incassare", "Creato il"];
    const lines = filtered.map(({ c, s }) =>
      [
        c.nome,
        c.partitaIva,
        c.email,
        c.telefono,
        c.paese,
        c.citta,
        c.tipoImposta,
        s.attivo ? "Attivo" : "Inattivo",
        s.fatturato.toFixed(2).replace(".", ","),
        s.incassato.toFixed(2).replace(".", ","),
        s.daIncassare.toFixed(2).replace(".", ","),
        new Date(c.createdAt).toLocaleDateString("it-IT"),
      ]
        .map(esc)
        .join(";"),
    );
    const blob = new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clienti_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const kpi = [
    { label: "Clienti totali", value: String(clienti.length), icon: Building2, color: "#3b82f6" },
    { label: "Attivi", value: String(tot.attivi), icon: CheckCircle2, color: "#22c55e" },
    { label: "Inattivi", value: String(tot.inattivi), icon: XCircle, color: "#9ca3af" },
    { label: "Da incassare", value: fmt(tot.daIncassare), icon: Clock, color: "#f59e0b" },
  ];

  const thCls = "text-[11px] font-semibold uppercase tracking-wide text-gray-500  whitespace-nowrap";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Clienti</h1>
          <p className="page-sub">
            {clienti.length} totali · {tot.attivi} attivi · {fmt(tot.fatturato)} fatturati
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton active={exportMode} onClick={() => setExportMode((v) => !v)} title="Scarica i clienti del filtro in CSV" />
          <button
            onClick={() => setForm({ open: true, cliente: null })}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> Nuovo cliente
          </button>
        </div>
      </div>

      <KpiGrid>
        {kpi.map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} icon={k.icon} iconColor={k.color} />
        ))}
      </KpiGrid>

      {/* Filtri */}
      <div className="glass-card rounded-2xl p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <SearchBox value={q} onChange={conReset(setQ)} placeholder="Cerca nome, P.IVA, email, città, telefono…" className="w-80" />
          <select value={ordine} onChange={(e) => {
              ordina(e.target.value as Ordine);
              setPage(1);
            }} className={selectCls} title="Ordina per">
            <option value="nome">Ordina: nome</option>
            <option value="data">Ordina: data creazione</option>
            <option value="fatturato">Ordina: fatturato</option>
            <option value="daIncassare">Ordina: da incassare</option>
          </select>
          <PageSizeSelect pageSize={pageSize} onChange={conReset(setPageSize)} />
          {filtriAttivi > 0 && (
            <button onClick={azzera} className="text-xs font-semibold text-brand hover:underline ml-auto">
              Azzera filtri ({filtriAttivi})
            </button>
          )}
        </div>
        <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
          <div className="chip-row">
            <span className="chip-label">Stato</span>
            {(
              [
                { v: "", l: "Tutti" },
                { v: "attivi", l: "Attivi", dot: "#22c55e" },
                { v: "inattivi", l: "Inattivi", dot: "#9ca3af" },
              ] as const
            ).map((o) => (
              <button key={o.v} onClick={() => conReset(setStato)(o.v)} className={cn("chip", stato === o.v && "active")}>
                {"dot" in o && <span className="kb-dot" style={{ background: stato === o.v ? "#fff" : o.dot }} />}
                {o.l}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <span className="chip-label">Paese</span>
            {["", "Italia", "Spagna", "Altri"].map((p) => (
              <button key={p} onClick={() => conReset(setPaese)(p)} className={cn("chip", paese === p && "active")}>
                {p || "Tutti"}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <span className="chip-label">Canale</span>
            <button onClick={() => conReset(setSoloSmh)(!soloSmh)} className={cn("chip", soloSmh && "active")} title="Clienti portati da Social Media House">
              Clienti SMH
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-box">
          <Building2 className="w-8 h-8" />
          <h3>{clienti.length === 0 ? "Nessun cliente" : "Nessun cliente con questi filtri"}</h3>
          <p>
            {clienti.length === 0
              ? "Inizia creando il primo cliente o convertendo un lead vinto."
              : "Prova ad allargare la ricerca o azzera i filtri."}
          </p>
          {clienti.length === 0 ? (
            <button
              onClick={() => setForm({ open: true, cliente: null })}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" /> Crea cliente
            </button>
          ) : (
            <button onClick={azzera} className="text-sm font-semibold text-brand hover:underline">
              Azzera filtri
            </button>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[860px]">
              <thead>
                <tr>
                  <th className={cn(thCls, "text-left th-sort", ordine === "data" && "active")} onClick={() => ordina("data")}>
                    Data {freccia("data")}
                  </th>
                  <th className={cn(thCls, "text-left th-sort", ordine === "nome" && "active")} onClick={() => ordina("nome")}>
                    Cliente {freccia("nome")}
                  </th>
                  <th className={cn(thCls, "text-left")}>Paese · Città</th>
                  <th className={cn(thCls, "text-left")}>Stato</th>
                  <th className={cn(thCls, "text-right th-sort", ordine === "fatturato" && "active")} onClick={() => ordina("fatturato")}>
                    Fatturato {freccia("fatturato")}
                  </th>
                  <th className={cn(thCls, "text-right")}>Incassato</th>
                  <th className={cn(thCls, "text-right th-sort", ordine === "daIncassare" && "active")} onClick={() => ordina("daIncassare")}>
                    Da incassare {freccia("daIncassare")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map(({ c, s }) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-50 hover:bg-brand/5 cursor-pointer"
                    onClick={() => router.push(`/crm/clienti/${c.id}`)}
                  >
                    <td className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    </td>
                    <td>
                      <Link
                        href={`/crm/clienti/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-brand hover:underline"
                      >
                        {c.nome}
                      </Link>
                      {c.smh && <span className="tag tag-neutral ml-1.5" title="Cliente portato da Social Media House">SMH</span>}
                      <div className="text-[11px] text-gray-400 truncate max-w-[260px]">
                        {c.partitaIva ?? "P.IVA mancante"}
                        {c.tipoImposta ? ` · ${c.tipoImposta}` : ""}
                        {c.email ? ` · ${c.email}` : ""}
                        {s.n > 0 && ` · ${s.n} fattur${s.n === 1 ? "a" : "e"}`}
                      </div>
                    </td>
                    <td className="whitespace-nowrap max-w-[200px] truncate">
                      {c.paese}
                      {c.citta && <span className="text-gray-400"> · {c.citta}</span>}
                    </td>
                    <td>
                      <span
                        className={cn("tag", s.attivo ? "pill-ok" : "pill-off")}
                        title={
                          s.ultima
                            ? `Ultima fattura: ${new Date(s.ultima).toLocaleDateString("it-IT")}`
                            : "Nessuna fattura"
                        }
                      >
                        {s.attivo ? "Attivo" : "Inattivo"}
                      </span>
                    </td>
                    <td className="font-semibold text-gray-900 text-right tabular-nums">{fmt(s.fatturato)}</td>
                    <td className="text-ok text-right tabular-nums">{fmt(s.incassato)}</td>
                    <td className={cn("px-4 py-3 text-sm text-right tabular-nums", s.daIncassare > 0 ? "text-warn font-semibold" : "text-gray-400")}>
                      {fmt(s.daIncassare)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {filtered.length > 0 && <PageNav total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="clienti" />}

      {form.open && (
        <ClienteFormModal
          cliente={form.cliente}
          onClose={() => setForm({ open: false, cliente: null })}
          onSaved={(c) => {
            setForm({ open: false, cliente: null });
            router.push(`/crm/clienti/${c.id}`);
          }}
        />
      )}
      {exportMode && (
        <ExportBar
          total={filtered.length}
          unit="clienti"
          maschile
          onClose={() => setExportMode(false)}
          groups={[{ actions: [{ label: "CSV", icon: <Download />, primary: true, onClick: esportaCsv }] }]}
        />
      )}
    </div>
  );
}

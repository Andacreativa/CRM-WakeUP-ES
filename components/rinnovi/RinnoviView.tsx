"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  FilePlus2,
  Globe,
  Plus,
  RefreshCw,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import { Kpi, KpiGrid } from "@/components/Kpi";
import Pills from "@/components/Pills";
import SearchBox from "@/components/SearchBox";
import RowMenu from "@/components/RowMenu";
import { ExportBar, ExportButton } from "@/components/ExportBar";
import { PageNav, PageSizeSelect } from "@/components/Pagination";
import { fmt, MESI } from "@/lib/constants";
import { dataIt } from "@/lib/fatture";
import { exportExcel } from "@/lib/export";
import { ricordaLista, riprendiLista } from "@/lib/lista-memo";
import { cn } from "@/lib/utils";
import type { ClienteMin } from "@/components/richieste/tipi";
import RinnovoFormModal from "./RinnovoFormModal";
import {
  type Rinnovo,
  ANTICIPO_GIORNI,
  STATI_RINNOVO,
  STATO_PILL,
  fatturazioneLabel,
  nomeClienteRinnovo,
  proprietaLabel,
  statoLabel,
  testoGiorni,
} from "./tipi";

// Rinnovi dei siti (Sales › Rinnovi siti): calendario delle scadenze dei
// domini con il prezzo di rinnovo. Da qui nasce la richiesta di fattura,
// che poi segue il flusso di «Richieste fattura».

const CHIAVE_LISTA = "rinnovi:lista";
type Vista = "" | "da_fatturare" | "senza_cliente";
const VISTE: { val: Vista; label: string }[] = [
  { val: "", label: "Tutti" },
  { val: "da_fatturare", label: "Da fatturare" },
  { val: "senza_cliente", label: "Senza cliente" },
];

// Pill della richiesta del ciclo in corso (stesse parole della scheda richiesta)
export function PillRichiesta({ r }: { r: Rinnovo["richiestaCorrente"] }) {
  if (!r) return null;
  const [cls, Icon, label] =
    r.stato === "incassata"
      ? ["pill-ok", Check, "Incassata"]
      : r.stato === "emessa"
        ? ["pill-ok", Check, "Emessa"]
        : r.stato === "da_fare"
          ? ["pill-info", FilePlus2, "Da fare"]
          : ["pill-wait", X, "Da validare"];
  return (
    <Link href={`/sales/richieste/${r.id}`} className={cls} title={`Richiesta ${r.codice}: apri`}>
      <Icon /> {label}
    </Link>
  );
}

export default function RinnoviView() {
  const [rows, setRows] = useState<Rinnovo[]>([]);
  const [clienti, setClienti] = useState<ClienteMin[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  const [vista, setVista] = useState<Vista>("");
  const [mese, setMese] = useState(0);
  const [stato, setStato] = useState("");
  const [clienteId, setClienteId] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Rinnovo | null>(null);
  const [esporta, setEsporta] = useState(false);
  const [busy, setBusy] = useState(false);

  const notify = (text: string, kind: "ok" | "err" = "ok") => {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 5000);
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (vista) params.set("vista", vista);
    if (mese) params.set("mese", String(mese));
    if (stato) params.set("stato", stato);
    if (clienteId) params.set("clienteId", String(clienteId));
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(`/api/rinnovi?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("load rinnovi", e);
    } finally {
      setLoading(false);
    }
  }, [vista, mese, stato, clienteId, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/clienti?min=1")
      .then((r) => r.json())
      .then((c) =>
        setClienti(
          (Array.isArray(c) ? c : [])
            .map((x: ClienteMin) => ({ id: x.id, nome: x.nome, paese: x.paese }))
            .sort((a: ClienteMin, b: ClienteMin) => a.nome.localeCompare(b.nome)),
        ),
      )
      .catch(() => {});
    // Tornando da una scheda, la lista si ritrova con gli stessi filtri
    const s = riprendiLista<{
      vista: Vista;
      mese: number;
      stato: string;
      clienteId: number;
      q: string;
      page: number;
      pageSize: number;
    }>(CHIAVE_LISTA);
    if (s) {
      setVista(s.vista ?? "");
      setMese(s.mese ?? 0);
      setStato(s.stato ?? "");
      setClienteId(s.clienteId ?? 0);
      setQ(s.q ?? "");
      setPageSize(s.pageSize ?? 20);
      setPage(s.page ?? 1);
    }
  }, []);
  const ricorda = () =>
    ricordaLista(CHIAVE_LISTA, { vista, mese, stato, clienteId, q, page, pageSize });
  const filtra =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  // KPI sul set filtrato
  const kpi = useMemo(() => {
    const prossimi = rows.filter((r) => r.giorni >= 0 && r.giorni <= 60 && r.fatturabile);
    return {
      prossimi: prossimi.length,
      prossimiImporto: prossimi.reduce((s, r) => s + r.importo, 0),
      daFatturare: rows.filter((r) => r.daFatturare).length,
      attivi: rows.filter((r) => r.stato === "attivo").length,
      annuo: rows.filter((r) => r.fatturabile).reduce((s, r) => s + r.importo, 0),
    };
  }, [rows]);

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  // ── Azioni ────────────────────────────────────────────────────────────
  const post = async (url: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(j.error ?? "Operazione non riuscita", "err");
        return null;
      }
      return j;
    } finally {
      setBusy(false);
    }
  };
  const creaRichiesta = async (r: Rinnovo) => {
    const j = await post(`/api/rinnovi/${r.id}/crea-richiesta`);
    if (j) {
      notify(`Richiesta ${j.codice} creata per ${r.dominio}: è in «Richieste fattura», da validare`);
      load();
    }
  };
  const rinnovato = async (r: Rinnovo) => {
    const d = new Date(r.scadenza);
    const prossima = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
    if (!confirm(`Segnare ${r.dominio} come rinnovato? La scadenza passa al ${dataIt(prossima)}.`))
      return;
    const j = await post(`/api/rinnovi/${r.id}/rinnovato`);
    if (j) {
      notify(`${r.dominio} rinnovato: prossima scadenza ${dataIt(j.scadenza)}`);
      load();
    }
  };
  const genera = async () => {
    const j = await post("/api/rinnovi/genera");
    if (!j) return;
    const n = j.create?.length ?? 0;
    notify(
      n
        ? `${n} richieste create: sono in «Richieste fattura», da validare`
        : `Niente da fare: i rinnovi entro ${ANTICIPO_GIORNI} giorni hanno già la richiesta`,
    );
    load();
  };

  const excel = () =>
    exportExcel(
      rows.map((r) => ({
        Dominio: r.dominio,
        Cliente: nomeClienteRinnovo(r),
        Scadenza: dataIt(r.scadenza),
        "Importo annuo": r.importo,
        Fatturazione: fatturazioneLabel(r.fatturazione),
        Stato: statoLabel(r.stato),
        Hosting: r.hosting ?? "",
        Proprietà: proprietaLabel(r.proprieta),
        "Richiesta fattura": r.richiestaCorrente?.codice ?? "",
        Note: r.note ?? "",
      })),
      `rinnovi-siti-${new Date().toISOString().slice(0, 10)}`,
    );

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={cn(
            "text-sm rounded-lg px-3 py-2 border",
            msg.kind === "ok" ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad",
          )}
        >
          {msg.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Rinnovi siti</h1>
          <p className="page-sub">
            Scadenze dei domini e prezzo di rinnovo: la richiesta di fattura nasce {ANTICIPO_GIORNI}{" "}
            giorni prima della scadenza
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton active={esporta} onClick={() => setEsporta((v) => !v)} />
          <button
            onClick={genera}
            disabled={busy}
            className="btn btn-secondary disabled:opacity-60"
            title={`Crea la richiesta di fattura per tutti i rinnovi entro ${ANTICIPO_GIORNI} giorni che non ce l'hanno (lo fa anche da solo ogni mattina)`}
          >
            <Sparkles className="w-4 h-4" /> Genera richieste
            {kpi.daFatturare > 0 && (
              <span className="ml-1 rounded-full bg-warn/15 text-warn text-[11px] font-bold px-1.5">
                {kpi.daFatturare}
              </span>
            )}
          </button>
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Nuovo rinnovo
          </button>
        </div>
      </div>

      {/* KPI */}
      <KpiGrid cols={4}>
        <Kpi
          label="In scadenza 60 gg"
          value={String(kpi.prossimi)}
          sub={fmt(kpi.prossimiImporto)}
          color="#111827"
        />
        <Kpi
          label="Da fatturare"
          value={String(kpi.daFatturare)}
          sub={`entro ${ANTICIPO_GIORNI} gg, senza richiesta`}
          color="#f59e0b"
          onClick={() => filtra(setVista)(vista === "da_fatturare" ? "" : "da_fatturare")}
          title="Mostra solo i rinnovi da fatturare"
        />
        <Kpi label="Attivi" value={String(kpi.attivi)} sub={`${rows.length} nel filtro`} color="#22c55e" />
        <Kpi label="Importo annuo" value={fmt(kpi.annuo)} sub="rinnovi a parte, siti attivi" color="#e8308a" />
      </KpiGrid>

      {/* Filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={filtra(setQ)} placeholder="Cerca dominio, cliente, hosting…" className="w-64" />
        <Pills value={vista} onChange={filtra(setVista)} options={VISTE} />
        <select value={mese} onChange={(e) => filtra(setMese)(parseInt(e.target.value))} className="sel">
          <option value={0}>Tutti i mesi</option>
          {MESI.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select value={stato} onChange={(e) => filtra(setStato)(e.target.value)} className="sel">
          <option value="">Tutti gli stati</option>
          {STATI_RINNOVO.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={clienteId}
          onChange={(e) => filtra(setClienteId)(parseInt(e.target.value))}
          className="sel"
        >
          <option value={0}>Tutti i clienti</option>
          {clienti.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <PageSizeSelect pageSize={pageSize} onChange={filtra(setPageSize)} />
      </div>

      {/* Tabella */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl min-w-[900px]">
            <thead>
              <tr>
                <th>Dominio</th>
                <th>Cliente</th>
                <th>Scadenza</th>
                <th className="text-right">Importo annuo</th>
                <th>Hosting</th>
                <th>Stato</th>
                <th>Fattura</th>
                <th className="w-10" />
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
                  <td colSpan={8} className="text-center text-gray-400 py-10">
                    <Globe className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                    Nessun rinnovo per i filtri scelti
                  </td>
                </tr>
              )}
              {paged.map((r) => (
                <tr key={r.id} className={cn(r.stato === "non_attivo" && "text-gray-400")}>
                  <td>
                    {/* Il dominio apre la scheda, dove stanno le azioni */}
                    <Link
                      href={`/sales/rinnovi/${r.id}`}
                      onClick={ricorda}
                      className="tbl-primary text-brand hover:underline"
                      title="Apri la scheda del rinnovo"
                    >
                      {r.dominio}
                    </Link>
                  </td>
                  <td className="max-w-[220px]">
                    {r.cliente ? (
                      <>
                        <div className="truncate" title={r.cliente.nome}>
                          {r.cliente.nome}
                        </div>
                        {r.cliente.smh && <span className="tag tag-brand">SMH</span>}
                      </>
                    ) : r.nomeCliente ? (
                      <>
                        <div className="truncate" title={`${r.nomeCliente} — non in anagrafica: assegnalo dalla scheda`}>
                          {r.nomeCliente}
                        </div>
                        <span className="text-xs text-warn">da assegnare</span>
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="tbl-primary">{dataIt(r.scadenza)}</div>
                    <div
                      className={cn(
                        "tbl-muted",
                        r.stato !== "non_attivo" && r.giorni < 0 && "text-bad",
                        r.stato !== "non_attivo" && r.giorni >= 0 && r.giorni <= ANTICIPO_GIORNI && "text-warn",
                      )}
                    >
                      {testoGiorni(r.giorni)}
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {r.importo > 0 ? (
                      <div className="tbl-primary">{fmt(r.importo)}</div>
                    ) : (
                      <div className="text-gray-400">—</div>
                    )}
                    {r.fatturazione !== "rinnovo" && (
                      <div className="tbl-muted">{fatturazioneLabel(r.fatturazione).toLowerCase()}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <div>{r.hosting || <span className="text-gray-400">—</span>}</div>
                    <div className="tbl-muted">proprietà {proprietaLabel(r.proprieta).toLowerCase()}</div>
                  </td>
                  <td>
                    <span className={STATO_PILL[r.stato] ?? "pill-off"}>{statoLabel(r.stato)}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.richiestaCorrente ? (
                      <PillRichiesta r={r.richiestaCorrente} />
                    ) : r.daFatturare ? (
                      <button
                        onClick={() => creaRichiesta(r)}
                        disabled={busy}
                        className="pill-wait"
                        title="Crea la richiesta di fattura per questa scadenza"
                      >
                        <FilePlus2 /> crea richiesta
                      </button>
                    ) : (
                      <span
                        className="text-gray-400"
                        title={
                          r.fatturabile
                            ? `La richiesta nasce da sola ${ANTICIPO_GIORNI} giorni prima della scadenza`
                            : fatturazioneLabel(r.fatturazione)
                        }
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td>
                    <RowMenu>
                      {(chiudi) => (
                        <>
                          {!r.richiestaCorrente && (r.clienteId || r.nomeCliente) && r.importo > 0 && (
                            <button
                              className="menu-item"
                              onClick={() => {
                                chiudi();
                                creaRichiesta(r);
                              }}
                            >
                              <FilePlus2 /> Crea richiesta fattura
                            </button>
                          )}
                          <button
                            className="menu-item"
                            onClick={() => {
                              chiudi();
                              rinnovato(r);
                            }}
                          >
                            <RefreshCw /> Rinnovato (+12 mesi)
                          </button>
                          <div className="menu-sep" />
                          <button
                            className="menu-item"
                            onClick={() => {
                              chiudi();
                              setEdit(r);
                            }}
                          >
                            <Pencil /> Modifica
                          </button>
                        </>
                      )}
                    </RowMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {rows.length > 0 && (
        <PageNav total={rows.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="rinnovi" />
      )}

      {esporta && (
        <ExportBar
          total={rows.length}
          unit="rinnovi"
          maschile
          importo={fmt(rows.reduce((s, r) => s + r.importo, 0))}
          groups={[{ actions: [{ label: "Excel", onClick: excel, primary: true }] }]}
          onClose={() => setEsporta(false)}
        />
      )}

      {(showForm || edit) && (
        <RinnovoFormModal
          rinnovo={edit}
          clienti={clienti}
          onClose={() => {
            setShowForm(false);
            setEdit(null);
          }}
          onSaved={(testo) => {
            setShowForm(false);
            setEdit(null);
            notify(testo);
            load();
          }}
          onDeleted={
            edit
              ? () => {
                  setEdit(null);
                  notify("Rinnovo eliminato");
                  load();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

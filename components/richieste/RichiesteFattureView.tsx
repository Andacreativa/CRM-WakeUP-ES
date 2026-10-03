"use client";

import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  X,
  FileSignature,
  FileText,
  FilePlus2,
  Check,
  Receipt,
} from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import { cn } from "@/lib/utils";
import { ricordaLista, riprendiLista } from "@/lib/lista-memo";
import RichiestaFormModal from "./RichiestaFormModal";
import { CreaFatturaModal, CollegaModal, DaContrattoModal } from "./modali";
import {
  type ClienteMin,
  type ContrattoMin,
  type Richiesta,
  STATI_RICHIESTA,
  nomeCliente,
  parseVoci,
} from "./tipi";

// Richieste di fattura (Sales › Richieste fattura): validazione ed emissione,
// con le colonne di «Fatture da emettere» di Northstar. Il nome del cliente
// apre la scheda della richiesta, dove stanno le azioni.

const CHIAVE_LISTA = "richieste:lista";
const selectCls = "sel";

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
    // Tornando da una scheda, la lista si ritrova con gli stessi filtri
    const s = riprendiLista<{
      mese: number;
      clienteId: number;
      stato: string;
      q: string;
      page: number;
      pageSize: number;
    }>(CHIAVE_LISTA);
    if (s) {
      setMese(s.mese ?? 0);
      setClienteId(s.clienteId ?? 0);
      setStato(s.stato ?? "");
      setQ(s.q ?? "");
      setPageSize(s.pageSize ?? 20);
      setPage(s.page ?? 1);
    }
  }, []);
  const ricorda = () => ricordaLista(CHIAVE_LISTA, { mese, clienteId, stato, q, page, pageSize });
  // Ogni filtro riporta alla prima pagina
  const filtra =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  useEffect(() => {
    setPage(1);
  }, [anno]);

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
            onClick={() => setShowForm(true)}
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
        <SearchBox value={q} onChange={filtra(setQ)} placeholder="Cerca cliente, descrizione, codice…" className="w-64" />
        <select value={mese} onChange={(e) => filtra(setMese)(parseInt(e.target.value))} className={selectCls}>
          <option value={0}>Tutti i mesi</option>
          {MESI.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={clienteId}
          onChange={(e) => filtra(setClienteId)(parseInt(e.target.value))}
          className={selectCls}
        >
          <option value={0}>Tutti i clienti</option>
          {clienti.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select value={stato} onChange={(e) => filtra(setStato)(e.target.value)} className={selectCls}>
          {STATI_RICHIESTA.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <PageSizeSelect pageSize={pageSize} onChange={filtra(setPageSize)} />
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
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-400">
                    Caricamento…
                  </td>
                </tr>
              )}
              {!loading && paged.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-400">
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
                      {/* Il cliente apre la scheda della richiesta (come il numero delle fatture) */}
                      <Link
                        href={`/sales/richieste/${r.id}`}
                        onClick={ricorda}
                        className="tbl-primary text-brand hover:underline"
                        title="Apri la richiesta"
                      >
                        {nomeCliente(r)}
                      </Link>
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

      {showForm && (
        <RichiestaFormModal
          richiesta={null}
          annoDefault={anno}
          clienti={clienti}
          contratti={contratti}
          onClose={() => setShowForm(false)}
          onSaved={(testo) => {
            setShowForm(false);
            notify(testo);
            load();
          }}
        />
      )}
      {creaFattura && (
        <CreaFatturaModal
          richiesta={creaFattura}
          onClose={() => setCreaFattura(null)}
          onCollega={() => {
            setCollega(creaFattura);
            setCreaFattura(null);
          }}
          onDone={(f) => {
            setCreaFattura(null);
            notify(
              f.numero
                ? `Fattura ${f.numero} creata e collegata`
                : "Bozza di fattura creata: si emette dal suo pannello",
            );
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

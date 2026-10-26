"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  Copy,
  FileText,
  Link2,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Kpi, KpiGrid } from "@/components/Kpi";
import Pills from "@/components/Pills";
import SearchBox from "@/components/SearchBox";
import RowMenu from "@/components/RowMenu";
import { ExportBar, ExportButton } from "@/components/ExportBar";
import { PageNav, PageSizeSelect } from "@/components/Pagination";
import { fmt } from "@/lib/constants";
import { dataIt } from "@/lib/fatture";
import { exportExcel } from "@/lib/export";
import { ricordaLista, riprendiLista } from "@/lib/lista-memo";
import { cn } from "@/lib/utils";
import { mascheraIban } from "@/lib/sepa";
import { MESI_L } from "@/lib/abbonamenti-testi";
import AbbonamentoFormModal from "./AbbonamentoFormModal";
import {
  type Abbonamento,
  PRODOTTI,
  STATO_ABB_PILL,
  STATO_ADDEBITO_PILL,
  nomeProdotto,
  statoAbbonamentoLabel,
  statoAddebitoLabel,
  tipoIvaLabel,
} from "./tipi";

// Abbonamenti boogo / cobrea (Sales › Abbonamenti): chi ha sottoscritto,
// con quale piano e a che prezzo, se è attivo e com'è andato l'ultimo
// addebito. Gli addebiti e il fichero per la banca stanno in Finance ›
// Addebiti SEPA.

const CHIAVE_LISTA = "abbonamenti:lista";
type Vista = "" | "attivi" | "da_firmare" | "sospesi" | "cancellati" | "devoluciones" | "nuovi";
const VISTE: { val: Vista; label: string }[] = [
  { val: "", label: "Tutti" },
  { val: "attivi", label: "Attivi" },
  { val: "da_firmare", label: "Da firmare" },
  { val: "sospesi", label: "Sospesi" },
  { val: "devoluciones", label: "Con devoluciones" },
  { val: "nuovi", label: "Nuovi (30 gg)" },
  { val: "cancellati", label: "Cancellati" },
];

export const meseBreve = (d: string | null | undefined) => {
  if (!d) return "—";
  const x = new Date(d);
  return `${MESI_L.it[x.getUTCMonth()].slice(0, 3)} ${x.getUTCFullYear()}`;
};

export function PillAddebito({ a }: { a: Abbonamento["ultimoAddebito"] }) {
  if (!a) return <span className="text-gray-400">—</span>;
  return (
    <span className={STATO_ADDEBITO_PILL[a.stato] ?? "pill-off"} title={`${MESI_L.it[a.mese - 1]} ${a.anno} · ${fmt(a.importo)}`}>
      {statoAddebitoLabel(a.stato)}
    </span>
  );
}

export async function copia(testo: string) {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    return false;
  }
}

export default function AbbonamentiView() {
  const [rows, setRows] = useState<Abbonamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [vista, setVista] = useState<Vista>("");
  const [prodotto, setProdotto] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Abbonamento | null>(null);
  const [esporta, setEsporta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkModulo, setLinkModulo] = useState(false);

  const notify = (text: string, kind: "ok" | "err" = "ok") => {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 7000);
  };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (prodotto) params.set("prodotto", prodotto);
    if (q.trim()) params.set("q", q.trim());
    if (vista === "da_firmare" || vista === "devoluciones" || vista === "nuovi") params.set("vista", vista);
    if (vista === "attivi") params.set("stato", "attivo");
    if (vista === "sospesi") params.set("stato", "sospeso");
    if (vista === "cancellati") params.set("stato", "cancellato");
    try {
      const res = await fetch(`/api/abbonamenti?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("load abbonamenti", e);
    } finally {
      setLoading(false);
    }
  }, [prodotto, q, vista]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const s = riprendiLista<{ vista: Vista; prodotto: string; q: string; page: number; pageSize: number }>(CHIAVE_LISTA);
    if (s) {
      setVista(s.vista ?? "");
      setProdotto(s.prodotto ?? "");
      setQ(s.q ?? "");
      setPageSize(s.pageSize ?? 20);
      setPage(s.page ?? 1);
    }
  }, []);
  const ricorda = () => ricordaLista(CHIAVE_LISTA, { vista, prodotto, q, page, pageSize });
  const filtra =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  // I KPI contano tutto (non il filtro): servono gli attivi anche quando si
  // guardano i cancellati, quindi arrivano da una lettura a parte
  const [tutti, setTutti] = useState<Abbonamento[]>([]);
  useEffect(() => {
    fetch("/api/abbonamenti")
      .then((r) => r.json())
      .then((d) => setTutti(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [rows]);
  const kpi = useMemo(() => {
    const attivi = tutti.filter((a) => a.stato === "attivo");
    const limite = Date.now() - 30 * 86_400_000;
    return {
      attivi: attivi.length,
      mrr: attivi.reduce((s, a) => s + a.totale, 0),
      imponibile: attivi.reduce((s, a) => s + a.prezzo, 0),
      daFirmare: tutti.filter((a) => a.stato === "in_attesa").length,
      nuovi: tutti.filter((a) => new Date(a.createdAt).getTime() >= limite).length,
      devoluciones: tutti.filter((a) => a.devoluciones > 0).length,
      sospesi: tutti.filter((a) => a.stato === "sospeso").length,
    };
  }, [tutti]);

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  // ── Azioni ────────────────────────────────────────────────────────────
  const chiama = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
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
  const stato = async (a: Abbonamento, s: "attivo" | "sospeso" | "cancellato") => {
    const testo =
      s === "sospeso"
        ? `Sospendere ${a.intestatario}? Niente addebiti finché non lo riattivi.`
        : s === "cancellato"
          ? `Cancellare l'abbonamento di ${a.intestatario}? Vale fino a fine mese: gli addebiti dei mesi dopo si annullano.`
          : `Riattivare ${a.intestatario}?`;
    if (!confirm(testo)) return;
    const j = await chiama(`/api/abbonamenti/${a.id}/stato`, "POST", { stato: s });
    if (j) {
      notify(`${a.intestatario}: ${statoAbbonamentoLabel(s).toLowerCase()}`);
      load();
    }
  };
  const inviaLink = async (a: Abbonamento) => {
    const j = await chiama(`/api/abbonamenti/${a.id}/invia-link`, "POST");
    if (j) {
      notify(j.invio?.inviata ? `Link di firma mandato a ${j.invio.a}` : `Link non inviato: ${j.invio?.errore ?? "posta non configurata"}. Copialo dal menu.`, j.invio?.inviata ? "ok" : "err");
      load();
    }
  };
  const copiaLink = async (a: Abbonamento) => {
    if (!a.linkFirma) return;
    const link = a.linkFirma.startsWith("http") ? a.linkFirma : `${window.location.origin}${a.linkFirma}`;
    notify((await copia(link)) ? `Link di firma copiato: ${link}` : link);
  };
  const reinviaConferma = async (a: Abbonamento) => {
    if (!confirm(`Rimandare contratto e mandato in PDF a ${a.email}?`)) return;
    const j = await chiama(`/api/abbonamenti/${a.id}/invia-conferma`, "POST");
    if (j) notify(j.cliente?.inviata ? `Inviato a ${j.cliente.a}` : `Non inviato: ${j.cliente?.errore ?? "posta non configurata"}`, j.cliente?.inviata ? "ok" : "err");
  };
  const elimina = async (a: Abbonamento) => {
    if (!confirm(`Eliminare l'abbonamento ${a.codice} di ${a.intestatario}? Addebiti e fatture già nati restano.`)) return;
    await fetch(`/api/abbonamenti/${a.id}`, { method: "DELETE" });
    notify("Abbonamento eliminato");
    load();
  };

  const excel = () =>
    exportExcel(
      rows.map((a) => ({
        Codice: a.codice,
        Intestatario: a.intestatario,
        NIF: a.nif ?? "",
        Email: a.email,
        Telefono: a.telefono ?? "",
        Prodotto: nomeProdotto(a.prodotto),
        Piano: a.pianoNome,
        "Imponibile/mese": a.prezzo,
        Imposta: tipoIvaLabel(a.tipoIva),
        "Totale/mese": a.totale,
        Stato: statoAbbonamentoLabel(a.stato),
        "Primo addebito": meseBreve(a.dataInizio),
        "Titolare conto": a.titolareConto,
        IBAN: a.iban,
        BIC: a.bic ?? "",
        Mandato: a.mandatoRef,
        "Firmato il": a.mandatoFirmatoIl ? dataIt(a.mandatoFirmatoIl) : "",
        Cliente: a.cliente?.nome ?? "",
        Note: a.note ?? "",
      })),
      `abbonamenti-${new Date().toISOString().slice(0, 10)}`,
    );

  return (
    <div className="space-y-6">
      {msg && (
        <div className={cn("text-sm rounded-lg px-3 py-2 border break-all", msg.kind === "ok" ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad")}>
          {msg.text}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Abbonamenti</h1>
          <p className="page-sub">Chi ha sottoscritto Boogo e Cobrea: piano, prezzo, mandato SEPA e stato. Gli addebiti mensili sono in Finance › Addebiti SEPA</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap relative">
          <ExportButton active={esporta} onClick={() => setEsporta((v) => !v)} />
          <button onClick={() => setLinkModulo((v) => !v)} className={cn("btn", linkModulo ? "btn-primary" : "btn-secondary")} title="Indirizzi del modulo pubblico di sottoscrizione">
            <Link2 className="w-4 h-4" /> Link del modulo
          </button>
          {linkModulo && (
            <div className="absolute right-0 top-11 z-20 glass-card rounded-xl p-3 w-[380px] space-y-2 shadow-lg">
              <p className="text-[11px] text-gray-500">Da mettere nei siti: il cliente sceglie Base o Medium, mette i dati e l&apos;IBAN e firma. Pro si crea da qui con «Nuovo abbonamento».</p>
              {PRODOTTI.map((p) => {
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}/suscripcion/${p.value}`;
                return (
                  <div key={p.value} className="flex items-center gap-2">
                    <code className="text-[12px] flex-1 truncate bg-gray-50 rounded px-2 py-1">{url}</code>
                    <button className="btn btn-secondary btn-sm" onClick={async () => notify((await copia(url)) ? `Copiato: ${url}` : url)}>
                      <Copy className="w-3.5 h-3.5" /> Copia
                    </button>
                    <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer">
                      Apri
                    </a>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Nuovo abbonamento
          </button>
        </div>
      </div>

      <KpiGrid cols={4}>
        <Kpi label="Attivi" value={String(kpi.attivi)} sub={`${kpi.sospesi} sospesi`} color="#22c55e" icon={Users} onClick={() => filtra(setVista)(vista === "attivi" ? "" : "attivi")} />
        <Kpi label="Ricorrente mensile" value={fmt(kpi.mrr)} sub={`${fmt(kpi.imponibile)} imponibile`} color="#e8308a" />
        <Kpi label="Da firmare" value={String(kpi.daFirmare)} sub="link inviato, mandato in attesa" color="#f59e0b" onClick={() => filtra(setVista)(vista === "da_firmare" ? "" : "da_firmare")} />
        <Kpi label="Nuovi 30 giorni" value={String(kpi.nuovi)} sub={kpi.devoluciones ? `${kpi.devoluciones} con devoluciones` : "nessuna devolución"} color="#111827" onClick={() => filtra(setVista)(vista === "nuovi" ? "" : "nuovi")} />
      </KpiGrid>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={filtra(setQ)} placeholder="Cerca intestatario, email, NIF, mandato…" className="w-64" />
        <Pills value={vista} onChange={filtra(setVista)} options={VISTE} />
        <select value={prodotto} onChange={(e) => filtra(setProdotto)(e.target.value)} className="sel">
          <option value="">Boogo e Cobrea</option>
          {PRODOTTI.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <PageSizeSelect pageSize={pageSize} onChange={filtra(setPageSize)} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl min-w-[980px]">
            <thead>
              <tr>
                <th>Intestatario</th>
                <th>Prodotto · piano</th>
                <th className="text-right">Al mese</th>
                <th>Stato</th>
                <th>Dal</th>
                <th>Conto e mandato</th>
                <th>Ultimo addebito</th>
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
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                    Nessun abbonamento per i filtri scelti
                  </td>
                </tr>
              )}
              {paged.map((a) => (
                <tr key={a.id} className={cn(a.stato === "cancellato" && "text-gray-400")}>
                  <td className="max-w-[260px]">
                    <Link href={`/sales/abbonamenti/${a.id}`} onClick={ricorda} className="tbl-primary text-brand hover:underline block truncate" title="Apri la scheda">
                      {a.intestatario}
                    </Link>
                    <div className="tbl-muted truncate">
                      {a.codice} · {a.email}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="tbl-primary">{nomeProdotto(a.prodotto)}</div>
                    <div className="tbl-muted">{a.pianoNome}</div>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="tbl-primary">{fmt(a.totale)}</div>
                    <div className="tbl-muted">{fmt(a.prezzo)} + {tipoIvaLabel(a.tipoIva)}</div>
                  </td>
                  <td>
                    <span className={STATO_ABB_PILL[a.stato] ?? "pill-off"}>{statoAbbonamentoLabel(a.stato)}</span>
                    {a.devoluciones > 0 && <div className="tbl-muted text-bad">{a.devoluciones} devuelto{a.devoluciones > 1 ? "s" : ""}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="tbl-primary">{meseBreve(a.dataInizio)}</div>
                    {a.dataFine && <div className="tbl-muted">fino a {meseBreve(a.dataFine)}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="tbl-primary font-mono text-[12px]">{a.iban ? mascheraIban(a.iban) : "—"}</div>
                    <div className="tbl-muted">{a.mandatoFirmatoIl ? `firmato ${dataIt(a.mandatoFirmatoIl)}` : "mandato da firmare"}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    <PillAddebito a={a.ultimoAddebito} />
                    {a.ultimoAddebito && <div className="tbl-muted">{MESI_L.it[a.ultimoAddebito.mese - 1].slice(0, 3)} {a.ultimoAddebito.anno}</div>}
                  </td>
                  <td>
                    <RowMenu>
                      {(chiudi) => (
                        <>
                          <Link href={`/sales/abbonamenti/${a.id}`} onClick={ricorda} className="menu-item">
                            <FileText /> Apri scheda
                          </Link>
                          <button className="menu-item" onClick={() => { chiudi(); setEdit(a); }}>
                            <Pencil /> Modifica
                          </button>
                          {a.stato === "in_attesa" && (
                            <>
                              <div className="menu-sep" />
                              <button className="menu-item" onClick={() => { chiudi(); inviaLink(a); }} disabled={busy}>
                                <Mail /> Manda il link di firma
                              </button>
                              <button className="menu-item" onClick={() => { chiudi(); copiaLink(a); }}>
                                <Copy /> Copia il link di firma
                              </button>
                            </>
                          )}
                          {a.mandatoFirmatoIl && (
                            <>
                              <div className="menu-sep" />
                              <a className="menu-item" href={`/api/abbonamenti/${a.id}/mandato`} target="_blank" rel="noreferrer" onClick={chiudi}>
                                <FileText /> PDF contratto e mandato
                              </a>
                              <button className="menu-item" onClick={() => { chiudi(); reinviaConferma(a); }} disabled={busy}>
                                <Mail /> Rimanda contratto al cliente
                              </button>
                            </>
                          )}
                          <div className="menu-sep" />
                          {a.stato === "attivo" && (
                            <button className="menu-item" onClick={() => { chiudi(); stato(a, "sospeso"); }}>
                              <Pause /> Sospendi
                            </button>
                          )}
                          {(a.stato === "sospeso" || a.stato === "cancellato") && a.mandatoFirmatoIl && (
                            <button className="menu-item" onClick={() => { chiudi(); stato(a, "attivo"); }}>
                              <Play /> Riattiva
                            </button>
                          )}
                          {(a.stato === "attivo" || a.stato === "sospeso") && (
                            <button className="menu-item" onClick={() => { chiudi(); stato(a, "cancellato"); }}>
                              <Ban /> Cancella (fine mese)
                            </button>
                          )}
                          <button className="menu-item text-bad" onClick={() => { chiudi(); elimina(a); }}>
                            <Trash2 /> Elimina
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
      {rows.length > 0 && <PageNav total={rows.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="abbonamenti" />}

      {esporta && (
        <ExportBar
          total={rows.length}
          unit="abbonamenti"
          maschile
          importo={fmt(rows.filter((a) => a.stato === "attivo").reduce((s, a) => s + a.totale, 0))}
          groups={[{ actions: [{ label: "Excel", onClick: excel, primary: true }] }]}
          onClose={() => setEsporta(false)}
        />
      )}

      {(showForm || edit) && (
        <AbbonamentoFormModal
          abbonamento={edit}
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
          onDeleted={edit ? () => { setEdit(null); notify("Abbonamento eliminato"); load(); } : undefined}
        />
      )}
    </div>
  );
}

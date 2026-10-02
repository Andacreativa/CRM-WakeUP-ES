"use client";

import SearchBox from "@/components/SearchBox";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  Check,
  Settings2,
  Info,
  Landmark,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import { fmt, MESI, CATEGORIE_SPESA, CATEGORIE_COLORI, BRAND } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { cn } from "@/lib/utils";
import {
  STATO_MOVIMENTO_LABEL,
  type StatoMovimento,
  type Suggerimento,
} from "@/lib/banca-shared";
import ImportEstrattoModal from "./ImportEstrattoModal";

// Vista "Banca": estratto conto BBVA importato, uscite da trasformare in
// Spese (o da abbinare a spese già registrate, stipendi compresi),
// esclusi, entrate (abbinamento alle fatture in Fase 4), importazioni e
// regole.

interface SpesaMin {
  id: number;
  categoria: string;
  fornitore: string;
  descrizione: string | null;
  importo: number;
  mese: number;
  anno: number;
  pagamentoMensile: { voce: string; dipendente: { nome: string; cognome: string | null } } | null;
}
interface Abbinamento {
  id: number;
  importo: number;
  spesa: SpesaMin | null;
  fattura: { id: number; numero: string | null; importo: number; cliente: { nome: string } | null } | null;
  acconto: { id: number; importo: number; fatturaId: number } | null;
  altroIngresso: { id: number; fonte: string; importo: number; categoria: string | null } | null;
}
interface Movimento {
  id: number;
  importId: number;
  dataContabile: string;
  codice: string | null;
  concetto: string;
  beneficiario: string | null;
  osservazioni: string | null;
  importo: number;
  saldo: number | null;
  stato: StatoMovimento;
  nota: string | null;
  abbinamenti: Abbinamento[];
  suggerimento: Suggerimento | null;
  import: { id: number; nomeFile: string; createdAt: string };
}
interface Importazione {
  id: number;
  banca: string;
  nomeFile: string;
  conto: string | null;
  periodoDa: string | null;
  periodoA: string | null;
  righeLette: number;
  righeNuove: number;
  righeDuplicate: number;
  createdAt: string;
  movimenti: number;
  collegati: number;
}
// Scelte dell'utente per una riga da rivedere (precompilate dal suggerimento)
interface Edit {
  categoria: string;
  fornitore: string;
  fornitoreId: number | null;
  descrizione: string;
  candidatoId: number; // 0 = crea una nuova spesa
  dipendenteId: number | null; // rimborsi/benefit: persona del registro
}

type Vista = "movimenti" | "importazioni";
type Tipo = "uscite" | "entrate";
type FiltroStato = "da_abbinare" | "collegati" | "escluso" | "";

const selectCls =
  "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30";
const inputCls =
  "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-gray-50 disabled:text-gray-400";
const thCls = "text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-3";

const data = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("it-IT", { timeZone: "UTC" }) : "—";
const dataBreve = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
const meseDi = (iso: string) => new Date(iso).getUTCMonth() + 1;
const testoDi = (m: Movimento) =>
  [m.concetto, m.beneficiario, m.osservazioni].filter(Boolean).join(" ").toLowerCase();
const collegato = (m: Movimento) => m.stato === "abbinato" || m.stato === "spesa_creata";
const editDaSuggerimento = (s: Suggerimento): Edit => ({
  categoria: s.categoria,
  fornitore: s.fornitore,
  fornitoreId: s.fornitoreId,
  descrizione: s.descrizione,
  candidatoId: s.candidati[0] && s.candidati[0].punteggio >= 50 ? s.candidati[0].id : 0,
  dipendenteId: s.dipendenteId,
});
const CON_REGISTRO = new Set(["Rimborsi", "Benefit"]);

function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { val: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {options.map((o) => {
        const active = o.val === value;
        return (
          <button
            key={o.val}
            type="button"
            onClick={() => onChange(o.val)}
            className="text-sm px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
            style={active ? { background: BRAND, color: "#fff" } : { color: "#6b7280" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CategoriaBadge({ categoria }: { categoria: string }) {
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-md text-gray-700"
      style={{ background: CATEGORIE_COLORI[categoria] || "#EDEDED" }}
    >
      {categoria}
    </span>
  );
}

export default function BancaView() {
  const { anno } = useAnno();
  const [vista, setVista] = useState<Vista>("movimenti");
  const [tipo, setTipo] = useState<Tipo>("uscite");
  const [stato, setStato] = useState<FiltroStato>("da_abbinare");
  const [mese, setMese] = useState(0);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Movimento[]>([]);
  const [importazioni, setImportazioni] = useState<Importazione[]>([]);
  const [fornitori, setFornitori] = useState<{ id: number; nome: string }[]>([]);
  const [persone, setPersone] = useState<{ id: number; nome: string }[]>([]);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showImport, setShowImport] = useState(false);

  const notify = useCallback((kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), kind === "ok" ? 4000 : 7000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        fetch(`/api/banca/movimenti?anno=${anno}`).then((r) => r.json()),
        fetch("/api/banca/importazioni").then((r) => r.json()),
      ]);
      const list: Movimento[] = Array.isArray(m) ? m : [];
      setRows(list);
      setImportazioni(Array.isArray(i) ? i : []);
      setEdits((prev) => {
        const next: Record<number, Edit> = {};
        for (const r of list) {
          if (r.suggerimento) next[r.id] = prev[r.id] ?? editDaSuggerimento(r.suggerimento);
        }
        return next;
      });
      setSel(new Set());
    } finally {
      setLoading(false);
    }
  }, [anno]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetch("/api/fornitori")
      .then((r) => r.json())
      .then((j) => setFornitori(Array.isArray(j) ? j.map((f) => ({ id: f.id, nome: f.nome })) : []))
      .catch(() => {});
    fetch("/api/dipendenti?attivi=1")
      .then((r) => r.json())
      .then((j) =>
        setPersone(
          Array.isArray(j)
            ? j.map((d) => ({ id: d.id, nome: `${d.nome}${d.cognome ? ` ${d.cognome}` : ""}` }))
            : [],
        ),
      )
      .catch(() => {});
  }, []);

  // ── Derivati ──
  const uscite = useMemo(() => rows.filter((r) => r.importo < 0), [rows]);
  const entrate = useMemo(() => rows.filter((r) => r.importo > 0), [rows]);
  const kpi = useMemo(() => {
    const daRivedere = uscite.filter((r) => r.stato === "da_abbinare");
    const collegate = uscite.filter(collegato);
    const somma = (a: Movimento[]) => a.reduce((t, r) => t + Math.abs(r.importo), 0);
    return {
      daRivedere: daRivedere.length,
      daRivedereTot: somma(daRivedere),
      collegate: collegate.length,
      collegateTot: somma(collegate),
      entrate: entrate.length,
      entrateTot: somma(entrate),
      ultimo: importazioni[0] ?? null,
    };
  }, [uscite, entrate, importazioni]);

  const visibili = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tipo === "uscite" ? r.importo >= 0 : r.importo <= 0) return false;
      if (stato === "collegati" && !collegato(r)) return false;
      if (stato && stato !== "collegati" && r.stato !== stato) return false;
      if (mese > 0 && meseDi(r.dataContabile) !== mese) return false;
      if (ql && !testoDi(r).includes(ql)) return false;
      return true;
    });
  }, [rows, tipo, stato, mese, q]);
  const totaleVisibili = visibili.reduce((t, r) => t + r.importo, 0);
  const selezionabili = visibili.filter((r) => r.stato === "da_abbinare");

  // ── Azioni ──
  const sostituisci = (m: Movimento) => setRows((rs) => rs.map((r) => (r.id === m.id ? m : r)));

  const setEdit = (id: number, patch: Partial<Edit>) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const cambiaFornitore = (id: number, nome: string) => {
    const match = fornitori.find((f) => f.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    setEdit(id, { fornitore: nome, fornitoreId: match?.id ?? null });
  };

  // Crea la spesa oppure abbina alla spesa scelta. Ritorna l'errore o null.
  const applica = async (r: Movimento): Promise<string | null> => {
    const e = edits[r.id];
    if (!e) return "Riga senza dati";
    const headers = { "Content-Type": "application/json" };
    const res = e.candidatoId
      ? await fetch(`/api/banca/movimenti/${r.id}/abbina`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            spesaIds: [e.candidatoId],
            // spesa storica da registrare come rimborso/benefit della persona
            ...(CON_REGISTRO.has(e.categoria) &&
            e.dipendenteId &&
            !r.suggerimento?.candidati.find((c) => c.id === e.candidatoId)?.registro
              ? { registraCome: e.categoria === "Rimborsi" ? "rimborsi" : "benefit", dipendenteId: e.dipendenteId }
              : {}),
          }),
        })
      : await fetch(`/api/banca/movimenti/${r.id}/crea-spesa`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            categoria: e.categoria,
            fornitore: e.fornitore,
            fornitoreId: e.fornitoreId,
            descrizione: e.descrizione,
            dipendenteId: CON_REGISTRO.has(e.categoria) ? e.dipendenteId : null,
          }),
        });
    const j = await res.json();
    if (!res.ok) return j.error || "Errore";
    sostituisci(j);
    return null;
  };

  const patch = async (r: Movimento, body: Record<string, unknown>): Promise<string | null> => {
    const res = await fetch(`/api/banca/movimenti/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) return j.error || "Errore";
    sostituisci(j);
    return null;
  };

  const singolo = async (r: Movimento) => {
    setBusy(`#${r.id}`);
    const err = await applica(r);
    setBusy(null);
    if (err) notify("err", err);
    else {
      const e = edits[r.id];
      notify("ok", e?.candidatoId ? "Movimento abbinato alla spesa esistente" : "Spesa creata dal movimento");
      // le spese appena usate non sono più candidate per le altre righe
      await load();
    }
  };

  const azioneSingola = async (r: Movimento, body: Record<string, unknown>, okText: string) => {
    setBusy(`#${r.id}`);
    const err = await patch(r, body);
    setBusy(null);
    if (err) notify("err", err);
    else {
      notify("ok", okText);
      if (body.azione === "scollega" || body.azione === "ripristina") await load();
    }
  };

  const inBlocco = async (fn: (r: Movimento) => Promise<string | null>, verbo: string) => {
    const ids = Array.from(sel);
    if (!ids.length) return;
    let ok = 0;
    const errori: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const r = rows.find((x) => x.id === ids[i]);
      if (!r || r.stato !== "da_abbinare") continue;
      setBusy(`${verbo} ${i + 1}/${ids.length}…`);
      const err = await fn(r);
      if (err) errori.push(`${data(r.dataContabile)} ${fmt(r.importo)}: ${err}`);
      else ok++;
    }
    setBusy(null);
    setSel(new Set());
    await load();
    if (errori.length) notify("err", `${ok} ok, ${errori.length} non riusciti. ${errori.slice(0, 3).join(" · ")}`);
    else notify("ok", `${ok} movimenti ${verbo.toLowerCase()}`);
  };

  const toggleSel = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleTutti = () =>
    setSel((s) =>
      s.size === selezionabili.length ? new Set() : new Set(selezionabili.map((r) => r.id)),
    );

  const eliminaImport = async (imp: Importazione) => {
    if (!confirm(`Eliminare l'importazione "${imp.nomeFile}" e i suoi ${imp.movimenti} movimenti?`)) return;
    const res = await fetch(`/api/banca/importazioni/${imp.id}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) notify("err", j.error || "Errore");
    else {
      notify("ok", "Importazione eliminata");
      await load();
    }
  };

  // ── Render ──
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

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Banca</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Estratto conto BBVA{kpi.ultimo?.conto ? ` · ${kpi.ultimo.conto}` : ""}
            {anno > 0 ? ` · ${anno}` : " · tutti gli anni"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Pills
            value={vista}
            onChange={setVista}
            options={[
              { val: "movimenti", label: "Movimenti" },
              { val: "importazioni", label: "Importazioni" },
            ]}
          />
          <Link
            href="/impostazioni/banca"
            className="glass-btn-secondary flex items-center gap-1.5 text-gray-700 text-sm font-medium px-3 py-2 rounded-xl"
            title="Regole di categoria e memoria beneficiari"
          >
            <Settings2 className="w-4 h-4" /> Regole
          </Link>
          <button
            onClick={() => setShowImport(true)}
            className="glass-btn-primary flex items-center gap-1.5 text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            <Upload className="w-4 h-4" /> Importa estratto
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Uscite da rivedere",
            value: String(kpi.daRivedere),
            sub: fmt(kpi.daRivedereTot),
            color: "#e8308a",
          },
          {
            label: "Uscite collegate",
            value: String(kpi.collegate),
            sub: fmt(kpi.collegateTot),
            color: "#22c55e",
          },
          { label: "Entrate", value: String(kpi.entrate), sub: fmt(kpi.entrateTot), color: "#3b82f6" },
          {
            label: "Ultimo import",
            value: kpi.ultimo ? data(kpi.ultimo.createdAt) : "—",
            sub: kpi.ultimo
              ? `${data(kpi.ultimo.periodoDa)} – ${data(kpi.ultimo.periodoA)}`
              : "nessun estratto caricato",
            color: "#374151",
          },
        ].map((k) => (
          <div key={k.label} className="glass-card rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: k.color }}>
              {k.value}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {vista === "importazioni" && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Caricato il", "File", "Periodo", "Lette", "Nuove", "Già presenti", "Collegati", ""].map(
                    (h, i) => (
                      <th key={i} className={cn(thCls, i >= 3 && i <= 6 && "text-right")}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="zebra">
                {importazioni.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      <Landmark className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                      Nessun estratto caricato
                    </td>
                  </tr>
                )}
                {importazioni.map((imp) => (
                  <tr key={imp.id} className="border-b border-gray-50">
                    <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {new Date(imp.createdAt).toLocaleString("it-IT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm font-medium text-gray-900 max-w-[320px] truncate" title={imp.nomeFile}>
                        {imp.nomeFile}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {imp.banca}
                        {imp.conto ? ` · ${imp.conto}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {data(imp.periodoDa)} – {data(imp.periodoA)}
                    </td>
                    <td className="px-3 py-3 text-sm text-right">{imp.righeLette}</td>
                    <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{imp.righeNuove}</td>
                    <td className="px-3 py-3 text-sm text-right text-gray-500">{imp.righeDuplicate}</td>
                    <td className="px-3 py-3 text-sm text-right text-gray-700">
                      {imp.collegati}/{imp.movimenti}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => eliminaImport(imp)}
                        disabled={imp.collegati > 0}
                        className="p-1 text-gray-400 hover:text-bad disabled:opacity-30 disabled:hover:text-gray-400"
                        title={
                          imp.collegati > 0
                            ? "Ha movimenti collegati a spese: scollegali prima"
                            : "Elimina importazione e movimenti"
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vista === "movimenti" && (
        <>
          {/* Filtri */}
          <div className="flex items-center gap-2 flex-wrap">
            <SearchBox value={q} onChange={setQ} placeholder="Cerca beneficiario, concetto…" className="w-64" />
            <Pills
              value={tipo}
              onChange={(v) => {
                setTipo(v);
                setSel(new Set());
              }}
              options={[
                { val: "uscite", label: "Uscite" },
                { val: "entrate", label: "Entrate" },
              ]}
            />
            <Pills
              value={stato}
              onChange={(v) => {
                setStato(v);
                setSel(new Set());
              }}
              options={[
                { val: "da_abbinare", label: "Da rivedere" },
                { val: "collegati", label: "Collegati" },
                { val: "escluso", label: "Esclusi" },
                { val: "", label: "Tutti" },
              ]}
            />
            <select value={mese} onChange={(e) => setMese(parseInt(e.target.value))} className={selectCls}>
              <option value={0}>Tutti i mesi</option>
              {MESI.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
              {visibili.length} movimenti · {fmt(totaleVisibili)}
            </span>
          </div>

          {tipo === "entrate" && (
            <div className="flex items-start gap-2 text-sm text-info bg-info/10 border border-info/30 rounded-lg px-3 py-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              Le entrate sono salvate e pronte: l&apos;abbinamento alle fatture e agli altri ingressi arriva
              con la riconciliazione (prossima fase). Intanto puoi escludere i movimenti che non sono incassi.
            </div>
          )}

          {/* Barra selezione */}
          {tipo === "uscite" && stato === "da_abbinare" && selezionabili.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-gray-500">
                {sel.size > 0 ? `${sel.size} selezionati` : "Seleziona le righe per agire in blocco"}
              </span>
              <button
                onClick={() => inBlocco(applica, "Applicati")}
                disabled={!sel.size || !!busy}
                className="glass-btn-primary flex items-center gap-1.5 text-white font-medium px-3 py-1.5 rounded-xl disabled:opacity-50"
              >
                {busy && !busy.startsWith("#") ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {busy && !busy.startsWith("#") ? busy : "Applica proposte"}
              </button>
              <button
                onClick={() => inBlocco((r) => patch(r, { azione: "escludi" }), "Esclusi")}
                disabled={!sel.size || !!busy}
                className="glass-btn-secondary flex items-center gap-1.5 text-gray-700 font-medium px-3 py-1.5 rounded-xl disabled:opacity-50"
              >
                <Ban className="w-4 h-4" /> Escludi
              </button>
            </div>
          )}

          <datalist id="fornitori-banca">
            {fornitori.map((f) => (
              <option key={f.id} value={f.nome} />
            ))}
          </datalist>

          {/* Tabella */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {tipo === "uscite" && stato === "da_abbinare" && (
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={selezionabili.length > 0 && sel.size === selezionabili.length}
                          onChange={toggleTutti}
                          className="accent-pink-600"
                        />
                      </th>
                    )}
                    <th className={thCls}>Data</th>
                    <th className={thCls}>Movimento</th>
                    <th className={cn(thCls, "text-right")}>Importo</th>
                    {tipo === "uscite" && stato === "da_abbinare" ? (
                      <>
                        <th className={thCls}>Categoria e fornitore</th>
                        <th className={thCls}>Proposta</th>
                      </>
                    ) : (
                      <>
                        <th className={thCls}>Stato</th>
                        <th className={thCls}>Collegato a / nota</th>
                      </>
                    )}
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody className="zebra">
                  {loading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                        Caricamento…
                      </td>
                    </tr>
                  )}
                  {!loading && visibili.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                        <Landmark className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                        {rows.length === 0
                          ? "Nessun movimento: importa un estratto BBVA."
                          : "Nessun movimento per i filtri scelti."}
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    visibili.map((r) => {
                      const e = edits[r.id];
                      const s = r.suggerimento;
                      const daRivedere = r.stato === "da_abbinare";
                      const editing = tipo === "uscite" && stato === "da_abbinare";
                      const candidato = e?.candidatoId
                        ? s?.candidati.find((c) => c.id === e.candidatoId)
                        : undefined;
                      const occupato = busy === `#${r.id}`;
                      return (
                        <tr key={r.id} className="border-b border-gray-50 align-top">
                          {editing && (
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={sel.has(r.id)}
                                onChange={() => toggleSel(r.id)}
                                className="accent-pink-600"
                              />
                            </td>
                          )}
                          <td className="px-3 py-3 text-xs text-gray-700 whitespace-nowrap">
                            {dataBreve(r.dataContabile)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm font-semibold text-gray-900 max-w-[260px] truncate" title={r.beneficiario ?? r.concetto}>
                              {r.beneficiario ?? r.concetto}
                            </div>
                            <div
                              className="text-xs text-gray-500 max-w-[260px] truncate"
                              title={[r.concetto, r.osservazioni].filter(Boolean).join(" · ")}
                            >
                              {r.beneficiario ? `${r.concetto} · ` : ""}
                              {r.osservazioni ?? ""}
                            </div>
                          </td>
                          <td
                            className={cn(
                              "px-3 py-3 text-right text-sm font-semibold whitespace-nowrap",
                              r.importo < 0 ? "text-bad" : "text-ok",
                            )}
                          >
                            {fmt(r.importo)}
                          </td>

                          {editing ? (
                            <>
                              <td className="px-3 py-3">
                                {candidato ? (
                                  <div className="space-y-1">
                                    <CategoriaBadge categoria={candidato.categoria} />
                                    <div className="text-sm text-gray-700">{candidato.fornitore}</div>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5 min-w-[190px]">
                                    <select
                                      value={e?.categoria ?? ""}
                                      onChange={(ev) => setEdit(r.id, { categoria: ev.target.value })}
                                      className={inputCls}
                                    >
                                      {CATEGORIE_SPESA.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      list="fornitori-banca"
                                      value={e?.fornitore ?? ""}
                                      onChange={(ev) => cambiaFornitore(r.id, ev.target.value)}
                                      placeholder="Fornitore"
                                      className={inputCls}
                                    />
                                    {e && CON_REGISTRO.has(e.categoria) && (
                                      <select
                                        value={e.dipendenteId ?? 0}
                                        onChange={(ev) =>
                                          setEdit(r.id, { dipendenteId: parseInt(ev.target.value) || null })
                                        }
                                        className={cn(inputCls, e.dipendenteId && "border-ok/30 bg-ok/10")}
                                        title="Persona del registro pagamenti"
                                      >
                                        <option value={0}>Registro: nessuna persona</option>
                                        {persone.map((d) => (
                                          <option key={d.id} value={d.id}>
                                            Registro: {d.nome}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                    {((s && s.origine !== "default") || e?.fornitoreId) && (
                                      <div className="text-[10px] text-gray-400">
                                        {s && s.origine !== "default"
                                          ? `categoria da ${s.origine === "memoria" ? "memoria" : "regola"}`
                                          : ""}
                                        {s && s.origine !== "default" && e?.fornitoreId ? " · " : ""}
                                        {e?.fornitoreId ? "fornitore in anagrafica" : ""}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3 min-w-[230px] max-w-[280px]">
                                {s && s.candidati.length > 0 ? (
                                  <>
                                    <select
                                      value={e?.candidatoId ?? 0}
                                      onChange={(ev) => setEdit(r.id, { candidatoId: parseInt(ev.target.value) })}
                                      className={cn(inputCls, e?.candidatoId && "border-ok/30 bg-ok/10")}
                                    >
                                      <option value={0}>Crea nuova spesa</option>
                                      {s.candidati.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          Abbina a #{c.id} · {MESI[c.mese - 1].slice(0, 3)} {c.anno}
                                          {c.stessoMese ? "" : " (altro mese)"} · {c.registro ?? c.fornitore}
                                        </option>
                                      ))}
                                    </select>
                                    {candidato && (
                                      <div className="text-[10px] text-ok mt-0.5 truncate" title={candidato.descrizione ?? undefined}>
                                        {candidato.registro ? "Già nel registro pagamenti" : "Già registrata in Spese"}
                                        {candidato.descrizione ? ` · ${candidato.descrizione}` : ""}
                                        {!candidato.registro && e && CON_REGISTRO.has(e.categoria) && e.dipendenteId
                                          ? ` · entra nel registro come ${e.categoria.toLowerCase()} di ${persone.find((d) => d.id === e.dipendenteId)?.nome ?? "persona"}`
                                          : ""}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-gray-400">Nessuna spesa simile: ne crea una nuova</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span
                                  className={cn(
                                    "text-[11px] font-semibold px-2 py-0.5 rounded-md",
                                    collegato(r) && "pill-ok",
                                    r.stato === "escluso" && "pill-off",
                                    daRivedere && "pill-wait",
                                  )}
                                >
                                  {STATO_MOVIMENTO_LABEL[r.stato]}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                {r.abbinamenti.map((a) => (
                                  <div key={a.id} className="text-xs text-gray-700 flex items-center gap-1.5 flex-wrap">
                                    {a.spesa && (
                                      <>
                                        <CategoriaBadge categoria={a.spesa.categoria} />
                                        <span className="font-medium">{a.spesa.fornitore}</span>
                                        <span className="text-gray-400">
                                          {fmt(a.spesa.importo)} · {MESI[a.spesa.mese - 1].slice(0, 3)} {a.spesa.anno}
                                          {a.spesa.pagamentoMensile ? " · registro" : ""}
                                        </span>
                                      </>
                                    )}
                                    {a.fattura && (
                                      <span>
                                        Fattura {a.fattura.numero ?? `#${a.fattura.id}`}
                                        {a.fattura.cliente ? ` · ${a.fattura.cliente.nome}` : ""} · {fmt(a.importo)}
                                      </span>
                                    )}
                                    {a.acconto && <span>Acconto fattura #{a.acconto.fatturaId} · {fmt(a.importo)}</span>}
                                    {a.altroIngresso && (
                                      <span>
                                        Altro ingresso {a.altroIngresso.fonte} · {fmt(a.importo)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {r.nota && <div className="text-xs text-gray-500">{r.nota}</div>}
                                {!r.abbinamenti.length && !r.nota && <span className="text-xs text-gray-400">—</span>}
                              </td>
                            </>
                          )}

                          <td className="px-3 py-3 whitespace-nowrap text-right">
                            {occupato ? (
                              <Loader2 className="w-4 h-4 animate-spin text-brand inline" />
                            ) : editing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => singolo(r)}
                                  disabled={!!busy}
                                  className="glass-btn-primary flex items-center gap-1 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" /> {e?.candidatoId ? "Abbina" : "Crea spesa"}
                                </button>
                                <button
                                  onClick={() => azioneSingola(r, { azione: "escludi" }, "Movimento escluso")}
                                  disabled={!!busy}
                                  className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-50"
                                  title="Escludi (non è una spesa)"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              </div>
                            ) : collegato(r) ? (
                              <button
                                onClick={() =>
                                  azioneSingola(
                                    r,
                                    { azione: "scollega" },
                                    "Scollegato. La spesa resta in Spese: cancellala da lì se non serve.",
                                  )
                                }
                                disabled={!!busy}
                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                              >
                                <Unlink className="w-3.5 h-3.5" /> Scollega
                              </button>
                            ) : r.stato === "escluso" ? (
                              <button
                                onClick={() => azioneSingola(r, { azione: "ripristina" }, "Movimento ripristinato")}
                                disabled={!!busy}
                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Ripristina
                              </button>
                            ) : (
                              <button
                                onClick={() => azioneSingola(r, { azione: "escludi" }, "Movimento escluso")}
                                disabled={!!busy}
                                className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                              >
                                <Ban className="w-3.5 h-3.5" /> Escludi
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showImport && <ImportEstrattoModal onClose={() => setShowImport(false)} onImported={load} />}
    </div>
  );
}

"use client";

import Pills from "@/components/Pills";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  Check,
  Settings2,
  Landmark,
  Loader2,
  RotateCcw,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import { fmt, MESI, CATEGORIE_SPESA, CATEGORIE_COLORI, CATEGORIE_INGRESSO } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { cn } from "@/lib/utils";
import {
  STATO_MOVIMENTO_LABEL,
  type CategoriaAltroIngresso,
  type FatturaCandidata,
  type StatoMovimento,
  type Suggerimento,
  type SuggerimentoEntrata,
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
  entrata: SuggerimentoEntrata | null;
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

// Scelte dell'utente per un'entrata da rivedere
interface EditEntrata {
  fattureIds: number[]; // fatture da incassare (nell'ordine di assegnazione)
  altro: CategoriaAltroIngresso | ""; // il resto (o tutto) come altro ingresso
  extra: FatturaCandidata[]; // fatture aggiunte a mano dalla ricerca
  cerca: string;
  risultati: FatturaCandidata[];
}
const editEntrataDa = (e: SuggerimentoEntrata): EditEntrata => ({
  fattureIds: [...e.proposti],
  altro: e.altro ?? "",
  extra: [],
  cerca: "",
  risultati: [],
});
const CATEGORIE_ALTRO = CATEGORIE_INGRESSO.filter((c) => c.value !== "ritenuta_commerciale");

type Vista = "movimenti" | "importazioni";
type Tipo = "uscite" | "entrate";
type FiltroStato = "da_abbinare" | "collegati" | "escluso" | "";

const selectCls = "sel";
const inputCls = "sel sel-sm w-full min-w-0 disabled:bg-gray-50 disabled:text-gray-400";
const thCls = "text-left ";

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


function CategoriaBadge({ categoria }: { categoria: string }) {
  return (
    <span className="tag" style={{ background: CATEGORIE_COLORI[categoria] || "#EDEDED", color: "#1f2937" }}>
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
  const [editsE, setEditsE] = useState<Record<number, EditEntrata>>({});
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
      setEditsE((prev) => {
        const next: Record<number, EditEntrata> = {};
        for (const r of list) {
          if (r.entrata) next[r.id] = prev[r.id] ?? editEntrataDa(r.entrata);
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
  // Uscite "da rivedere": la tabella mostra gli abbinamenti da confermare
  const inRevisione = tipo === "uscite" && stato === "da_abbinare";
  // Entrate "da rivedere": fatture da incassare o altro ingresso
  const inRevisioneE = tipo === "entrate" && stato === "da_abbinare";
  const revisione = inRevisione || inRevisioneE;

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

  // ── Entrate ──
  const setEditE = (id: number, patch: Partial<EditEntrata>) =>
    setEditsE((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const toggleFatturaE = (id: number, fid: number) =>
    setEditsE((all) => {
      const e = all[id];
      if (!e) return all;
      const ids = e.fattureIds.includes(fid) ? e.fattureIds.filter((x) => x !== fid) : [...e.fattureIds, fid];
      return { ...all, [id]: { ...e, fattureIds: ids } };
    });
  const cercaFattureE = async (id: number, q: string) => {
    setEditE(id, { cerca: q });
    if (q.trim().length < 2) {
      setEditE(id, { risultati: [] });
      return;
    }
    const res = await fetch(`/api/banca/fatture?q=${encodeURIComponent(q.trim())}&anno=${anno || new Date().getFullYear()}`);
    const j = await res.json();
    setEditE(id, { risultati: Array.isArray(j) ? j.slice(0, 6) : [] });
  };
  const aggiungiFatturaE = (id: number, f: FatturaCandidata) =>
    setEditsE((all) => {
      const e = all[id];
      if (!e) return all;
      const extra = e.extra.some((x) => x.id === f.id) ? e.extra : [...e.extra, f];
      const fattureIds = e.fattureIds.includes(f.id) ? e.fattureIds : [...e.fattureIds, f.id];
      return { ...all, [id]: { ...e, extra, fattureIds, cerca: "", risultati: [] } };
    });
  // Candidati mostrati per un'entrata: proposte + aggiunte a mano
  const candidatiE = (r: Movimento): FatturaCandidata[] => {
    const e = editsE[r.id];
    const base = r.entrata?.candidati ?? [];
    const tutti = [...base, ...(e?.extra ?? []).filter((x) => !base.some((b) => b.id === x.id))];
    const scelti = new Set(e?.fattureIds ?? []);
    return [...tutti.filter((c) => scelti.has(c.id)), ...tutti.filter((c) => !scelti.has(c.id))];
  };
  const quotaDi = (c: FatturaCandidata) => (c.residuo > 0 ? c.residuo : c.importo);
  // Incassa (fatture e/o altro ingresso) oppure esclude se è un giroconto. Ritorna l'errore o null.
  const applicaEntrata = async (r: Movimento): Promise<string | null> => {
    const e = editsE[r.id];
    if (r.entrata?.escludi && (!e || (!e.fattureIds.length && !e.altro))) return patch(r, { azione: "escludi" });
    if (!e || (!e.fattureIds.length && !e.altro)) return "Scegli almeno una fattura o un altro ingresso";
    const res = await fetch(`/api/banca/movimenti/${r.id}/incassa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fatture: e.fattureIds.map((id) => ({ id })),
        ...(e.altro ? { altroIngresso: { categoria: e.altro } } : {}),
      }),
    });
    const j = await res.json();
    if (!res.ok) return j.error || "Errore";
    sostituisci(j);
    return null;
  };
  // In blocco: solo le proposte certe (numero citato o cliente+importo che quadrano, giroconti, cashback…)
  const applicaEntrataCerta = async (r: Movimento): Promise<string | null> => {
    if (!r.entrata?.certo && !r.entrata?.escludi) return "proposta da confermare a mano";
    return applicaEntrata(r);
  };
  const singoloEntrata = async (r: Movimento) => {
    setBusy(`#${r.id}`);
    const err = await applicaEntrata(r);
    setBusy(null);
    if (err) notify("err", err);
    else {
      notify("ok", r.entrata?.escludi && !editsE[r.id]?.fattureIds.length ? "Movimento escluso" : "Bonifico incassato");
      await load();
    }
  };
  const cellaEntrata = (r: Movimento) => {
    const ent = r.entrata;
    const e = editsE[r.id];
    if (!ent || !e) return <span className="text-xs text-gray-400">—</span>;
    const lista = candidatiE(r);
    const giaAssegnato = r.abbinamenti.reduce((t, a) => t + a.importo, 0);
    const daAssegnare = Math.round((r.importo - giaAssegnato) * 100) / 100;
    const scelte = lista.filter((c) => e.fattureIds.includes(c.id));
    let resta = daAssegnare;
    const assegnato = scelte.reduce((t, c) => {
      const q = Math.min(quotaDi(c), Math.max(0, resta));
      resta = Math.round((resta - q) * 100) / 100;
      return t + q;
    }, 0);
    return (
      <div className="space-y-1">
        {giaAssegnato > 0 && (
          <div className="tag tag-soft-warn">Assegnati {fmt(giaAssegnato)} · restano {fmt(daAssegnare)}</div>
        )}
        {lista.length > 0 && (
          <div className="space-y-0.5">
            {lista.slice(0, 4).map((c) => {
              const on = e.fattureIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={cn("flex items-center gap-2 text-xs rounded-md px-1.5 py-0.5 cursor-pointer", on ? "bg-ok/10" : "hover:bg-gray-50")}
                  title={c.motivi.length ? `Indizi: ${c.motivi.join(", ")}` : undefined}
                >
                  <input type="checkbox" checked={on} onChange={() => toggleFatturaE(r.id, c.id)} className="accent-pink-600" />
                  <span className="tbl-primary whitespace-nowrap">{c.numero ?? "s.n."}</span>
                  <span className="truncate text-gray-700">{c.cliente}</span>
                  <span className="ml-auto tabular-nums whitespace-nowrap font-medium text-gray-900">{fmt(quotaDi(c))}</span>
                  {c.pagato ? (
                    <span className="tag tag-neutral">già incassata</span>
                  ) : c.incassato > 0 ? (
                    <span className="tag tag-soft-warn">residuo</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}
        <div className="relative">
          <input
            value={e.cerca}
            onChange={(ev) => cercaFattureE(r.id, ev.target.value)}
            placeholder={lista.length ? "Aggiungi un'altra fattura: numero o cliente…" : "Cerca la fattura: numero o cliente…"}
            className="sel sel-sm w-full"
          />
          {e.risultati.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {e.risultati.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => aggiungiFatturaE(r.id, f)}
                  className="w-full flex items-center gap-2 text-xs px-2 py-1.5 hover:bg-gray-50 text-left"
                >
                  <span className="tbl-primary whitespace-nowrap">{f.numero ?? "s.n."}</span>
                  <span className="truncate">{f.cliente}</span>
                  <span className="ml-auto tabular-nums whitespace-nowrap">{fmt(quotaDi(f))}</span>
                  {f.pagato && <span className="tag tag-neutral">già incassata</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={e.altro}
            onChange={(ev) => setEditE(r.id, { altro: ev.target.value as CategoriaAltroIngresso | "" })}
            className={cn("sel sel-sm flex-1", e.altro && "border-ok/30 bg-ok/10")}
            title="Quello che non è incasso di fattura (tutto il bonifico o il resto)"
          >
            <option value="">{scelte.length ? "Il resto: lascia da assegnare" : "Oppure altro ingresso…"}</option>
            {CATEGORIE_ALTRO.map((c) => (
              <option key={c.value} value={c.value}>
                {scelte.length ? `Il resto come ${c.label.toLowerCase()}` : `Altro ingresso: ${c.label}`}
              </option>
            ))}
          </select>
        </div>
        <div className={cn("tbl-muted truncate", ent.certo && !scelte.length && !e.altro ? "" : "")} title={ent.motivo}>
          {scelte.length
            ? `Assegnati ${fmt(assegnato)} di ${fmt(daAssegnare)}${resta > 0.009 ? ` · resta ${fmt(resta)}${e.altro ? " → altro ingresso" : " da assegnare"}` : ""}`
            : ent.motivo}
        </div>
      </div>
    );
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
          <h1 className="page-title">Banca</h1>
          <p className="page-sub">
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
            className="btn btn-secondary"
            title="Regole di categoria e memoria beneficiari"
          >
            <Settings2 className="w-4 h-4" /> Regole
          </Link>
          <button
            onClick={() => setShowImport(true)}
            className="btn btn-primary"
          >
            <Upload className="w-4 h-4" /> Importa estratto
          </button>
        </div>
      </div>

      {/* KPI */}
      <KpiGrid cols={4}>
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
          <Kpi key={k.label} label={k.label} value={k.value} color={k.color} sub={k.sub} />
        ))}
      </KpiGrid>

      {vista === "importazioni" && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl min-w-[860px]">
              <thead>
                <tr>
                  {["Caricato il", "File", "Periodo", "Lette", "Nuove", "Già presenti", "Collegati", ""].map(
                    (h, i) => (
                      <th key={i} className={cn(thCls, i >= 3 && i <= 6 && "text-right")}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {importazioni.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400">
                      <Landmark className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                      Nessun estratto caricato
                    </td>
                  </tr>
                )}
                {importazioni.map((imp) => (
                  <tr key={imp.id}>
                    <td className="whitespace-nowrap">
                      {new Date(imp.createdAt).toLocaleString("it-IT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      <div className="text-sm font-medium text-gray-900 max-w-[320px] truncate" title={imp.nomeFile}>
                        {imp.nomeFile}
                      </div>
                      <div className="tbl-muted">
                        {imp.banca}
                        {imp.conto ? ` · ${imp.conto}` : ""}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {data(imp.periodoDa)} – {data(imp.periodoA)}
                    </td>
                    <td className="text-right">{imp.righeLette}</td>
                    <td className="text-right font-semibold text-gray-900">{imp.righeNuove}</td>
                    <td className="text-right text-gray-500">{imp.righeDuplicate}</td>
                    <td className="text-right">
                      {imp.collegati}/{imp.movimenti}
                    </td>
                    <td className="text-right">
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


          {/* Barra selezione */}
          {revisione && selezionabili.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-gray-500">
                {sel.size > 0 ? `${sel.size} selezionati` : "Seleziona le righe per agire in blocco"}
              </span>
              <button
                onClick={() => inBlocco(inRevisioneE ? applicaEntrataCerta : applica, inRevisioneE ? "Incassati" : "Applicati")}
                disabled={!sel.size || !!busy}
                className="btn btn-primary disabled:opacity-50"
              >
                {busy && !busy.startsWith("#") ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {busy && !busy.startsWith("#") ? busy : inRevisioneE ? "Applica proposte certe" : "Applica proposte"}
              </button>
              <button
                onClick={() => inBlocco((r) => patch(r, { azione: "escludi" }), "Esclusi")}
                disabled={!sel.size || !!busy}
                className="btn btn-secondary"
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
              <table className="tbl tbl-fixed min-w-[900px]">
                <colgroup>
                  {revisione && <col style={{ width: 36 }} />}
                  <col style={{ width: 72 }} />
                  <col />
                  <col style={{ width: 104 }} />
                  {revisione ? (
                    <col style={{ width: inRevisioneE ? 430 : 400 }} />
                  ) : (
                    <>
                      <col style={{ width: 110 }} />
                      <col style={{ width: "34%" }} />
                    </>
                  )}
                  <col style={{ width: revisione ? 124 : 112 }} />
                </colgroup>
                <thead>
                  <tr>
                    {revisione && (
                      <th>
                        <input
                          type="checkbox"
                          checked={selezionabili.length > 0 && sel.size === selezionabili.length}
                          onChange={toggleTutti}
                          className="accent-pink-600"
                        />
                      </th>
                    )}
                    <th>Data</th>
                    <th>Movimento</th>
                    <th className="text-right">Importo</th>
                    {revisione ? (
                      <th>{inRevisioneE ? "Incasso" : "Abbinamento"}</th>
                    ) : (
                      <>
                        <th>Stato</th>
                        <th>Collegato a / nota</th>
                      </>
                    )}
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
                  {!loading && visibili.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-gray-400">
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
                      const editing = revisione;
                      const candidato = e?.candidatoId
                        ? s?.candidati.find((c) => c.id === e.candidatoId)
                        : undefined;
                      const occupato = busy === `#${r.id}`;
                      const haCandidati = !!s && s.candidati.length > 0;
                      const persona = e?.dipendenteId ? persone.find((d) => d.id === e.dipendenteId)?.nome : undefined;
                      return (
                        <tr key={r.id} className="align-top">
                          {editing && (
                            <td>
                              <input
                                type="checkbox"
                                checked={sel.has(r.id)}
                                onChange={() => toggleSel(r.id)}
                                className="accent-pink-600"
                              />
                            </td>
                          )}
                          <td className="text-xs whitespace-nowrap">{dataBreve(r.dataContabile)}</td>
                          <td>
                            <div className="tbl-primary truncate" title={r.beneficiario ?? r.concetto}>
                              {r.beneficiario ?? r.concetto}
                            </div>
                            <div
                              className="tbl-muted truncate"
                              title={[r.concetto, r.osservazioni].filter(Boolean).join(" · ")}
                            >
                              {r.beneficiario ? `${r.concetto} · ` : ""}
                              {r.osservazioni ?? ""}
                            </div>
                          </td>
                          <td
                            className={cn(
                              "text-right font-semibold whitespace-nowrap",
                              r.importo < 0 ? "text-bad" : "text-ok",
                            )}
                          >
                            {fmt(r.importo)}
                          </td>

                          {inRevisioneE ? (
                            <td>{cellaEntrata(r)}</td>
                          ) : editing ? (
                            <td>
                              {haCandidati && (
                                <select
                                  value={e?.candidatoId ?? 0}
                                  onChange={(ev) => setEdit(r.id, { candidatoId: parseInt(ev.target.value) })}
                                  className={cn(inputCls, e?.candidatoId && "border-ok/30 bg-ok/10")}
                                >
                                  <option value={0}>Crea nuova spesa</option>
                                  {s!.candidati.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      Abbina a #{c.id} · {MESI[c.mese - 1].slice(0, 3)} {c.anno}
                                      {c.stessoMese ? "" : " (altro mese)"} · {c.registro ?? c.fornitore}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {candidato ? (
                                <div className="flex items-center gap-1.5 mt-1 min-w-0">
                                  <CategoriaBadge categoria={candidato.categoria} />
                                  <span
                                    className="tbl-muted truncate"
                                    title={[candidato.fornitore, candidato.descrizione].filter(Boolean).join(" · ")}
                                  >
                                    <span className="font-medium text-gray-700">{candidato.fornitore}</span>
                                    {" · "}
                                    {candidato.registro ? "già nel registro pagamenti" : "già in Spese"}
                                    {candidato.descrizione ? ` · ${candidato.descrizione}` : ""}
                                    {!candidato.registro && e && CON_REGISTRO.has(e.categoria) && persona
                                      ? ` · entra nel registro come ${e.categoria.toLowerCase()} di ${persona}`
                                      : ""}
                                  </span>
                                </div>
                              ) : (
                                <div className={cn("space-y-1", haCandidati && "mt-1")}>
                                  <div className="flex gap-1.5">
                                    <select
                                      value={e?.categoria ?? ""}
                                      onChange={(ev) => setEdit(r.id, { categoria: ev.target.value })}
                                      className={cn(inputCls, "w-[45%]")}
                                      title="Categoria della spesa"
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
                                      className={cn(inputCls, "flex-1")}
                                    />
                                  </div>
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
                                  {((s && s.origine !== "default") || e?.fornitoreId || !haCandidati) && (
                                    <div className="tbl-muted truncate">
                                      {!haCandidati ? "Nessuna spesa simile: ne crea una nuova" : ""}
                                      {!haCandidati && ((s && s.origine !== "default") || e?.fornitoreId) ? " · " : ""}
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
                          ) : (
                            <>
                              <td className="whitespace-nowrap">
                                <span
                                  className={cn(
                                    collegato(r) && "pill-ok",
                                    r.stato === "escluso" && "pill-off",
                                    daRivedere && "pill-wait",
                                  )}
                                >
                                  {STATO_MOVIMENTO_LABEL[r.stato]}
                                </span>
                              </td>
                              <td>
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
                                    {a.acconto && !a.fattura && <span>Acconto fattura #{a.acconto.fatturaId} · {fmt(a.importo)}</span>}
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

                          <td className="whitespace-nowrap text-right">
                            {occupato ? (
                              <Loader2 className="w-4 h-4 animate-spin text-brand inline" />
                            ) : editing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => (inRevisioneE ? singoloEntrata(r) : singolo(r))}
                                  disabled={!!busy || (inRevisioneE && !r.entrata?.escludi && !editsE[r.id]?.fattureIds.length && !editsE[r.id]?.altro)}
                                  className="btn btn-primary btn-sm"
                                  title={
                                    inRevisioneE
                                      ? "Registra l'incasso: un acconto per ogni fattura con la data del bonifico"
                                      : e?.candidatoId
                                        ? "Collega il movimento alla spesa scelta"
                                        : "Crea la spesa e collegala"
                                  }
                                >
                                  <Check />{" "}
                                  {inRevisioneE
                                    ? r.entrata?.escludi && !editsE[r.id]?.fattureIds.length && !editsE[r.id]?.altro
                                      ? "Escludi"
                                      : editsE[r.id]?.fattureIds.length
                                        ? "Incassa"
                                        : "Registra"
                                    : e?.candidatoId
                                      ? "Abbina"
                                      : "Crea"}
                                </button>
                                <button
                                  onClick={() => azioneSingola(r, { azione: "escludi" }, "Movimento escluso")}
                                  disabled={!!busy}
                                  className="btn btn-ghost btn-sm px-2"
                                  title="Escludi (non è una spesa)"
                                >
                                  <Ban />
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
                                className="btn btn-secondary btn-sm"
                              >
                                <Unlink /> Scollega
                              </button>
                            ) : r.stato === "escluso" ? (
                              <button
                                onClick={() => azioneSingola(r, { azione: "ripristina" }, "Movimento ripristinato")}
                                disabled={!!busy}
                                className="btn btn-secondary btn-sm"
                              >
                                <RotateCcw /> Ripristina
                              </button>
                            ) : (
                              <button
                                onClick={() => azioneSingola(r, { azione: "escludi" }, "Movimento escluso")}
                                disabled={!!busy}
                                className="btn btn-secondary btn-sm"
                              >
                                <Ban /> Escludi
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

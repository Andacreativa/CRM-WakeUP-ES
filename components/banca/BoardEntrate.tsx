"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { fmt, CATEGORIE_INGRESSO, canaleLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { SuggerimentoEntrata } from "@/lib/banca-shared";

// Board di riconciliazione come quella di Northstar: a sinistra i clienti con
// le fatture, a destra i bonifici da abbinare. Si trascina il bonifico sulla
// fattura: nasce un acconto con la data del bonifico. Aprire un cliente
// filtra i bonifici riconducibili a lui e mostra, sotto, quelli di pari
// importo intestati ad altri. "Non è un incasso" esclude il movimento o lo
// registra come altro ingresso.

interface FatturaBoard {
  id: number;
  numero: string | null;
  data: string | null;
  mese: number;
  anno: number;
  importo: number;
  azienda: string;
  incassatoFuori: number;
  pagato: boolean;
  manuale: boolean;
}
interface ClienteBoard {
  id: number | null;
  nome: string;
  fatture: FatturaBoard[];
}
interface Doc {
  id: number;
  data: string;
  valore: number;
  label: string;
  details: string;
  links: { fatturaId: number; importo: number }[];
  escluso: boolean;
  altro: { id: number; categoria: string | null; importo: number } | null;
  hint: string | null;
  proposta: SuggerimentoEntrata | null;
}
type Stato = "paid" | "parziale" | "open";

const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString("it-IT", { timeZone: "UTC" }) : "");
const STATO_LABEL: Record<Stato, string> = { paid: "Incassata", parziale: "Acconto", open: "Aperta" };
const STATO_PILL: Record<Stato, string> = { paid: "pill-ok", parziale: "pill-partial", open: "pill-wait" };
const CATEGORIE_ALTRO = CATEGORIE_INGRESSO.filter((c) => c.value !== "ritenuta_commerciale");

// ── riconoscimento del cliente dal mittente (come Northstar) ──
const STOP = new Set(["di", "de", "del", "della", "the", "and", "company", "italiana", "italia", "italy", "servizi", "service", "services", "group", "international", "centri", "centro", "associazione", "consorzio", "azienda", "fratelli", "nuova", "nuovo", "san", "santa", "dott", "sig", "responsabilita", "limitata", "sociedad", "ditta"]);
const normTesto = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?l\.?u?\.?|societa'?|agricola|unipersonale/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tok = (s: string) => normTesto(s).split(" ").filter((w) => (w.length > 2 || /\d/.test(w)) && !STOP.has(w));
// il mittente arriva troncato dalla banca: vale anche il prefisso di almeno 4 lettere
const hit = (ct: Set<string>, w: string) => {
  if (ct.has(w)) return w;
  for (const t of ct) {
    if (w.length >= 4 && t.startsWith(w)) return t;
    if (t.length >= 4 && w.startsWith(t)) return t;
  }
  return null;
};
const comuni = (ct: Set<string>, testo: string) => {
  const s = new Set<string>();
  for (const w of tok(testo)) {
    const h = hit(ct, w);
    if (h) s.add(h);
  }
  return s;
};
const matchDoc = (d: Doc, nome: string | null) => {
  if (!nome) return true;
  const ct = new Set(tok(nome));
  if (!ct.size) return true;
  const com = comuni(ct, [d.label, d.hint, d.details].filter(Boolean).join(" "));
  if (com.size >= 2) return true;
  if (!com.size) return false;
  const mittente = tok(d.label || "");
  return ct.size === 1 || (mittente.length === 1 && comuni(ct, d.label || "").size === 1) || [...com][0].length >= 7;
};

export default function BoardEntrate({ anno, onChange }: { anno: number; onChange?: () => void }) {
  const [clienti, setClienti] = useState<ClienteBoard[]>([]);
  const [documenti, setDocumenti] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [soloSaldo, setSoloSaldo] = useState(true);
  const [docSearch, setDocSearch] = useState("");
  const [filtroCliente, setFiltroCliente] = useState<string | null>(null);
  const [drag, setDrag] = useState<Doc | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const notify = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), kind === "ok" ? 3500 : 7000);
  };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch(`/api/banca/board?anno=${anno}`)).json();
      setClienti(Array.isArray(j.clienti) ? j.clienti : []);
      setDocumenti(Array.isArray(j.documenti) ? j.documenti : []);
    } finally {
      setLoading(false);
    }
  }, [anno]);
  useEffect(() => {
    load();
  }, [load]);
  const ricarica = async () => {
    await load();
    onChange?.();
  };

  // ── coperture (verità = documenti.links) ──
  const idx = useMemo(() => {
    const cover: Record<number, number> = {};
    const docsBy: Record<number, Doc[]> = {};
    for (const d of documenti) {
      for (const l of d.links) {
        cover[l.fatturaId] = (cover[l.fatturaId] || 0) + l.importo;
        (docsBy[l.fatturaId] = docsBy[l.fatturaId] || []).push(d);
      }
    }
    return { cover, docsBy };
  }, [documenti]);
  const coverOf = (fid: number) => idx.cover[fid] || 0;
  const docOf = (f: FatturaBoard) => idx.docsBy[f.id] || [];
  const fattResiduo = (f: FatturaBoard) => Math.max(0, f.importo - f.incassatoFuori - coverOf(f.id));
  const fattStato = (f: FatturaBoard): Stato => (fattResiduo(f) < 0.5 ? "paid" : coverOf(f.id) > 0.5 ? "parziale" : "open");
  const docResiduo = (d: Doc) => d.valore - d.links.reduce((s, l) => s + l.importo, 0) - (d.altro?.importo ?? 0);
  const linkAmount = (d: Doc, fid: number) => d.links.find((l) => l.fatturaId === fid)?.importo ?? 0;
  const daAbbinare = useMemo(() => documenti.filter((d) => !d.escluso && docResiduo(d) > 0.5), [documenti]);
  const esclusi = documenti.filter((d) => d.escluso);
  const cSaldo = (c: ClienteBoard) => c.fatture.reduce((s, f) => s + (fattResiduo(f) > 0.5 ? fattResiduo(f) : 0), 0);
  const totSaldo = clienti.reduce((s, c) => s + cSaldo(c), 0);
  const cDaAbbinare = (c: ClienteBoard) => daAbbinare.filter((d) => matchDoc(d, c.nome)).length;
  const clientiFiltrati = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return clienti.filter((c) => c.nome.toLowerCase().includes(q));
    return soloSaldo ? clienti.filter((c) => cSaldo(c) > 0.5 || cDaAbbinare(c) > 0) : clienti;
  }, [clienti, search, soloSaldo, daAbbinare]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── filtro documenti: cliente aperto + ricerca libera ──
  const matchTesto = (d: Doc) => {
    const q = normTesto(docSearch.replace(/,/g, "."));
    if (!q) return true;
    const testo = normTesto([d.label, d.details, d.hint].filter(Boolean).join(" ")) + " " + String(d.valore);
    return q.split(" ").every((w) => testo.includes(w));
  };
  const bonificiVisibili = daAbbinare.filter((d) => (!filtroCliente || matchDoc(d, filtroCliente)) && matchTesto(d));
  // proposte per importo: il mittente NON è il cliente, ma la cifra coincide con una sua fattura aperta
  const proposte = useMemo(() => {
    if (!filtroCliente) return [] as { d: Doc; quale: string; f: FatturaBoard | null; v: number }[];
    const c = clienti.find((x) => x.nome === filtroCliente);
    if (!c) return [];
    const aperte = c.fatture.filter((f) => fattResiduo(f) > 0.5 || f.manuale);
    const cand: { v: number; f: FatturaBoard | null; quale: string }[] = [];
    for (const f of aperte) {
      const r = f.manuale ? f.importo : fattResiduo(f);
      cand.push({ v: f.importo, f, quale: "totale" });
      if (Math.abs(r - f.importo) > 0.5) cand.push({ v: r, f, quale: "residuo" });
    }
    if (aperte.length > 1) cand.push({ v: aperte.reduce((s, f) => s + (f.manuale ? f.importo : fattResiduo(f)), 0), f: null, quale: "saldo cliente" });
    const out: { d: Doc; quale: string; f: FatturaBoard | null; v: number }[] = [];
    for (const d of daAbbinare) {
      if (matchDoc(d, filtroCliente) || !matchTesto(d)) continue;
      if (clienti.some((x) => matchDoc(d, x.nome))) continue; // il mittente è un altro cliente
      const res = docResiduo(d);
      const h = cand.find((k) => Math.abs(k.v - res) < 0.5) || cand.find((k) => Math.abs(k.v - d.valore) < 0.5);
      if (h) out.push({ d, quale: h.quale, f: h.f, v: h.v });
    }
    return out;
  }, [filtroCliente, clienti, daAbbinare, docSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  const certe = daAbbinare.filter((d) => d.proposta && (d.proposta.certo || d.proposta.escludi));

  const apriCliente = (nome: string) => {
    if (open === nome) {
      setOpen(null);
      setFiltroCliente(null);
    } else {
      setOpen(nome);
      setFiltroCliente(nome);
      setDocSearch("");
    }
  };

  // ── azioni ──
  const post = async (url: string, body: Record<string, unknown>) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, error: j.error as string | undefined };
  };
  const patchMov = async (id: number, body: Record<string, unknown>) => {
    const r = await fetch(`/api/banca/movimenti/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, error: j.error as string | undefined };
  };
  const esegui = async (chiave: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setBusy(chiave);
    const r = await fn();
    setBusy(null);
    if (!r.ok) notify("err", r.error || "Errore");
    else notify("ok", okText);
    await ricarica();
  };
  const canDrop = (f: FatturaBoard) => !!drag && docResiduo(drag) > 0.5 && (fattResiduo(f) > 0.5 || (f.manuale && coverOf(f.id) === 0));
  const quotaFattura = (f: FatturaBoard) => (fattResiduo(f) > 0.5 ? fattResiduo(f) : f.manuale ? f.importo : 0);
  const onDrop = (e: DragEvent, f: FatturaBoard) => {
    e.preventDefault();
    const d = drag;
    setDropTarget(null);
    setDrag(null);
    if (!d || !canDrop(f)) return;
    const amt = Math.round(Math.min(docResiduo(d), quotaFattura(f)) * 100) / 100;
    if (amt < 0.5) return;
    const extra = f.manuale ? "\n(la fattura è già segnata incassata a mano: l'acconto è retroattivo, lo stato non cambia)" : "";
    if (!confirm(`Abbinare il bonifico ${d.label} alla fattura N. ${f.numero ?? f.id} per ${fmt(amt)}?${extra}`)) return;
    esegui(`m${d.id}`, () => post("/api/banca/board/match", { movimentoId: d.id, fatturaId: f.id, importo: amt }), "Bonifico abbinato: acconto registrato");
  };
  const unmatchLink = (d: Doc, f: FatturaBoard) =>
    esegui(`u${d.id}`, () => post("/api/banca/board/unmatch", { movimentoId: d.id, fatturaId: f.id }), "Abbinamento annullato");
  const escludi = (d: Doc) => {
    if (!confirm(`Escludere "${d.label}" (${fmt(d.valore)}) dalla riconciliazione?\nPer giroconti, rimborsi carta, movimenti tecnici.`)) return;
    esegui(`e${d.id}`, () => patchMov(d.id, { azione: "escludi" }), "Movimento escluso");
  };
  const ripristina = (d: Doc) => esegui(`r${d.id}`, () => patchMov(d.id, { azione: "ripristina" }), "Movimento ripristinato");
  const altroIngresso = (d: Doc, categoria: string) => {
    const label = CATEGORIE_ALTRO.find((c) => c.value === categoria)?.label ?? categoria;
    if (!confirm(`Registrare "${d.label}" (${fmt(docResiduo(d))}) come altro ingresso · ${label}?`)) return;
    esegui(`a${d.id}`, () => post("/api/banca/board/match", { movimentoId: d.id, altroIngresso: { categoria } }), "Altro ingresso registrato");
  };
  const nonIncasso = (d: Doc, v: string) => {
    if (!v) return;
    if (v === "escludi") escludi(d);
    else altroIngresso(d, v);
  };
  // proposta certa del motore: stesso effetto del trascinamento, senza trascinare
  const applicaProposta = async (d: Doc): Promise<{ ok: boolean; error?: string }> => {
    const p = d.proposta;
    if (!p) return { ok: false, error: "nessuna proposta" };
    if (p.escludi) return patchMov(d.id, { azione: "escludi" });
    if (p.altro) return post("/api/banca/board/match", { movimentoId: d.id, altroIngresso: { categoria: p.altro } });
    for (const fid of p.proposti) {
      const r = await post("/api/banca/board/match", { movimentoId: d.id, fatturaId: fid });
      if (!r.ok) return r;
    }
    return { ok: true };
  };
  const abbinaProposta = (d: Doc) => {
    const p = d.proposta!;
    const testo = p.escludi
      ? `Escludere "${d.label}" (${fmt(d.valore)})? ${p.motivo}`
      : p.altro
        ? `Registrare "${d.label}" (${fmt(d.valore)}) come altro ingresso · ${CATEGORIE_ALTRO.find((c) => c.value === p.altro)?.label ?? p.altro}?`
        : `Abbinare il bonifico ${d.label} (${fmt(d.valore)}) a ${p.proposti.map((id) => "N. " + (p.candidati.find((c) => c.id === id)?.numero ?? id)).join(", ")}?`;
    if (!confirm(testo)) return;
    esegui(`p${d.id}`, () => applicaProposta(d), "Fatto");
  };
  const applicaTutteCerte = async () => {
    if (!certe.length) return;
    if (!confirm(`Applicare ${certe.length} proposte certe (numero di fattura citato o cliente e importo che quadrano, cashback, giroconti)?\nOgni abbinamento resta annullabile.`)) return;
    let ok = 0;
    const errori: string[] = [];
    for (let i = 0; i < certe.length; i++) {
      setBusy(`tutte ${i + 1}/${certe.length}`);
      const r = await applicaProposta(certe[i]);
      if (r.ok) ok++;
      else errori.push(`${certe[i].label}: ${r.error}`);
    }
    setBusy(null);
    notify(errori.length ? "err" : "ok", `${ok} applicate${errori.length ? ` · ${errori.length} non riuscite: ${errori.slice(0, 2).join(" · ")}` : ""}`);
    await ricarica();
  };

  const propostaLabel = (d: Doc) => {
    const p = d.proposta;
    if (!p) return null;
    if (p.escludi) return "escludi (giroconto)";
    if (p.altro) return `altro ingresso · ${CATEGORIE_ALTRO.find((c) => c.value === p.altro)?.label.toLowerCase() ?? p.altro}`;
    if (!p.proposti.length) return null;
    return p.proposti.map((id) => "N. " + (p.candidati.find((c) => c.id === id)?.numero ?? id)).join(" + ");
  };

  // ── render ──
  const docCard = (d: Doc, variante: "bonifico" | "proposta" = "bonifico", extra?: string) => {
    const res = docResiduo(d);
    const prop = propostaLabel(d);
    const occupato = busy && busy.endsWith(String(d.id)) && !busy.startsWith("tutte");
    return (
      <div
        key={d.id}
        className={cn("recon-doc", variante === "proposta" && "proposta", drag?.id === d.id && "dragging")}
        draggable
        onDragStart={(e) => {
          setDrag(d);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(d.id));
        }}
        onDragEnd={() => {
          setDrag(null);
          setDropTarget(null);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{d.label}</span>
          <span className={cn("font-bold text-sm shrink-0 tabular-nums", variante === "proposta" ? "text-warn" : "text-ok")}>{fmt(d.valore)}</span>
        </div>
        <div className="text-[10.5px] mt-0.5 text-gray-500 truncate" title={d.details}>
          {dt(d.data)}
          {d.details ? ` · ${d.details}` : ""}
        </div>
        {extra && <div className="text-[10.5px] mt-1 font-semibold truncate text-warn">{extra}</div>}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          {d.hint && variante === "bonifico" ? (
            <span className="text-[10.5px] truncate text-info">cliente: {d.hint}</span>
          ) : (
            <span />
          )}
          {res < d.valore - 0.5 && <span className="text-[10.5px] font-semibold shrink-0 text-warn">residuo {fmt(res)}</span>}
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <select
            value=""
            onChange={(e) => nonIncasso(d, e.target.value)}
            className="recon-noincasso"
            title="Non è l'incasso di una fattura: escludilo o registralo come altro ingresso"
          >
            <option value="">⊘ non è un incasso…</option>
            <option value="escludi">Escludi (giroconto, rimborso carta)</option>
            {CATEGORIE_ALTRO.map((c) => (
              <option key={c.value} value={c.value}>
                Altro ingresso: {c.label}
              </option>
            ))}
          </select>
          {occupato ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
          ) : prop && d.proposta?.certo ? (
            <button type="button" onClick={() => abbinaProposta(d)} className="recon-proposta" title={d.proposta.motivo}>
              <Check className="w-3 h-3" /> {prop}
            </button>
          ) : prop ? (
            <span className="text-[10.5px] text-gray-400 truncate" title={d.proposta?.motivo}>
              forse {prop}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={cn("text-sm rounded-lg px-3 py-2 border", msg.kind === "ok" ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad")}>
          {msg.text}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="page-sub">
          Trascina un <b className="text-ok">bonifico</b> (a destra) sulla <b className="text-info">fattura</b> (a sinistra): nasce un acconto con la data del bonifico.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          {certe.length > 0 && (
            <button type="button" onClick={applicaTutteCerte} disabled={!!busy} className="btn btn-secondary">
              {busy?.startsWith("tutte") ? <Loader2 className="animate-spin" /> : <Check />}
              {busy?.startsWith("tutte") ? busy : `Applica ${certe.length} proposte certe`}
            </button>
          )}
          <div className="text-right">
            <div className="kpi-label">Da incassare</div>
            <div className="font-bold text-sm tabular-nums text-partial">{fmt(totSaldo)}</div>
          </div>
          <div className="text-right">
            <div className="kpi-label">Da abbinare</div>
            <div className={cn("font-bold text-sm tabular-nums", daAbbinare.length ? "text-partial" : "text-ok")}>{daAbbinare.length} doc.</div>
          </div>
        </div>
      </div>

      <div className="recon-grid">
        {/* ══ SINISTRA: clienti ══ */}
        <div className="recon-left space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca cliente…" className="sel w-full pl-9 pr-8" />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-0.5">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={soloSaldo} onChange={(e) => setSoloSaldo(e.target.checked)} className="accent-pink-600" /> Solo da incassare o con bonifici
            </label>
            <span className="text-[11px] text-gray-400">{clientiFiltrati.length} clienti</span>
          </div>
          {loading && <div className="text-sm text-gray-400 italic px-1 py-2">Caricamento…</div>}
          {!loading && !clientiFiltrati.length && <div className="text-sm text-gray-400 italic px-1 py-2">Nessun cliente trovato</div>}
          {clientiFiltrati.map((c) => {
            const saldo = cSaldo(c);
            const nDoc = cDaAbbinare(c);
            const aperto = open === c.nome;
            return (
              <div key={c.nome} className="recon-cliente">
                <button type="button" onClick={() => apriCliente(c.nome)} className="recon-cliente-head">
                  <span className="flex items-center gap-2 font-semibold text-gray-900 min-w-0">
                    <span className={cn("recon-caret", aperto && "open")} />
                    <span className="truncate">{c.nome}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-gray-500 shrink-0 tabular-nums">
                    {nDoc > 0 && (
                      <span className="tag tag-soft-ok" title={`${nDoc} bonifici riconducibili a questo cliente`}>
                        {nDoc} doc.
                      </span>
                    )}
                    {saldo > 0.5 ? (
                      <span>
                        Saldo <b className="text-partial">{fmt(saldo)}</b>
                      </span>
                    ) : (
                      <span className="tag tag-soft-ok">QUADRA</span>
                    )}
                  </span>
                </button>
                {aperto && (
                  <div className="px-3 pb-3 space-y-2">
                    {c.fatture.map((f) => {
                      const st = fattStato(f);
                      const res = fattResiduo(f);
                      return (
                        <div
                          key={f.id}
                          className={cn("recon-fatt", dropTarget === f.id && "drop", drag && !canDrop(f) && "nodrop")}
                          onDragOver={(e) => {
                            if (canDrop(f)) {
                              e.preventDefault();
                              setDropTarget(f.id);
                            }
                          }}
                          onDragLeave={() => setDropTarget(null)}
                          onDrop={(e) => onDrop(e, f)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span className="tag tag-soft-info">FATTURA</span>
                              <span className="font-semibold text-sm text-gray-900">N. {f.numero ?? f.id}</span>
                            </div>
                            <span className="font-bold text-sm text-gray-900 shrink-0 tabular-nums">{fmt(f.importo)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1 gap-2">
                            <span className="text-[11px] text-gray-500 truncate">
                              {dt(f.data)} · {canaleLabel(f.azienda)}
                              {f.incassatoFuori > 0.5 && !f.manuale ? ` · incassato fuori banca ${fmt(f.incassatoFuori)}` : ""}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              {st === "parziale" && <span className="text-[10.5px] text-warn">residuo {fmt(res)}</span>}
                              <span className={STATO_PILL[st]}>{STATO_LABEL[st]}</span>
                              {f.manuale && (
                                <span className="tag tag-neutral" title="Segnata incassata a mano: puoi ancora collegarle il bonifico (acconto retroattivo)">
                                  a mano
                                </span>
                              )}
                            </span>
                          </div>
                          {docOf(f).map((d) => (
                            <div key={d.id} className="recon-link">
                              <div className="min-w-0">
                                <span className="tag tag-soft-ok">BONIFICO</span>
                                <span className="text-xs ml-1 text-gray-900">{d.label}</span>
                                <div className="text-[10.5px] text-gray-500 truncate">
                                  {dt(d.data)}
                                  {d.details ? ` · ${d.details}` : ""}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-semibold text-ok tabular-nums">{fmt(linkAmount(d, f.id))}</span>
                                <button type="button" onClick={() => unmatchLink(d, f)} className="recon-x" title="Annulla abbinamento">
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {!c.fatture.length && <div className="text-xs italic text-gray-400">Nessuna fattura nel periodo</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ══ DESTRA: bonifici da abbinare ══ */}
        <div className="recon-right">
          <div className="recon-right-head">
            <div className="flex items-center justify-between mb-2">
              <span className="kpi-label">Bonifici da abbinare</span>
              <span className="tag tag-neutral">
                {filtroCliente || docSearch.trim() ? `${bonificiVisibili.length} / ${daAbbinare.length}` : daAbbinare.length}
              </span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)} placeholder="Cerca mittente, causale, importo…" className="sel sel-sm w-full pl-8 pr-7" />
              {docSearch && (
                <button type="button" onClick={() => setDocSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {filtroCliente && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="tag tag-soft-info min-w-0">
                  <span className="truncate">{filtroCliente}</span>
                  <button type="button" onClick={() => setFiltroCliente(null)} title="Mostra tutti i bonifici">
                    ✕
                  </button>
                </span>
              </div>
            )}
            {filtroCliente && !bonificiVisibili.length && (
              <div className="text-[10.5px] mt-1.5 text-warn">
                {proposte.length ? `Nessun bonifico intestato al cliente · ${proposte.length} di pari importo qui sotto · ` : "Nessun bonifico riconducibile a questo cliente · "}
                <button type="button" onClick={() => setFiltroCliente(null)} className="underline">
                  mostra tutti
                </button>
              </div>
            )}
          </div>
          <div className="recon-scroll p-2 space-y-2">
            {bonificiVisibili.length > 0 && <div className="recon-sez text-ok">Bonifici · {bonificiVisibili.length}</div>}
            {bonificiVisibili.map((d) => docCard(d))}
            {proposte.length > 0 && (
              <div className="px-1 pt-2">
                <div className="recon-sez text-warn">Stesso importo · intestatario diverso · {proposte.length}</div>
                <div className="text-[10.5px] text-gray-500 mt-0.5">Non li abbino io: guarda e trascina se è il caso.</div>
              </div>
            )}
            {proposte.map((p) => docCard(p.d, "proposta", `= ${p.f ? `fattura N. ${p.f.numero ?? p.f.id} · ${p.quale}` : "saldo cliente"} · ${fmt(p.v)}`))}
            {esclusi.length > 0 && <div className="recon-sez text-gray-400 pt-2">Esclusi (non incassi) · {esclusi.length}</div>}
            {esclusi.map((d) => (
              <div key={d.id} className="recon-escluso">
                <div className="min-w-0">
                  <span className="text-xs text-gray-700 truncate block">{d.label}</span>
                  <div className="text-[10.5px] text-gray-400">
                    {dt(d.data)} · {fmt(d.valore)}
                  </div>
                </div>
                <button type="button" onClick={() => ripristina(d)} className="tag tag-neutral shrink-0">
                  ripristina
                </button>
              </div>
            ))}
            {!loading && !daAbbinare.length && <div className="text-xs italic text-gray-400 text-center py-6">Tutto abbinato ✓</div>}
            {daAbbinare.length > 0 && !bonificiVisibili.length && !proposte.length && docSearch && (
              <div className="text-xs italic text-gray-400 text-center py-6">Nessun bonifico per «{docSearch}»</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

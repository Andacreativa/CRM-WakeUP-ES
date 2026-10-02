"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DragEvent } from "react";
import { ChevronDown, FileText, Plus, ThumbsDown, Trophy } from "lucide-react";
import { fmt } from "@/lib/constants";
import { FONTI_LEAD, STATI_APERTI, STATO_LEAD } from "@/lib/lead";
import LeadFormModal from "@/components/crm/LeadFormModal";
import SearchBox from "@/components/SearchBox";
import { cn, matchQ } from "@/lib/utils";

// Pipeline di vendita come la board di Northstar: una colonna per stato
// aperto, card trascinabili che cambiano stato al rilascio, sezioni Vinta e
// Persa in fondo (anch'esse zone di rilascio). Vinta = conversione in cliente.

interface Lead {
  id: number;
  codice: string | null;
  nome: string;
  azienda: string | null;
  email: string | null;
  citta: string | null;
  valore: number | null;
  stato: string;
  fonte: string | null;
  responsabile: string | null;
  priorita: string;
  prossimaAzione: string | null;
  prossimaAzioneData: string | null;
  cliente: { id: number; nome: string } | null;
  preventivi: { id: number; numero: string; totale: number; status: string }[];
  attivita?: { prossimaAzione: string | null; prossimaAzioneData: string | null }[];
  createdAt: string;
  updatedAt: string;
}

const selectCls =
  "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30";

const iniziali = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

const dataBreve = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

// Prossima azione del lead (campo diretto o prima attività aperta) e quanto manca
const prossima = (l: Lead) => {
  const testo = l.prossimaAzione ?? l.attivita?.[0]?.prossimaAzione ?? null;
  const data = l.prossimaAzioneData ?? l.attivita?.[0]?.prossimaAzioneData ?? null;
  const giorni = data ? Math.ceil((new Date(data).getTime() - Date.now()) / 86400000) : null;
  return { testo, data, giorni };
};
// Semaforo come i "rotten days" di Northstar: azione scaduta = rosso,
// in scadenza entro 2 giorni = giallo.
const rotten = (l: Lead) => {
  const { giorni } = prossima(l);
  if (giorni == null) return "";
  if (giorni < 0) return "rotten-red";
  if (giorni <= 2) return "rotten-yellow";
  return "";
};

export default function PipelinePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [responsabile, setResponsabile] = useState("");
  const [fonte, setFonte] = useState("");
  const [nuovo, setNuovo] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [apriVinte, setApriVinte] = useState(false);
  const [apriPerse, setApriPerse] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // Un drag appena concluso non deve aprire la scheda al click che lo segue
  const dragging = useRef(false);

  const load = useCallback(async () => {
    const data = await (await fetch("/api/leads")).json();
    setLeads(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const responsabili = useMemo(
    () => Array.from(new Set(leads.map((l) => l.responsabile).filter((x): x is string => !!x))).sort(),
    [leads],
  );
  const visibili = useMemo(
    () =>
      leads.filter(
        (l) =>
          (!responsabile || l.responsabile === responsabile) &&
          (!fonte || l.fonte === fonte) &&
          matchQ(q, l.azienda, l.nome, l.email, l.citta, l.codice, l.responsabile),
      ),
    [leads, responsabile, fonte, q],
  );
  const perStato = useMemo(() => {
    const m: Record<string, Lead[]> = {};
    for (const l of visibili) (m[l.stato] ??= []).push(l);
    return m;
  }, [visibili]);
  const somma = (xs: Lead[]) => xs.reduce((s, l) => s + (l.valore ?? 0), 0);

  const aperti = leads.filter((l) => STATI_APERTI.includes(l.stato as (typeof STATI_APERTI)[number]));
  const vinte = leads.filter((l) => l.stato === "vinta");
  const perse = leads.filter((l) => l.stato === "persa");
  const chiuse = vinte.length + perse.length;
  const tasso = chiuse ? Math.round((vinte.length / chiuse) * 100) : 0;

  const kpi = [
    { label: "Trattative attive", value: String(aperti.length), color: "#111827" },
    { label: "Valore pipeline", value: fmt(somma(aperti)), color: "#e8308a" },
    { label: "Valore vinte", value: fmt(somma(vinte)), color: "#22c55e" },
    { label: "Tasso di conversione", value: `${tasso} %`, color: "#f59e0b" },
  ];

  // ── Cambio stato (drop) ──────────────────────────────────────────────────
  const cambiaStato = async (lead: Lead, stato: string) => {
    if (lead.stato === stato) return;
    if (stato === "vinta") {
      const ok = confirm(
        `Segnare "${lead.azienda ?? lead.nome}" come vinta?\n\nIl lead viene convertito in cliente (o collegato al cliente esistente) e i referenti passano alla scheda cliente.`,
      );
      if (!ok) return;
      const prev = leads;
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stato } : l)));
      const r = await fetch(`/api/leads/${lead.id}/converti`, { method: "POST" });
      if (!r.ok) {
        setLeads(prev);
        setErrore("Conversione non riuscita: riprova dalla scheda del lead.");
      }
      load();
      return;
    }
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stato } : l)));
    const r = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    if (!r.ok) {
      setLeads(prev);
      setErrore("Cambio di stato non riuscito.");
    }
    load();
  };

  const onDragStart = (e: DragEvent, l: Lead) => {
    dragging.current = true;
    setDragId(l.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(l.id));
  };
  const onDragEnd = () => {
    setDragId(null);
    setOver(null);
    // il click sintetico post-drop arriva subito dopo: lo lasciamo passare
    setTimeout(() => (dragging.current = false), 0);
  };
  const onDragOver = (e: DragEvent, stato: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (over !== stato) setOver(stato);
  };
  const onDrop = (e: DragEvent, stato: string) => {
    e.preventDefault();
    const id = parseInt(e.dataTransfer.getData("text/plain") || String(dragId ?? ""), 10);
    setOver(null);
    setDragId(null);
    const lead = leads.find((l) => l.id === id);
    if (lead) cambiaStato(lead, stato);
  };
  const apri = (l: Lead) => {
    if (dragging.current) return;
    router.push(`/crm/lead/${l.id}`);
  };

  // ── Card ─────────────────────────────────────────────────────────────────
  const card = (l: Lead) => {
    const { testo, data, giorni } = prossima(l);
    return (
      <div
        key={l.id}
        className={cn("kb-card", rotten(l), dragId === l.id && "dragging")}
        draggable
        onDragStart={(e) => onDragStart(e, l)}
        onDragEnd={onDragEnd}
        onClick={() => apri(l)}
        title={l.azienda && l.nome !== l.azienda ? `${l.azienda} · ${l.nome}` : l.nome}
      >
        <div className="kb-card-name">{l.azienda ?? l.nome}</div>
        {l.azienda && l.nome !== l.azienda && <div className="kb-card-sub">{l.nome}</div>}
        {testo && (
          <div className={cn("kb-card-next", giorni != null && giorni < 0 && "late")} title={testo}>
            → {testo}
            {data && ` · ${dataBreve(data)}`}
          </div>
        )}
        <div className="kb-card-meta">
          <span className="kb-card-value">
            <span className={cn("kb-prio", l.priorita)} title={`Priorità ${l.priorita}`} />
            {l.valore != null ? fmt(l.valore) : "—"}
          </span>
          <span className="kb-card-right">
            {l.preventivi.length > 0 && (
              <span className="kb-card-date inline-flex items-center gap-0.5" title={`${l.preventivi.length} preventivi`}>
                <FileText className="w-3 h-3" /> {l.preventivi.length}
              </span>
            )}
            <span className="kb-card-date">{dataBreve(l.updatedAt ?? l.createdAt)}</span>
            {l.responsabile && (
              <span className="kb-avatar" title={l.responsabile}>
                {iniziali(l.responsabile)}
              </span>
            )}
          </span>
        </div>
      </div>
    );
  };

  const terminale = ({
    stato,
    aperta,
    toggle,
    icona,
    vuoto,
  }: {
    stato: "vinta" | "persa";
    aperta: boolean;
    toggle: () => void;
    icona: React.ReactNode;
    vuoto: string;
  }) => {
    const rows = perStato[stato] ?? [];
    return (
      <section
        className={cn("kb-term", stato === "vinta" ? "win" : "lost", over === stato && "drag-over")}
        onDragOver={(e) => onDragOver(e, stato)}
        onDragEnter={() => {
          if (stato === "vinta") setApriVinte(true);
          else setApriPerse(true);
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => onDrop(e, stato)}
      >
        <header className="kb-term-head" onClick={toggle}>
          <span className="kb-term-title">
            {icona}
            {STATO_LEAD[stato].label}
          </span>
          <span className="kb-term-meta">
            <span className="kb-count">{rows.length}</span>
            <span className="kb-term-total">{fmt(somma(rows))}</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", aperta && "rotate-180")} />
          </span>
        </header>
        {aperta && (
          <div className="kb-term-body">
            {rows.length === 0 && <div className="kb-empty col-span-full">{vuoto}</div>}
            {rows.map(card)}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-gray-500 text-sm mt-1">
            Trascina una trattativa in un&apos;altra colonna per cambiarne lo stato
          </p>
        </div>
        <button
          onClick={() => setNuovo("nuovo")}
          className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl"
        >
          <Plus className="w-4 h-4" /> Nuovo lead
        </button>
      </div>

      {errore && (
        <div className="text-sm rounded-lg px-3 py-2 border bg-bad/10 border-bad/30 text-bad flex items-center justify-between">
          <span>{errore}</span>
          <button onClick={() => setErrore(null)} className="font-semibold">
            Chiudi
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpi.map((k) => (
          <div key={k.label} className="glass-card rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: k.color }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca nella pipeline…" />
        <select value={responsabile} onChange={(e) => setResponsabile(e.target.value)} className={selectCls}>
          <option value="">Tutti i responsabili</option>
          {responsabili.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={fonte} onChange={(e) => setFonte(e.target.value)} className={selectCls}>
          <option value="">Tutte le fonti</option>
          {FONTI_LEAD.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400 ml-auto">
          {visibili.length} di {leads.length} lead
        </span>
      </div>

      <div className="kb-board">
        {STATI_APERTI.map((stato) => {
          const st = STATO_LEAD[stato];
          const col = perStato[stato] ?? [];
          return (
            <div
              key={stato}
              className={cn("kb-col", over === stato && "drag-over")}
              onDragOver={(e) => onDragOver(e, stato)}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => onDrop(e, stato)}
            >
              <div className="kb-col-head">
                <span className="kb-col-title">
                  <span className="kb-dot" style={{ background: st.color }} />
                  {st.label}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="kb-count">{col.length}</span>
                  <button onClick={() => setNuovo(stato)} className="kb-add" title="Aggiungi un lead qui">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
              <div className="kb-col-value">{somma(col) > 0 ? fmt(somma(col)) : "—"}</div>
              <div className="kb-cards">
                {col.length === 0 && <div className="kb-empty">Nessun lead</div>}
                {col.map(card)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="kb-terminals">
        {terminale({
          stato: "vinta",
          aperta: apriVinte,
          toggle: () => setApriVinte((v) => !v),
          icona: <Trophy className="w-4 h-4" />,
          vuoto: "Nessuna trattativa vinta",
        })}
        {terminale({
          stato: "persa",
          aperta: apriPerse,
          toggle: () => setApriPerse((v) => !v),
          icona: <ThumbsDown className="w-4 h-4" />,
          vuoto: "Nessuna trattativa persa",
        })}
      </div>

      {nuovo && (
        <LeadFormModal
          lead={null}
          statoIniziale={nuovo}
          onClose={() => setNuovo(null)}
          onSaved={() => {
            setNuovo(null);
            load();
          }}
        />
      )}
    </div>
  );
}

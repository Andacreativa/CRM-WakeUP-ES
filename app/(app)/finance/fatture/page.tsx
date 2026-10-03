"use client";

import { ExportBar, ExportButton } from "@/components/ExportBar";
import Pills from "@/components/Pills";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Check,
  X,
  Download,
  FileSpreadsheet,
  FileText,
  FileDown,
  PencilLine,
  Upload,
  Wallet,
  Ban,
  Send,
  Mail,
  MailOpen,
  ExternalLink,
} from "lucide-react";
import { fmt, MESI, paeseGruppo } from "@/lib/constants";
import { matchQ } from "@/lib/utils";
import { useAnno } from "@/lib/anno-context";
import {
  exportExcel,
  exportPDF,
  fattureToExcel,
  fattureToPDF,
  rapportoSmh,
  exportRapportoSmhExcel,
} from "@/lib/export";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import ImportFattureModal from "@/components/ImportFattureModal";
import FatturaFormModal from "@/components/fatture/FatturaFormModal";
import StatoVf from "@/components/fatture/StatoVf";
import RowMenu from "@/components/RowMenu";
import Spunta from "@/components/Spunta";
import {
  type Fattura,
  totalePagato,
  residuo,
  statoCalcolato,
  isScaduta,
  dataIt,
  gestitaVf,
} from "@/lib/fatture";
import { scaricaFatturaPDF, inviaFatturaMail } from "@/lib/fattura-pdf";

interface Cliente {
  id: number;
  nome: string;
  paese: string;
}

const numeroKey = (n: string | null): number => {
  if (!n) return -Infinity;
  const digits = n.match(/\d+/g)?.join("") ?? "";
  return digits ? parseInt(digits, 10) : -Infinity;
};

// Sotto-tab della pagina (come "Fatture emesse" di Northstar). Le bozze
// sono fatture senza numero, da completare ed emettere; le proforma sono
// ancora un segnaposto. Le fatture da emettere stanno solo in Sales ›
// Richieste fattura.
type TabFatture = "emesse" | "bozze" | "proforma";
const TAB_VALIDE: TabFatture[] = ["emesse", "bozze", "proforma"];

// Filtri e pagina della lista, ricordati mentre si apre una fattura: al
// ritorno dal pannello si ritrova la lista dov'era.
const CHIAVE_LISTA = "fatture:lista";
type FiltroPagato = "tutti" | "pagato" | "attesa";

export default function FatturePage() {
  const router = useRouter();
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [bozze, setBozze] = useState<Fattura[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [commerciali, setCommerciali] = useState<
    { id: number; nome: string; cognome: string | null; percentualeCommissione: number }[]
  >([]);
  const [showForm, setShowForm] = useState(false);
  const [filtroMese, setFiltroMese] = useState(0);
  const [q, setQ] = useState("");
  const [filtroClienteId, setFiltroClienteId] = useState<number>(0);
  const [filtroPagato, setFiltroPagato] = useState<FiltroPagato>("tutti");
  const { anno } = useAnno();
  const [paese, setPaese] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);
  // Modalità Esporta (come Northstar): le caselle compaiono solo quando serve
  const [exportMode, setExportMode] = useState(false);
  const [tab, setTab] = useState<TabFatture>("emesse");

  // Cambio anno = dataset diverso: si riparte dalla prima pagina
  useEffect(() => {
    setPage(1);
  }, [anno]);
  // La tab vive nell'indirizzo (?tab=), senza useSearchParams per non
  // richiedere un confine Suspense alla pagina.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // Vecchi indirizzi della linguetta «Da emettere»
    if (t === "da-emettere") return router.replace("/sales/richieste");
    if (t && (TAB_VALIDE as string[]).includes(t)) setTab(t as TabFatture);
    try {
      const salvata = sessionStorage.getItem(CHIAVE_LISTA);
      if (!salvata) return;
      sessionStorage.removeItem(CHIAVE_LISTA);
      const s = JSON.parse(salvata);
      setQ(s.q ?? "");
      setFiltroMese(s.filtroMese ?? 0);
      setFiltroClienteId(s.filtroClienteId ?? 0);
      setFiltroPagato(s.filtroPagato ?? "tutti");
      setPaese(s.paese ?? "");
      setPageSize(s.pageSize ?? 10);
      setPage(s.page ?? 1);
    } catch {
      /* niente da ripristinare */
    }
  }, [router]);
  const ricordaLista = () => {
    try {
      sessionStorage.setItem(
        CHIAVE_LISTA,
        JSON.stringify({ q, filtroMese, filtroClienteId, filtroPagato, paese, pageSize, page }),
      );
    } catch {
      /* sessionStorage non disponibile */
    }
  };
  // Ogni filtro riporta alla prima pagina
  const filtra =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const vaiTab = (t: TabFatture) => {
    setTab(t);
    window.history.replaceState(null, "", t === "emesse" ? "/finance/fatture" : `/finance/fatture?tab=${t}`);
  };
  const [tutte, setTutte] = useState(false); // tutte quelle del filtro
  const [smhCfg, setSmhCfg] = useState({
    nome: "SocialMediaHouse S.R.L.",
    compenso: 2700,
    ritenuta: 15,
  });

  useEffect(() => {
    fetch("/api/impostazioni/fatture")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return;
        setSmhCfg({
          nome: c.smhNome || "SocialMediaHouse S.R.L.",
          compenso: Number(c.smhCompensoMensile) || 2700,
          ritenuta: Number(c.smhRitenuta) || 15,
        });
      })
      .catch(() => {});
  }, []);

  const esciExport = () => {
    setExportMode(false);
    setTutte(false);
    setSelectedIds(new Set());
    setLastClickedId(null);
  };
  useEffect(() => {
    if (!exportMode) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExportMode(false);
        setTutte(false);
        setSelectedIds(new Set());
        setLastClickedId(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [exportMode]);

  useEffect(() => {
    fetch("/api/dipendenti?tipo=commerciale")
      .then((r) => r.json())
      .then((d) => setCommerciali(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const load = async () => {
    const params = new URLSearchParams({ annullate: "1" });
    if (anno > 0) params.set("anno", String(anno));
    const [f, b, c] = await Promise.all([
      (await fetch(`/api/fatture?${params}`)).json() as Promise<unknown>,
      (await fetch("/api/fatture?bozze=1")).json() as Promise<unknown>,
      (await fetch("/api/clienti")).json() as Promise<unknown>,
    ]);
    setFatture(Array.isArray(f) ? (f as Fattura[]) : []);
    setBozze(Array.isArray(b) ? (b as Fattura[]) : []);
    setClienti(Array.isArray(c) ? (c as Cliente[]) : []);
  };
  useEffect(() => {
    load();
  }, [anno]);

  const patchRiga = (id: number, patch: Partial<Fattura>) =>
    setFatture((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const togglePagato = async (f: Fattura) => {
    if (togglingId === f.id) return;
    setTogglingId(f.id);
    try {
      const res = await fetch(`/api/fatture/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagato: !f.pagato }),
      });
      const body = await res.json().catch(() => ({ error: "non-JSON response" }));
      if (!res.ok) {
        alert(
          `Errore aggiornamento stato (${res.status}): ${body.error ?? "errore"}${body.stage ? ` [stage=${body.stage}]` : ""}`,
        );
      } else {
        patchRiga(f.id, { pagato: body.pagato });
      }
    } finally {
      setTogglingId(null);
    }
  };

  // Spunta a mano «presentata» (VeriFactu), come «Contab.» di Northstar
  const togglePresentata = async (f: Fattura) => {
    const presentata = !f.presentata;
    patchRiga(f.id, { presentata });
    const res = await fetch(`/api/fatture/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presentata }),
    });
    if (!res.ok) {
      patchRiga(f.id, { presentata: f.presentata });
      alert("Non sono riuscito ad aggiornare la spunta «presentata».");
      return;
    }
    const body = await res.json();
    patchRiga(f.id, { presentata: body.presentata, presentataIl: body.presentataIl });
  };

  const scaricaPdf = async (f: Fattura) => {
    try {
      await scaricaFatturaPDF(f.id);
    } catch {
      alert("Non sono riuscito a creare il PDF della fattura.");
    }
  };
  // Registro in coda: si riprova l'invio all'AEAT
  const inviaAeat = async () => {
    const r = await fetch("/api/verifactu/coda", { method: "POST" })
      .then((x) => x.json())
      .catch(() => ({ error: "Invio non riuscito" }));
    const problema = r.errore ?? r.error;
    if (problema) alert(`Il registro resta in coda: ${problema}.`);
    else if (r.attesa > 0 && !r.inviati) alert(`L'AEAT chiede di aspettare ancora ${r.attesa} secondi fra un invio e l'altro.`);
    load();
  };
  const inviaMail = async (f: Fattura) => {
    try {
      const dataInvio = await inviaFatturaMail(f.id);
      if (dataInvio) patchRiga(f.id, { inviata: true, dataInvio });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Non sono riuscito a inviare la fattura.");
    }
  };

  const filtered = (fatture ?? [])
    .filter((f) => {
      if (filtroMese && f.mese !== filtroMese) return false;
      if (filtroClienteId && f.clienteId !== filtroClienteId) return false;
      if (paese && paeseGruppo(f.cliente?.paese) !== paese) return false;
      if (!matchQ(q, f.numero, f.cliente?.nome, f.aziendaNota)) return false;
      const stato = statoCalcolato(f);
      if (filtroPagato === "pagato" && stato !== "pagato") return false;
      if (
        filtroPagato === "attesa" &&
        stato !== "attesa" &&
        stato !== "acconto"
      )
        return false;
      return true;
    })
    // Per data, poi per numero: l'ordine regge anche con «tutti gli anni»
    // (F20261 non finisce più sotto le fatture 2025)
    .sort(
      (a, b) =>
        (b.data ? new Date(b.data).getTime() : 0) - (a.data ? new Date(a.data).getTime() : 0) ||
        numeroKey(b.numero) - numeroKey(a.numero),
    );

  const clienteFiltrato = filtroClienteId
    ? (clienti.find((c) => c.id === filtroClienteId) ?? null)
    : null;

  // Cambio anno = dataset diverso: la selezione precedente non ha più senso
  useEffect(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  }, [anno]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── Selezione righe per export ──────────────────────────────────────────
  // La selezione vive solo sulle fatture attualmente filtrate: se un filtro
  // nasconde una riga selezionata, quella riga esce anche dall'export.
  const attive = filtered.filter((f) => !f.annullata);
  const selected = attive.filter((f) => selectedIds.has(f.id));
  const selTotale = selected.reduce((s, f) => s + (f?.importo ?? 0), 0);
  // Esporta: le spuntate, oppure tutte quelle del filtro
  const exportList = tutte || selected.length === 0 ? attive : selected;

  const toggleRow = (f: Fattura, shift: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const a = filtered.findIndex((x) => x.id === lastClickedId);
      const b = filtered.findIndex((x) => x.id === f.id);
      if (shift && lastClickedId != null && a !== -1 && b !== -1) {
        const [from, to] = a < b ? [a, b] : [b, a];
        const add = !prev.has(f.id);
        for (let i = from; i <= to; i++) {
          if (add) next.add(filtered[i].id);
          else next.delete(filtered[i].id);
        }
        return next;
      }
      if (next.has(f.id)) next.delete(f.id);
      else next.add(f.id);
      return next;
    });
    setLastClickedId(f.id);
  };

  const totale = attive.reduce((s, f) => s + (f?.importo ?? 0), 0);
  const pagate = attive.reduce(
    (s, f) =>
      s +
      (statoCalcolato(f) === "pagato" ? (f?.importo ?? 0) : totalePagato(f)),
    0,
  );
  const daIncassare = attive.reduce(
    (s, f) => s + (statoCalcolato(f) === "pagato" ? 0 : residuo(f)),
    0,
  );

  const runExportExcel = (list: Fattura[]) => {
    const annoLabel = anno > 0 ? String(anno) : "tutti";
    const slug = clienteFiltrato
      ? `_${clienteFiltrato.nome.replace(/\s+/g, "")}`
      : "";
    const sel = list.length !== attive.length ? "_selezione" : "";
    exportExcel(fattureToExcel(list, MESI), `fatture_${annoLabel}${slug}${sel}`);
  };

  const runExportPDF = (list: Fattura[]) => {
    const paeseLabel = paese ? `Clienti ${paese === "Altri" ? "di altri paesi" : paese}` : "Tutti i clienti";
    const annoStr = anno > 0 ? String(anno) : "tutti gli anni";
    const annoFile = anno > 0 ? String(anno) : "tutti";
    const parziale = list.length !== attive.length;
    const base = clienteFiltrato
      ? `Fatture ${annoStr} — ${paeseLabel} · ${clienteFiltrato.nome}`
      : `Fatture ${annoStr} — ${paeseLabel}`;
    const titolo = parziale ? `${base} · selezione (${list.length})` : base;
    const slug = clienteFiltrato
      ? `_${clienteFiltrato.nome.replace(/\s+/g, "")}`
      : "";
    const sel = parziale ? "_selezione" : "";
    const { cols, rows, title } = fattureToPDF(list, MESI, titolo);
    const totImporto = list.reduce((s, f) => s + (f?.importo ?? 0), 0);
    const totIncassato = list
      .filter((f) => f?.pagato)
      .reduce((s, f) => s + (f?.importo ?? 0), 0);
    const totNonPagato = totImporto - totIncassato;
    const perMese = Array.from({ length: 12 }, (_, i) =>
      list.filter((f) => f.mese === i + 1).reduce((s, f) => s + (f?.importo ?? 0), 0),
    );
    exportPDF(title, cols, rows, `fatture_${annoFile}${slug}${sel}`, {
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
    });
  };

  // Rapporto SMH: delle fatture scelte contano solo quelle ai clienti SMH
  // (spunta sulla scheda cliente)
  const runRapportoSmh = async (scelte: Fattura[], formato: "pdf" | "xlsx") => {
    const list = scelte.filter((f) => f.cliente?.smh);
    if (!list.length) {
      alert("Nessuna fattura a clienti SMH tra quelle scelte. Segna i clienti SMH dalla loro scheda (Modifica › Cliente SMH).");
      return;
    }
    const annoStr = anno > 0 ? String(anno) : "tutti gli anni";
    const periodo = filtroMese > 0 ? `${MESI[filtroMese - 1]} ${annoStr}` : annoStr;
    const dati = rapportoSmh(list, MESI, {
      compensoMensile: smhCfg.compenso,
      ritenuta: smhCfg.ritenuta,
      nomeSmh: smhCfg.nome,
      titolo: `Rapporto ${smhCfg.nome} — ${periodo}`,
    });
    const annoFile = anno > 0 ? String(anno) : "tutti";
    const meseFile = filtroMese > 0 ? `_${String(filtroMese).padStart(2, "0")}` : "";
    const filename = `rapporto_smh_${annoFile}${meseFile}`;
    if (formato === "xlsx") {
      await exportRapportoSmhExcel(dati, filename);
      return;
    }
    await exportPDF(dati.titolo, dati.cols, dati.rows, filename, {
      extraTables: [dati.riepilogo],
      footerCells: dati.footerCells,
    });
  };

  const oggi = new Date();
  const isInScadenza = (f: Fattura) => {
    if (!f.scadenza || f.pagato || f.annullata) return false;
    const d = new Date(f.scadenza);
    const giorni = Math.ceil((d.getTime() - oggi.getTime()) / 86400000);
    return giorni >= 0 && giorni <= 7;
  };

  return (
    <div className={`space-y-6 ${exportMode ? "pb-24" : ""}`}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Fatture</h1>
          <p className="page-sub">
            Fatture emesse e bozze da completare: una bozza non ha numero finché non la emetti.
          </p>
        </div>
        {tab !== "proforma" && (
          <div className="flex items-center gap-3 flex-wrap">
            {tab === "emesse" && (
              <>
                <PageSizeSelect pageSize={pageSize} onChange={filtra(setPageSize)} />
                <ExportButton
                  active={exportMode}
                  onClick={() => (exportMode ? esciExport() : setExportMode(true))}
                  title="Scegli le fatture e scaricale in Excel o PDF"
                />
                <button
                  onClick={() => setShowImport(true)}
                  className="btn btn-secondary"
                >
                  <Upload className="w-4 h-4 text-brand" /> Importa Fatture
                </button>
              </>
            )}
            <button
              onClick={() => setShowForm(true)}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" /> Nuova Fattura
            </button>
          </div>
        )}
      </div>

      {/* Sotto-tab: stesse pill dei filtri delle altre pagine */}
      <Pills
        value={tab}
        onChange={(v) => vaiTab(v)}
        options={[
          { val: "emesse", label: "Emesse" },
          { val: "bozze", label: bozze.length ? `Bozze (${bozze.length})` : "Bozze" },
          { val: "proforma", label: "Proforma" },
        ]}
      />

      {tab === "emesse" && (
        <>
      {/* KPI */}
      <KpiGrid cols={3}>
        {[
          { label: "Totale", val: fmt(totale), color: "text-gray-900" },
          { label: "Incassato", val: fmt(pagate), color: "text-ok" },
          {
            label: "Da Incassare",
            val: fmt(daIncassare),
            color: "text-warn",
          },
        ].map((k) => (
          <Kpi key={k.label} label={k.label} value={k.val} valueClass={k.color} />
        ))}
      </KpiGrid>

      {/* Filtri */}
      <div className="flex gap-3 flex-wrap items-center">
        <SearchBox value={q} onChange={filtra(setQ)} placeholder="Cerca numero, cliente…" />
        <select
          value={filtroMese}
          onChange={(e) => filtra(setFiltroMese)(parseInt(e.target.value))}
          className="sel"
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
            onChange={(e) => filtra(setFiltroClienteId)(parseInt(e.target.value) || 0)}
            className="sel min-w-[180px]"
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
              onClick={() => filtra(setFiltroClienteId)(0)}
              title="Rimuovi filtro cliente"
              className="p-1.5 rounded-lg text-gray-400 hover:text-bad hover:bg-bad/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={paese}
          onChange={(e) => filtra(setPaese)(e.target.value)}
          className="sel"
          title="Paese del cliente (sede)"
        >
          <option value="">Tutti i paesi</option>
          {["Italia", "Spagna", "Altri"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Pills
          value={filtroPagato}
          onChange={filtra(setFiltroPagato)}
          options={[
            { val: "tutti", label: "Tutti" },
            { val: "pagato", label: "Incassate" },
            { val: "attesa", label: "In attesa" },
          ]}
        />
        <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
          {filtered.length} fatture
          {selected.length > 0 ? ` · ${selected.length} selezionate` : ""}
        </span>
      </div>

      {/* Tabella fatture */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="tbl min-w-[980px]">
          <thead>
            <tr>
              {exportMode && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={attive.length > 0 && selected.length === attive.length}
                    onChange={() =>
                      setSelectedIds(
                        selected.length === attive.length
                          ? new Set()
                          : new Set(attive.map((f) => f.id)),
                      )
                    }
                    className="accent-pink-600"
                    aria-label="Seleziona tutte le fatture filtrate"
                  />
                </th>
              )}
              <th>Numero</th>
              <th>Data</th>
              <th>Cliente</th>
              <th>Paese</th>
              <th>Scadenza</th>
              <th className="text-right">Importo</th>
              <th className="text-center">Stato</th>
              <th className="text-center">
                <img
                  src="/verifactu-logo.png"
                  alt="VeriFactu"
                  title="Presentata all'Agencia Tributaria (VeriFactu). Per ora la spunta si mette a mano."
                  className="inline-block h-4 w-auto"
                />
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={exportMode ? 10 : 9}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessuna fattura trovata
                </td>
              </tr>
            )}
            {paged.map((f) => (
              <tr
                key={`${f.id}-${f.pagato}-${totalePagato(f)}`}
                onMouseDown={(e) => {
                  // shift+click: niente evidenziazione del testo mentre si estende la selezione
                  if (e.shiftKey) e.preventDefault();
                }}
                onClick={(e) => exportMode && !f.annullata && toggleRow(f, e.shiftKey)}
                title={exportMode ? "Click per selezionare · Shift+click per un intervallo" : undefined}
                className={`${exportMode ? "cursor-pointer" : ""} ${
                  exportMode && selectedIds.has(f.id)
                    ? "bg-brand/10 hover:bg-brand/15"
                    : ""
                }`}
              >
                {exportMode && (
                  <td className="w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(f.id)}
                      disabled={f.annullata}
                      onChange={() => toggleRow(f, false)}
                      className="accent-pink-600"
                      aria-label={`Seleziona la fattura ${f.numero ?? f.id}`}
                    />
                  </td>
                )}
                <td
                  className="whitespace-nowrap"
                  style={
                    exportMode && selectedIds.has(f.id)
                      ? { boxShadow: "inset 3px 0 0 0 #e8308a" }
                      : undefined
                  }
                >
                  {/* Il numero apre il pannello della fattura (come Northstar) */}
                  <Link
                    href={`/finance/fatture/${f.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      ricordaLista();
                    }}
                    className="font-mono font-medium text-brand hover:underline"
                    title="Apri la fattura"
                  >
                    {f.numero ?? "senza numero"}
                  </Link>
                  {f.tipoFattura !== "F1" && (
                    <span className="tag tag-brand ml-1.5" title="Fattura rettificativa">
                      Rett.
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap">{dataIt(f.data)}</td>
                <td className="font-medium text-gray-900">
                  {f.cliente?.nome ?? "—"}
                  {f.cliente?.smh && (
                    <span className="tag tag-neutral ml-1.5" title="Cliente portato da Social Media House">SMH</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-gray-500">{f.cliente?.paese ?? "—"}</td>
                <td>
                  {f.scadenza ? (
                    <span
                      className={`text-xs font-medium ${isScaduta(f, oggi) ? "text-bad" : isInScadenza(f) ? "text-warn" : "text-gray-500"}`}
                    >
                      {dataIt(f.scadenza)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td
                  className={`font-semibold text-right whitespace-nowrap ${
                    f.annullata ? "text-gray-400 line-through" : "text-gray-900"
                  }`}
                >
                  {fmt(f.importo)}
                </td>
                <td className="text-center">
                  {(() => {
                    const stato = statoCalcolato(f);
                    const apri = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      ricordaLista();
                      router.push(`/finance/fatture/${f.id}`);
                    };
                    if (stato === "annullata") {
                      return (
                        <button
                          onClick={apri}
                          className="pill-off"
                          title={`Annullata${f.annullataIl ? ` il ${dataIt(f.annullataIl)}` : ""}: resta nel registro, fuori dai totali`}
                        >
                          <Ban /> Annullata
                        </button>
                      );
                    }
                    if (stato === "pagato") {
                      const conIncassi = f.acconti && f.acconti.length > 0;
                      return (
                        <button
                          onClick={(e) => {
                            // Con incassi registrati lo stato si cambia dal pannello
                            if (conIncassi) return apri(e);
                            e.stopPropagation();
                            togglePagato(f);
                          }}
                          disabled={togglingId === f.id}
                          className="pill-ok disabled:opacity-60 disabled:cursor-wait"
                          title={
                            conIncassi
                              ? "Incassata: apri la fattura per vedere gli incassi"
                              : "Incassata: clicca per cambiare"
                          }
                        >
                          <Check /> Incassato
                        </button>
                      );
                    }
                    if (stato === "acconto") {
                      return (
                        <button
                          onClick={apri}
                          title={`${fmt(totalePagato(f))} ricevuti / ${fmt(residuo(f))} residuo: apri la fattura`}
                          className="pill-partial"
                        >
                          <Wallet /> Acconto
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
                        className="pill-wait disabled:opacity-60 disabled:cursor-wait"
                        title="In attesa: clicca per segnarla incassata"
                      >
                        <X /> In attesa
                      </button>
                    );
                  })()}
                </td>
                <td className="text-center" onClick={(e) => e.stopPropagation()}>
                  {/* Trasmessa da qui: lo stato vero. Registrata a mano: la spunta */}
                  {gestitaVf(f) ? (
                    <StatoVf stato={f.vfStato} />
                  ) : (
                    <Spunta
                      on={f.presentata}
                      onClick={() => togglePresentata(f)}
                      title={
                        f.presentata
                          ? `Presentata${f.presentataIl ? ` il ${dataIt(f.presentataIl)}` : ""}: clicca per annullare`
                          : "Non presentata: clicca per segnarla come presentata"
                      }
                    />
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end">
                    {/* La busta è un segno (mail partita), non un bottone: l'invio sta nel menu */}
                    {f.inviata && (
                      <span
                        className="inline-flex items-center justify-center w-7 h-7 text-gray-400 cursor-help"
                        title={
                          f.dataInvio
                            ? `Inviata via email il ${dataIt(f.dataInvio)}`
                            : "Segnata come inviata al cliente"
                        }
                      >
                        <MailOpen className="w-4 h-4" />
                      </span>
                    )}
                    <RowMenu title="Azioni sulla fattura">
                      {(chiudi) => (
                        <>
                          {/* Si accende solo se il registro aspetta di partire */}
                          {f.vfStato === "in_coda" ? (
                            <button
                              className="menu-item"
                              title="Riprova l'invio del registro all'AEAT"
                              onClick={() => {
                                chiudi();
                                inviaAeat();
                              }}
                            >
                              <Send /> Presenta
                            </button>
                          ) : (
                            <span className="menu-item spenta">
                              <Send /> Presenta
                            </span>
                          )}
                          <div className="menu-nota">
                            {f.vfStato === "in_coda"
                              ? "Il registro è in coda per l'AEAT."
                              : gestitaVf(f)
                                ? "Già trasmessa: correzioni dal pannello."
                                : "Registrata a mano: non parte da qui."}
                          </div>
                          <div className="menu-sep" />
                          {f.cliente?.email ? (
                            <button
                              className="menu-item"
                              title={`Invia a ${f.cliente.email}`}
                              onClick={() => {
                                chiudi();
                                inviaMail(f);
                              }}
                            >
                              <Mail /> Invia via Mail
                            </button>
                          ) : (
                            <span
                              className="menu-item spenta"
                              title="Il cliente non ha un indirizzo email: completare l'anagrafica"
                            >
                              <Mail /> Invia via Mail
                            </span>
                          )}
                          <button
                            className="menu-item"
                            onClick={() => {
                              chiudi();
                              scaricaPdf(f);
                            }}
                          >
                            <FileDown /> Scarica PDF
                          </button>
                          <div className="menu-sep" />
                          <Link
                            href={`/finance/fatture/${f.id}`}
                            className="menu-item"
                            onClick={ricordaLista}
                          >
                            <ExternalLink /> Apri la fattura
                          </Link>
                        </>
                      )}
                    </RowMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
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

      {/* Barra Esporta (comune a tutta l'app): spuntate oppure tutte quelle del filtro */}
      {exportMode && (
        <ExportBar
          selected={selected.length}
          total={attive.length}
          unit="fatture"
          importo={fmt(tutte ? totale : selTotale)}
          tutte={tutte}
          onTutte={() => setTutte((t) => !t)}
          onClose={esciExport}
          groups={[
            {
              label: "Elenco",
              actions: [
                { label: "Excel", icon: <FileSpreadsheet className="text-ok" />, onClick: () => runExportExcel(exportList) },
                { label: "PDF", icon: <Download />, primary: true, onClick: () => runExportPDF(exportList) },
              ],
            },
            {
              label: "Rapporto SMH",
              actions: [
                {
                  label: "Excel",
                  icon: <FileSpreadsheet className="text-ok" />,
                  title: "Fatture ai clienti SMH con ritenuta, netto e fattura diretta da emettere",
                  onClick: () => runRapportoSmh(exportList, "xlsx"),
                },
                {
                  label: "PDF",
                  icon: <FileText className="text-brand" />,
                  title: "Fatture ai clienti SMH con ritenuta, netto e fattura diretta da emettere",
                  onClick: () => runRapportoSmh(exportList, "pdf"),
                },
              ],
            },
          ]}
        />
      )}
        </>
      )}

      {tab === "bozze" &&
        (bozze.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center text-sm text-gray-400">
            <PencilLine className="w-10 h-10 mx-auto mb-2 text-gray-400" />
            Nessuna bozza. Una fattura salvata con «Salva bozza» resta qui finché non la emetti.
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl min-w-[720px]">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Descrizione</th>
                    <th>Data</th>
                    <th>Scadenza</th>
                    <th className="text-right">Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {bozze.map((b) => (
                    <tr
                      key={b.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/finance/fatture/${b.id}`)}
                      title="Apri la bozza"
                    >
                      <td className="font-medium">
                        <Link
                          href={`/finance/fatture/${b.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-brand hover:underline"
                        >
                          {b.cliente?.nome ?? "(senza cliente)"}
                        </Link>
                        {b.tipoFattura !== "F1" && (
                          <span className="tag tag-brand ml-1.5" title="Bozza di fattura rettificativa">
                            Rett.
                          </span>
                        )}
                      </td>
                      <td className="text-gray-500">{b.descrizione || "—"}</td>
                      <td className="whitespace-nowrap">{dataIt(b.data)}</td>
                      <td className="whitespace-nowrap text-gray-500">{dataIt(b.scadenza)}</td>
                      <td className="font-semibold text-right whitespace-nowrap text-gray-900">
                        {fmt(b.importo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {tab === "proforma" && (
        <div className="glass-card rounded-2xl p-12 text-center text-sm text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
          Le proforma non ci sono ancora.
        </div>
      )}

      {showForm && (
        <FatturaFormModal
          annoDefault={anno}
          clienti={clienti}
          commerciali={commerciali}
          onClose={() => setShowForm(false)}
          onSaved={(f) => {
            setShowForm(false);
            load();
            // Una bozza si ritrova nella sua linguetta; una emessa con
            // VeriFactu si apre, per vedere com'è andato l'invio
            if (f.stato === "bozza") vaiTab("bozze");
            else if (f.vfStato) router.push(`/finance/fatture/${f.id}`);
          }}
        />
      )}

      <ImportFattureModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={load}
      />
    </div>
  );
}

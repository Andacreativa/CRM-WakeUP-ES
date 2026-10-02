"use client";

import { ExportBar, ExportButton } from "@/components/ExportBar";
import Pills from "@/components/Pills";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Download,
  FileSpreadsheet,
  FileText,
  Receipt,
  PencilLine,
  ClipboardList,
  Upload,
  Wallet,
} from "lucide-react";
import { fmt, MESI, CANALI, canaleLabel } from "@/lib/constants";
import RichiesteFattureView from "@/components/richieste/RichiesteFattureView";
import { cn, matchQ } from "@/lib/utils";
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

interface Cliente {
  id: number;
  nome: string;
  paese: string;
}
interface Acconto {
  id: number;
  importo: number;
  data: string;
  metodoPagamento: string | null;
  note: string | null;
}
interface Fattura {
  id: number;
  numero: string | null;
  data: string | null;
  clienteId: number | null;
  cliente: Cliente | null;
  azienda: string;
  aziendaNota: string | null;
  mese: number;
  anno: number;
  importo: number;
  tipoIva: string;
  iva: number;
  pagato: boolean;
  metodo: string | null;
  commerciale: string | null;
  commercialeId: number | null;
  scadenza: string | null;
  acconti: Acconto[];
}

const totalePagato = (f: Fattura) =>
  (f.acconti ?? []).reduce((s, a) => s + a.importo, 0);
const residuo = (f: Fattura) => Math.max(0, f.importo - totalePagato(f));
const statoCalcolato = (f: Fattura): "pagato" | "acconto" | "attesa" => {
  if (f.pagato) return "pagato";
  if (totalePagato(f) >= f.importo) return "pagato";
  if (totalePagato(f) > 0) return "acconto";
  return "attesa";
};

type TipoIva = "igic_exenta" | "igic7";
const TIPO_IVA_OPTIONS: { value: TipoIva; label: string }[] = [
  { value: "igic_exenta", label: "IGIC Exenta" },
  { value: "igic7", label: "IGIC 7%" },
];

const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

const numeroKey = (n: string | null): number => {
  if (!n) return -Infinity;
  const digits = n.match(/\d+/g)?.join("") ?? "";
  return digits ? parseInt(digits, 10) : -Infinity;
};

const nextNumero = (
  fatture: { numero: string | null }[],
  year: number,
): string => {
  let maxCounter = 0;
  for (const f of fatture) {
    if (!f.numero) continue;
    const m = f.numero.match(/^F(\d{4})(\d+)$/);
    if (!m || parseInt(m[1], 10) !== year) continue;
    const counter = parseInt(m[2], 10);
    if (counter > maxCounter) maxCounter = counter;
  }
  return `F${year}${maxCounter + 1}`;
};

const emptyForm = {
  numero: "",
  clienteId: "",
  azienda: CANALI[0],
  aziendaNota: "",
  commerciale: "",
  commercialeId: "",
  mese: new Date().getMonth() + 1,
  anno: 2025,
  importo: "",
  tipoIva: "igic_exenta" as TipoIva,
  pagato: false,
  scadenza: "",
};

// Sotto-tab della pagina (come "Fatture emesse" di Northstar). Bozze e
// proforma arrivano con la creazione fatture: per ora sono segnaposto.
type TabFatture = "emesse" | "bozze" | "da-emettere" | "proforma";
const TAB_VALIDE: TabFatture[] = ["emesse", "bozze", "da-emettere", "proforma"];

export default function FatturePage() {
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [commerciali, setCommerciali] = useState<
    { id: number; nome: string; cognome: string | null; percentualeCommissione: number }[]
  >([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fattura | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filtroMese, setFiltroMese] = useState(0);
  const [q, setQ] = useState("");
  const [filtroClienteId, setFiltroClienteId] = useState<number>(0);
  const [filtroPagato, setFiltroPagato] = useState<
    "tutti" | "pagato" | "attesa"
  >("tutti");
  const { anno } = useAnno();
  const [azienda, setAzienda] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [accontoTarget, setAccontoTarget] = useState<Fattura | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);
  // Modalità Esporta (come Northstar): le caselle compaiono solo quando serve
  const [exportMode, setExportMode] = useState(false);
  const [tab, setTab] = useState<TabFatture>("emesse");
  const [daEmettere, setDaEmettere] = useState(0);
  // La tab vive nell'indirizzo (?tab=), senza useSearchParams per non
  // richiedere un confine Suspense alla pagina.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (TAB_VALIDE as string[]).includes(t)) setTab(t as TabFatture);
  }, []);
  const vaiTab = (t: TabFatture) => {
    setTab(t);
    window.history.replaceState(null, "", t === "emesse" ? "/finance/fatture" : `/finance/fatture?tab=${t}`);
  };
  useEffect(() => {
    fetch(`/api/richieste-fattura?anno=${anno}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) =>
        setDaEmettere(Array.isArray(rows) ? rows.filter((r) => !r.emessaEff).length : 0),
      )
      .catch(() => {});
  }, [anno, tab]);
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
    const params = new URLSearchParams();
    if (anno > 0) params.set("anno", String(anno));
    if (azienda) params.set("azienda", azienda);
    const [f, c] = await Promise.all([
      (await fetch(`/api/fatture?${params}`)).json() as Promise<any>,
      (await fetch("/api/clienti")).json() as Promise<any>,
    ]);
    setFatture(Array.isArray(f) ? f : []);
    setClienti(Array.isArray(c) ? c : []);
  };
  useEffect(() => {
    load();
  }, [anno, azienda]);

  const openNew = async () => {
    setEditing(null);
    const annoNuova = anno > 0 ? anno : new Date().getFullYear();
    // Numero e scadenza dalle Impostazioni fatture (riserva: calcolo locale)
    let numero = nextNumero(fatture, annoNuova);
    let scadenza = "";
    let tipoIva: TipoIva = emptyForm.tipoIva;
    try {
      const [n, c] = await Promise.all([
        fetch(`/api/impostazioni/fatture/prossimo-numero?anno=${annoNuova}`).then((r) => r.json()),
        fetch("/api/impostazioni/fatture").then((r) => r.json()),
      ]);
      if (n?.numero) numero = n.numero;
      if (c?.giorniScadenza > 0) {
        const d = new Date();
        d.setDate(d.getDate() + Number(c.giorniScadenza));
        scadenza = d.toISOString().slice(0, 10);
      }
      if (c?.tipoIvaDefault === "igic7") tipoIva = "igic7";
    } catch {
      /* usa i valori locali */
    }
    setForm({
      ...emptyForm,
      anno: annoNuova,
      numero,
      scadenza,
      tipoIva,
    });
    setShowForm(true);
  };
  const openEdit = (f: Fattura) => {
    setEditing(f);
    setForm({
      numero: f.numero || "",
      clienteId: f.clienteId != null ? String(f.clienteId) : "",
      azienda: f.azienda,
      aziendaNota: f.aziendaNota || "",
      commerciale: f.commerciale || "",
      commercialeId: f.commercialeId ? String(f.commercialeId) : "",
      mese: f.mese,
      anno: f.anno,
      importo: String(f.importo),
      tipoIva: (f.tipoIva === "igic7" ? "igic7" : "igic_exenta") as TipoIva,
      pagato: f.pagato,
      scadenza: f.scadenza ? f.scadenza.slice(0, 10) : "",
    });
    setShowForm(true);
  };
  const save = async () => {
    if (!form.importo) return;
    const ivaPct = form.tipoIva === "igic7" ? 7 : 0;
    const payload = {
      ...form,
      clienteId: form.clienteId ? parseInt(form.clienteId) : null,
      importo: parseFloat(form.importo),
      iva: ivaPct,
      scadenza: form.scadenza || null,
      aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
    };
    console.log(
      `[save] ${editing ? "PATCH" : "POST"} /api/fatture${editing ? "/" + editing.id : ""}`,
      payload,
    );
    const url = editing ? `/api/fatture/${editing.id}` : "/api/fatture";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res
      .json()
      .catch(() => ({ error: "non-JSON response" }));
    if (!res.ok) {
      console.error(
        `[save] ${method} FAILED status=${res.status}`,
        body,
      );
      alert(
        `Errore salvataggio (${res.status}): ${body.error ?? "errore"}${body.stage ? ` [stage=${body.stage}]` : ""}`,
      );
      return;
    }
    console.log(`[save] OK pagato=${body.pagato}`);
    setShowForm(false);
    if (editing) {
      setFatture((prev) =>
        prev.map((x) => (x.id === editing.id ? { ...x, ...body } : x)),
      );
    }
    load();
  };
  const togglePagato = async (f: Fattura) => {
    if (togglingId === f.id) return;
    setTogglingId(f.id);
    try {
      const newPagato = !f.pagato;
      console.log(
        `[togglePagato] fattura #${f.id} (${f.numero}) ${f.pagato} → ${newPagato}`,
      );
      const res = await fetch(`/api/fatture/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagato: newPagato }),
      });
      const body = await res
        .json()
        .catch(() => ({ error: "non-JSON response" }));
      if (!res.ok) {
        console.error(
          `[togglePagato] PATCH FAILED status=${res.status}`,
          body,
        );
        alert(
          `Errore aggiornamento stato (${res.status}): ${body.error ?? "errore"}${body.stage ? ` [stage=${body.stage}]` : ""}`,
        );
      } else {
        console.log(
          `[togglePagato] OK pagato=${body.pagato} (server response)`,
        );
        setFatture((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, pagato: body.pagato } : x)),
        );
      }
    } finally {
      setTogglingId(null);
    }
  };
  const del = async (id: number) => {
    if (!confirm("Eliminare questa fattura?")) return;
    await fetch(`/api/fatture/${id}`, { method: "DELETE" });
    load();
  };

  const filtered = (fatture ?? [])
    .filter((f) => {
      if (filtroMese && f.mese !== filtroMese) return false;
      if (filtroClienteId && f.clienteId !== filtroClienteId) return false;
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
    .sort((a, b) => numeroKey(b.numero) - numeroKey(a.numero));

  const clienteFiltrato = filtroClienteId
    ? (clienti.find((c) => c.id === filtroClienteId) ?? null)
    : null;

  // Cambio anno/azienda = dataset diverso: la selezione precedente non ha più senso
  useEffect(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  }, [anno, azienda]);

  // Reset page se i filtri restringono il dataset
  useEffect(() => {
    setPage(1);
  }, [filtroMese, filtroClienteId, filtroPagato, q, anno, azienda, pageSize]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── Selezione righe per export ──────────────────────────────────────────
  // La selezione vive solo sulle fatture attualmente filtrate: se un filtro
  // nasconde una riga selezionata, quella riga esce anche dall'export.
  const selected = filtered.filter((f) => selectedIds.has(f.id));
  const selTotale = selected.reduce((s, f) => s + (f?.importo ?? 0), 0);
  // Esporta: le spuntate, oppure tutte quelle del filtro
  const exportList = tutte || selected.length === 0 ? filtered : selected;

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

  const totale = filtered.reduce((s, f) => s + (f?.importo ?? 0), 0);
  const pagate = filtered.reduce(
    (s, f) =>
      s +
      (statoCalcolato(f) === "pagato" ? (f?.importo ?? 0) : totalePagato(f)),
    0,
  );
  const daIncassare = filtered.reduce(
    (s, f) => s + (statoCalcolato(f) === "pagato" ? 0 : residuo(f)),
    0,
  );

  const runExportExcel = (list: Fattura[]) => {
    const annoLabel = anno > 0 ? String(anno) : "tutti";
    const slug = clienteFiltrato
      ? `_${clienteFiltrato.nome.replace(/\s+/g, "")}`
      : "";
    const sel = list.length !== filtered.length ? "_selezione" : "";
    exportExcel(fattureToExcel(list, MESI), `fatture_${annoLabel}${slug}${sel}`);
  };

  const runExportPDF = (list: Fattura[]) => {
    const aziendaLabel = azienda ? canaleLabel(azienda) : "Tutti i canali";
    const annoStr = anno > 0 ? String(anno) : "tutti gli anni";
    const annoFile = anno > 0 ? String(anno) : "tutti";
    const parziale = list.length !== filtered.length;
    const base = clienteFiltrato
      ? `Fatture ${annoStr} — ${aziendaLabel} · ${clienteFiltrato.nome}`
      : `Fatture ${annoStr} — ${aziendaLabel}`;
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

  const runRapportoSmh = async (list: Fattura[], formato: "pdf" | "xlsx") => {
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
  const isScaduta = (f: Fattura) =>
    !f.pagato && f.scadenza && new Date(f.scadenza) < oggi;
  const isInScadenza = (f: Fattura) => {
    if (!f.scadenza || f.pagato) return false;
    const d = new Date(f.scadenza);
    const giorni = Math.ceil((d.getTime() - oggi.getTime()) / 86400000);
    return giorni >= 0 && giorni <= 7;
  };

  return (
    <div className={`space-y-6 ${exportMode ? "pb-24" : ""}`}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Fatture emesse</h1>
          <p className="page-sub">
            Fatture attive create a mano o dalle richieste. Bozze e proforma arrivano con la
            creazione fatture.
          </p>
        </div>
        {tab === "emesse" && (
          <div className="flex items-center gap-3 flex-wrap">
            <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
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
            <button
              onClick={openNew}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" /> Nuova Fattura
            </button>
          </div>
        )}
      </div>

      {/* Sotto-tab (come Northstar) */}
      <div className="flex items-center gap-7 border-b border-gray-200 overflow-x-auto">
        {(
          [
            { val: "emesse", label: "Emesse", icon: Receipt, count: fatture.length },
            { val: "bozze", label: "Bozze", icon: PencilLine },
            { val: "da-emettere", label: "Da emettere", icon: ClipboardList, count: daEmettere },
            { val: "proforma", label: "Proforma", icon: FileText },
          ] as { val: TabFatture; label: string; icon: typeof Receipt; count?: number }[]
        ).map((t) => {
          const Icon = t.icon;
          const attiva = tab === t.val;
          return (
            <button
              key={t.val}
              type="button"
              onClick={() => vaiTab(t.val)}
              className={cn(
                "flex items-center gap-2 pb-3 -mb-px text-[15px] font-semibold border-b-2 whitespace-nowrap transition-colors",
                attiva
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded-full",
                    attiva ? "bg-brand/10 text-brand" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
        <SearchBox value={q} onChange={setQ} placeholder="Cerca numero, cliente…" />
        <select
          value={filtroMese}
          onChange={(e) => setFiltroMese(parseInt(e.target.value))}
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
            onChange={(e) => setFiltroClienteId(parseInt(e.target.value) || 0)}
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
              onClick={() => setFiltroClienteId(0)}
              title="Rimuovi filtro cliente"
              className="p-1.5 rounded-lg text-gray-400 hover:text-bad hover:bg-bad/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={azienda}
          onChange={(e) => setAzienda(e.target.value)}
          className="sel"
        >
          <option value="">Tutti i canali</option>
          {CANALI.map((a) => (
            <option key={a} value={a}>
              {canaleLabel(a)}
            </option>
          ))}
        </select>
        <Pills
          value={filtroPagato}
          onChange={setFiltroPagato}
          options={[
            { val: "tutti", label: "Tutti" },
            { val: "pagato", label: "Pagati" },
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
        <table className="tbl">
          <thead>
            <tr>
              {exportMode && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.length === filtered.length}
                    onChange={() =>
                      setSelectedIds(
                        selected.length === filtered.length
                          ? new Set()
                          : new Set(filtered.map((f) => f.id)),
                      )
                    }
                    className="accent-pink-600"
                    aria-label="Seleziona tutte le fatture filtrate"
                  />
                </th>
              )}
              {[
                "Numero",
                "Cliente",
                "Canale",
                "Mese",
                "Scadenza",
                "Importo",
                "Stato",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className={`${h ==="Importo" ? "text-right" : h === "Stato" ? "text-center" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={exportMode ? 9 : 8}
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
                onClick={(e) => exportMode && toggleRow(f, e.shiftKey)}
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
                      onChange={() => toggleRow(f, false)}
                      className="accent-pink-600"
                      aria-label={`Seleziona la fattura ${f.numero ?? f.id}`}
                    />
                  </td>
                )}
                <td
                  className="px-4 py-3 text-sm font-mono font-medium text-gray-700 whitespace-nowrap"
                  style={
                    exportMode && selectedIds.has(f.id)
                      ? { boxShadow: "inset 3px 0 0 0 #e8308a" }
                      : undefined
                  }
                >
                  {f.numero ?? "—"}
                </td>
                <td className="font-medium text-gray-900">
                  {f.cliente?.nome ?? "—"}
                  <span className="ml-1 text-xs text-gray-400">
                    {f.cliente?.paese ?? ""}
                  </span>
                </td>
                <td>
                  <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                    {canaleLabel(f.azienda, f.aziendaNota)}
                  </span>
                </td>
                <td>
                  {MESI[f.mese - 1]}
                </td>
                <td>
                  {f.scadenza ? (
                    <span
                      className={`text-xs font-medium ${isScaduta(f) ? "text-bad" : isInScadenza(f) ? "text-warn" : "text-gray-500"}`}
                    >
                      {new Date(f.scadenza).toLocaleDateString("it-IT")}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="font-semibold text-gray-900 text-right">
                  {fmt(f.importo)}
                </td>
                <td className="text-center">
                  {(() => {
                    const stato = statoCalcolato(f);
                    if (stato === "pagato") {
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (f.acconti && f.acconti.length > 0) {
                              setAccontoTarget(f);
                            } else {
                              togglePagato(f);
                            }
                          }}
                          disabled={togglingId === f.id}
                          className="pill-ok inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap transition-colors disabled:opacity-60 disabled:cursor-wait"
                        >
                          <Check className="w-3 h-3" /> Pagato
                        </button>
                      );
                    }
                    if (stato === "acconto") {
                      return (
                        <span
                          title={`${fmt(totalePagato(f))} ricevuti / ${fmt(residuo(f))} residuo`}
                          className="pill-partial"
                        >
                          <Wallet className="w-3 h-3" /> Acconto
                        </span>
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
                      >
                        <X className="w-3 h-3" /> In Attesa
                      </button>
                    );
                  })()}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2 justify-end">
                    {statoCalcolato(f) !== "pagato" && (
                      <button
                        onClick={() => setAccontoTarget(f)}
                        title="Registra acconto"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-partial hover:bg-partial/10 transition-colors"
                      >
                        <Wallet className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(f)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => del(f.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-bad hover:bg-bad/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          total={filtered.length}
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

      {/* Tabella Altri Ingressi — stesso formato delle fatture */}

        </>
      )}

      {tab === "da-emettere" && <RichiesteFattureView mode="finance" embedded />}
      {(tab === "bozze" || tab === "proforma") && (
        <div className="glass-card rounded-2xl p-12 text-center text-sm text-gray-400">
          {tab === "bozze" ? (
            <PencilLine className="w-10 h-10 mx-auto mb-2 text-gray-400" />
          ) : (
            <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
          )}
          {tab === "bozze"
            ? "Le bozze di fattura arrivano con la creazione fatture (prossimo piano)."
            : "Le proforma arrivano con la creazione fatture (prossimo piano)."}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? "Modifica Fattura" : "Nuova Fattura"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Numero Fattura
                </label>
                <input
                  type="text"
                  value={form.numero}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, numero: e.target.value }))
                  }
                  placeholder="Es. F202641"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Canale *
                </label>
                <div className="flex gap-2">
                  {CANALI.map((a) => {
                    const active = form.azienda === a;
                    return (
                      <button
                        key={a}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            azienda: a,
                            aziendaNota: "",
                          }))
                        }
                        className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                        style={
                          active
                            ? {
                                background: "#e8308a",
                                color: "#fff",
                                borderColor: "#e8308a",
                              }
                            : {
                                background: "#fff",
                                borderColor: "#e5e7eb",
                                color: "#9ca3af",
                              }
                        }
                      >
                        {canaleLabel(a)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Cliente *
                </label>
                <select
                  value={form.clienteId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clienteId: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">Seleziona cliente...</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Mese *
                  </label>
                  <select
                    value={form.mese}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    {MESI_NUMS.map((m) => (
                      <option key={m} value={m}>
                        {MESI[m - 1]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Importo (€) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.importo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, importo: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
              </div>
              {/* Tipo Imposta */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Tipo Imposta
                </label>
                <div className="flex gap-2">
                  {TIPO_IVA_OPTIONS.map((o) => {
                    const active = form.tipoIva === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() =>
                          setForm((f) => ({ ...f, tipoIva: o.value }))
                        }
                        className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                        style={
                          active
                            ? {
                                background: "#fce7f3",
                                color: "#be185d",
                                borderColor: "#f9a8d4",
                              }
                            : {
                                background: "#fff",
                                borderColor: "#e5e7eb",
                                color: "#9ca3af",
                              }
                        }
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Riepilogo */}
              {(() => {
                const sub = parseFloat(form.importo) || 0;
                const pct = form.tipoIva === "igic7" ? 7 : 0;
                const imposta = (sub * pct) / 100;
                const tot = sub + imposta;
                const label =
                  form.tipoIva === "igic7" ? "IGIC 7%" : "IGIC Exenta";
                return (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotale</span>
                      <span className="font-medium">{fmt(sub)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>{label}</span>
                      <span className="font-medium">{fmt(imposta)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                      <span>TOTALE</span>
                      <span>{fmt(tot)}</span>
                    </div>
                    <div className="flex justify-between text-ok pt-1">
                      <span>Guadagno netto</span>
                      <span className="font-semibold">{fmt(sub)}</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Scadenza
                </label>
                <input
                  type="date"
                  value={form.scadenza}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, scadenza: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Commerciale
                </label>
                <select
                  value={form.commercialeId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, commercialeId: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
                >
                  <option value="">— nessuno —</option>
                  {commerciali.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.cognome ? ` ${c.cognome}` : ""} · {c.percentualeCommissione}%
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  All&apos;incasso crea la commissione in automatico (voce Commissioni).
                  {form.commerciale && !form.commercialeId
                    ? ` Valore storico: ${form.commerciale}.`
                    : ""}
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pagato}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pagato: e.target.checked }))
                  }
                  className="w-4 h-4"
                  style={{ accentColor: "#e8308a" }}
                />
                <span className="text-sm text-gray-700">Già pagata</span>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="btn btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                onClick={save}
                className="btn btn-primary flex-1"
              >
                {editing ? "Salva" : "Aggiungi"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportFattureModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={load}
      />

      {accontoTarget && (
        <AccontoModal
          fattura={accontoTarget}
          onClose={() => setAccontoTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function AccontoModal({
  fattura,
  onClose,
  onSaved,
}: {
  fattura: Fattura;
  onClose: () => void;
  onSaved: () => void;
}) {
  const giaPagato = totalePagato(fattura);
  const residuoCorrente = residuo(fattura);
  const [importo, setImporto] = useState(
    residuoCorrente > 0 ? String(residuoCorrente) : "",
  );
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const importoNum = parseFloat(importo);
    if (!importoNum || importoNum <= 0) return;
    setSaving(true);
    const res = await fetch("/api/acconti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fatturaId: fattura.id,
        importo: importoNum,
        data,
        metodoPagamento: metodoPagamento || null,
        note: note || null,
      }),
    });
    setSaving(false);
    if (!res.ok) return;
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Registra Acconto</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Fattura {fattura.numero ?? "—"} · {fattura.cliente?.nome ?? "—"}
          </p>
        </div>

        <div className="bg-partial/10 border border-partial/30 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between text-gray-700">
            <span>Importo fattura</span>
            <span className="font-semibold">{fmt(fattura.importo)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Già ricevuto</span>
            <span className="font-semibold text-ok">
              {fmt(giaPagato)}
            </span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 border-t border-partial/30 pt-1">
            <span>Residuo da incassare</span>
            <span className="text-partial">{fmt(residuoCorrente)}</span>
          </div>
        </div>

        {fattura.acconti && fattura.acconti.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-600">
              Acconti registrati
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {fattura.acconti.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1"
                >
                  <span className="text-gray-700">
                    {new Date(a.data).toLocaleDateString("it-IT")}
                    {a.metodoPagamento ? ` · ${a.metodoPagamento}` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {fmt(a.importo)}
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm("Eliminare questo acconto?")) return;
                        await fetch(`/api/acconti/${a.id}`, {
                          method: "DELETE",
                        });
                        onSaved();
                        onClose();
                      }}
                      className="text-gray-400 hover:text-bad"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Importo acconto (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Data *
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Metodo Pagamento
            </label>
            <input
              type="text"
              value={metodoPagamento}
              onChange={(e) => setMetodoPagamento(e.target.value)}
              placeholder="Bonifico, Contanti, ..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="btn btn-primary flex-1 disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Registra"}
          </button>
        </div>
      </div>
    </div>
  );
}

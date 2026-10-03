"use client";

import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Info } from "lucide-react";
import {
  fmt,
  MESI,
  CATEGORIE_INGRESSO,
  CATEGORIA_INGRESSO_LABEL,
} from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { isFinnRitenuta } from "@/lib/finn-split";
import FiltriBar from "@/components/FiltriBar";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import { cn, matchQ } from "@/lib/utils";
import AltroIngressoFormModal, { type AltroIngressoBase } from "@/components/ingressi/AltroIngressoFormModal";

type AltroIngresso = AltroIngressoBase;

const selectCls =
  "sel";

// Categoria effettiva: le ritenute create in automatico dalla ripartizione
// commerciale sono "ritenuta_commerciale" anche se nate senza categoria.
const categoriaDi = (r: AltroIngresso) =>
  r.categoria ?? (isFinnRitenuta(r) ? "ritenuta_commerciale" : "altro");

// Solo contabile: visibile ma mai sommato (l'incasso è già nella fattura).
const soloContabile = (r: AltroIngresso) => isFinnRitenuta(r) || !!r.fatturaId;

export default function AltriIngressiPage() {
  const router = useRouter();
  const { anno, setAnno } = useAnno();
  const [rows, setRows] = useState<AltroIngresso[]>([]);
  const [azienda, setAzienda] = useState("");
  const [mese, setMese] = useState(0);
  const [categoria, setCategoria] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [nuovo, setNuovo] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ anno: String(anno) });
    if (azienda) params.set("azienda", azienda);
    const data = await (await fetch(`/api/altri-ingressi?${params}`)).json();
    const arr: AltroIngresso[] = Array.isArray(data) ? data : [];
    arr.sort((a, b) => (b.anno !== a.anno ? b.anno - a.anno : b.mese - a.mese));
    setRows(arr);
  }, [anno, azienda]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [anno, azienda, mese, categoria, q, pageSize]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!mese || r.mese === mese) &&
          (!categoria || categoriaDi(r) === categoria) &&
          matchQ(q, r.fonte, r.descrizione),
      ),
    [rows, mese, categoria, q],
  );
  const sommabili = filtered.filter((r) => !soloContabile(r));
  const totale = sommabili.reduce((s, r) => s + r.importo, 0);
  const incassati = sommabili.filter((r) => r.incassato).reduce((s, r) => s + r.importo, 0);
  const contabili = filtered.filter(soloContabile).reduce((s, r) => s + r.importo, 0);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleIncassato = async (r: AltroIngresso) => {
    await fetch(`/api/altri-ingressi/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incassato: !r.incassato }),
    });
    load();
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Altri ingressi</h1>
          <p className="page-sub">
            Entrate non da fattura: cashback, rimborsi, apporti, incassi senza fattura
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar anno={anno} azienda={azienda} onAnno={setAnno} onAzienda={setAzienda} showAzienda={false} />
          <button
            onClick={() => setNuovo(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> Nuovo ingresso
          </button>
        </div>
      </div>

      <KpiGrid cols={4}>
        {[
          { label: "Totale", value: fmt(totale), color: "#e8308a" },
          { label: "Incassati", value: fmt(incassati), color: "#22c55e" },
          { label: "In attesa", value: fmt(totale - incassati), color: "#f59e0b" },
          { label: "Solo contabili", value: fmt(contabili), color: "#9ca3af" },
        ].map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} color={k.color} />
        ))}
      </KpiGrid>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca fonte, descrizione…" />
        <select value={mese} onChange={(e) => setMese(parseInt(e.target.value))} className={selectCls}>
          <option value={0}>Tutti i mesi</option>
          {MESI.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={selectCls}>
          <option value="">Tutte le categorie</option>
          {CATEGORIE_INGRESSO.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
        <span className="text-xs text-gray-400 inline-flex items-center gap-1 ml-auto">
          <Info className="w-3.5 h-3.5" />
          Le voci &quot;solo contabili&quot; (ritenute commerciali, legate a una fattura) non si sommano
        </span>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              {["Fonte", "Categoria", "Mese", "Importo", "Stato"].map((h) => (
                <th
                  key={h}
                  className={cn(
                    "",
                    h === "Importo" ? "text-right" : h === "Stato" ? "text-center" : "text-left",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-12">Nessun ingresso</td>
              </tr>
            )}
            {paged.map((r) => {
              const contabile = soloContabile(r);
              return (
                <tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/finance/altri-ingressi/${r.id}`)}>
                  <td>
                    <Link
                      href={`/finance/altri-ingressi/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-brand hover:underline"
                    >
                      {r.fonte}
                    </Link>
                    {r.descrizione && <div className="text-xs text-gray-500">{r.descrizione}</div>}
                  </td>
                  <td>
                    <span className="tag tag-neutral">
                      {CATEGORIA_INGRESSO_LABEL[categoriaDi(r)] ?? categoriaDi(r)}
                    </span>
                    {contabile && (
                      <span className="tag tag-neutral ml-1">
                        solo contabile
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {MESI[r.mese - 1]} {r.anno}
                  </td>
                  <td className={cn("px-4 py-3 text-sm font-semibold text-right text-gray-900")}>
                    {fmt(r.importo)}
                  </td>
                  <td className="text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleIncassato(r);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border",
                        r.incassato
                          ? "pill-ok"
                          : "pill-wait",
                      )}
                    >
                      {r.incassato ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {r.incassato ? "Incassato" : "In attesa"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <PageNav total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="ingressi" />
      )}

      {nuovo && (
        <AltroIngressoFormModal
          ingresso={null}
          annoDefault={anno}
          onClose={() => setNuovo(false)}
          onSaved={() => {
            setNuovo(false);
            load();
          }}
        />
      )}
    </div>
  );
}

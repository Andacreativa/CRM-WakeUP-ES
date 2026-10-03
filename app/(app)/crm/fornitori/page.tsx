"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Truck } from "lucide-react";
import { fmt, paeseGruppo } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { spesePerFornitore } from "@/lib/fornitori";
import { Kpi, KpiGrid } from "@/components/Kpi";
import Pills from "@/components/Pills";
import SearchBox from "@/components/SearchBox";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import FornitoreFormModal, { type FornitoreBase } from "@/components/crm/FornitoreFormModal";
import { FattureFornitoriTab } from "@/components/crm/FattureFornitori";
import { cn, matchQ } from "@/lib/utils";

// Fornitori come Clienti: KPI, ricerca con chip Paese (sede del fornitore),
// tabella ordinabile; la riga apre la scheda del fornitore, dove stanno
// modifica ed elimina. Linguetta "Fatture" = file delle fatture ricevute.

interface Spesa {
  fornitore: string;
  fornitoreId: number | null;
  importo: number;
}
type Ordine = "nome" | "spese";

export default function FornitoriPage() {
  const router = useRouter();
  const { anno } = useAnno();
  const [tab, setTab] = useState<"anagrafica" | "fatture">("anagrafica");
  const [fornitori, setFornitori] = useState<FornitoreBase[]>([]);
  const [spese, setSpese] = useState<Spesa[]>([]);
  const [q, setQ] = useState("");
  const [paese, setPaese] = useState("");
  const [ordine, setOrdine] = useState<Ordine>("nome");
  const [disc, setDisc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [nuovo, setNuovo] = useState(false);

  const load = useCallback(async () => {
    const params = anno > 0 ? `?anno=${anno}` : "";
    const [f, s] = await Promise.all([
      fetch("/api/fornitori").then((r) => r.json()),
      fetch(`/api/spese${params}`).then((r) => r.json()),
    ]);
    setFornitori(Array.isArray(f) ? f : []);
    setSpese(Array.isArray(s) ? s : []);
  }, [anno]);
  useEffect(() => {
    load();
  }, [load]);
  const conReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const perFornitore = useMemo(() => spesePerFornitore(spese, fornitori), [spese, fornitori]);
  const righe = useMemo(
    () =>
      fornitori.map((f) => {
        const sp = perFornitore.get(f.id) ?? [];
        return { f, totale: sp.reduce((t, s) => t + s.importo, 0), n: sp.length };
      }),
    [fornitori, perFornitore],
  );
  const filtered = useMemo(() => {
    const rows = righe.filter(
      ({ f }) => (!paese || paeseGruppo(f.paese) === paese) && matchQ(q, f.nome, f.partitaIva, f.email, f.citta, f.paese),
    );
    const dir = disc ? -1 : 1;
    rows.sort((a, b) =>
      ordine === "spese" ? dir * (a.totale - b.totale) : dir * a.f.nome.localeCompare(b.f.nome, "it"),
    );
    return rows;
  }, [righe, q, paese, ordine, disc]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const conteggio = (p: string) => fornitori.filter((f) => paeseGruppo(f.paese) === p).length;
  const totSpese = righe.reduce((t, r) => t + r.totale, 0);
  const annoLabel = anno > 0 ? String(anno) : "tutti gli anni";
  const filtriAttivi = [q.trim(), paese].filter(Boolean).length;
  const ordina = (col: Ordine) => {
    if (ordine === col) setDisc((d) => !d);
    else {
      setOrdine(col);
      setDisc(col === "spese");
    }
  };
  const freccia = (col: Ordine) =>
    ordine === col && disc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Fornitori</h1>
          <p className="page-sub">
            {fornitori.length} in anagrafica · {fmt(totSpese)} di spese ({annoLabel})
          </p>
        </div>
        {tab === "anagrafica" && (
          <button onClick={() => setNuovo(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Nuovo fornitore
          </button>
        )}
      </div>

      <Pills
        value={tab}
        onChange={(v) => setTab(v as "anagrafica" | "fatture")}
        options={[
          { val: "anagrafica", label: "Anagrafica" },
          { val: "fatture", label: "Fatture ricevute" },
        ]}
      />

      {tab === "fatture" ? (
        <FattureFornitoriTab fornitori={fornitori} onFornitoreCreato={load} />
      ) : (
        <>
          <KpiGrid cols={4}>
            <Kpi label="Fornitori" value={String(fornitori.length)} icon={Truck} iconColor="#3b82f6" />
            <Kpi label="Italia" value={String(conteggio("Italia"))} />
            <Kpi label="Spagna" value={String(conteggio("Spagna"))} />
            <Kpi label={`Spese ${annoLabel}`} value={fmt(totSpese)} valueClass="text-bad" />
          </KpiGrid>

          <div className="glass-card rounded-2xl p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <SearchBox value={q} onChange={conReset(setQ)} placeholder="Cerca nome, NIF, email, città…" className="w-80" />
              <PageSizeSelect pageSize={pageSize} onChange={conReset(setPageSize)} />
              {filtriAttivi > 0 && (
                <button
                  onClick={() => {
                    setQ("");
                    setPaese("");
                    setPage(1);
                  }}
                  className="text-xs font-semibold text-brand hover:underline ml-auto"
                >
                  Azzera filtri ({filtriAttivi})
                </button>
              )}
            </div>
            <div className="chip-row">
              <span className="chip-label">Paese</span>
              {["", "Italia", "Spagna", "Altri"].map((p) => (
                <button key={p} onClick={() => conReset(setPaese)(p)} className={cn("chip", paese === p && "active")}>
                  {p || "Tutti"}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-box">
              <Truck className="w-8 h-8" />
              <h3>{fornitori.length === 0 ? "Nessun fornitore" : "Nessun fornitore con questi filtri"}</h3>
              <p>Prova ad allargare la ricerca o azzera i filtri.</p>
            </div>
          ) : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className={cn("text-left th-sort", ordine === "nome" && "active")} onClick={() => ordina("nome")}>
                      Fornitore {freccia("nome")}
                    </th>
                    <th className="text-left">Paese · Città</th>
                    <th className="text-left">Contatti</th>
                    <th className={cn("text-right th-sort", ordine === "spese" && "active")} onClick={() => ordina("spese")}>
                      Spese {freccia("spese")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(({ f, totale, n }) => (
                    <tr key={f.id} className="cursor-pointer" onClick={() => router.push(`/crm/fornitori/${f.id}`)}>
                      <td>
                        <Link
                          href={`/crm/fornitori/${f.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-brand hover:underline"
                        >
                          {f.nome}
                        </Link>
                        <div className="text-[11px] text-gray-400">{f.partitaIva ?? "NIF mancante"}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        {f.paese}
                        {f.citta && <span className="text-gray-400"> · {f.citta}</span>}
                      </td>
                      <td className="text-xs text-gray-500 truncate max-w-[240px]">
                        {[f.email, f.telefono].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {totale > 0 ? (
                          <>
                            <span className="font-semibold text-gray-900">{fmt(totale)}</span>
                            <div className="text-[11px] text-gray-400">
                              {n} spes{n === 1 ? "a" : "e"}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && (
            <PageNav total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="fornitori" />
          )}
        </>
      )}

      {nuovo && (
        <FornitoreFormModal
          fornitore={null}
          onClose={() => setNuovo(false)}
          onSaved={(f) => {
            setNuovo(false);
            router.push(`/crm/fornitori/${f.id}`);
          }}
        />
      )}
    </div>
  );
}

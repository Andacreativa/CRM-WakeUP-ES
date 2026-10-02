"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { fmt, MESI, BRAND } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { VOCI, VOCI_ORDINE, type Voce, nomeCompleto, vociDiTipo } from "@/lib/dipendenti";
import { exportPDF } from "@/lib/export";
import { cn } from "@/lib/utils";

// Report dipendenti: due letture degli stessi dati.
// - Dettaglio mensile: per ogni persona, mese per mese, una colonna per
//   voce (stipendio, seguridad, IRPF, rimborsi, benefit, commissioni) e in
//   fondo l'elenco dei rimborsi con data e descrizione.
// - Riepilogo: bilancio generale dell'anno, persona × voce e mese × voce.

interface Persona {
  id: number;
  nome: string;
  cognome: string | null;
  tipo: string;
  attivo: boolean;
}
interface Pagamento {
  id: number;
  dipendenteId: number;
  anno: number;
  mese: number;
  voce: Voce;
  importo: number;
  data: string | null;
  note: string | null;
  fattura: { id: number; numero: string | null; cliente: { nome: string } | null } | null;
}
type Vista = "dettaglio" | "riepilogo";

const MESI_BREVI = MESI.map((m) => m.slice(0, 3));
const TIPO_LABEL: Record<string, string> = {
  dipendente: "Dipendente",
  socio_dipendente: "Socio dipendente",
  commerciale: "Commerciale",
};
const thCls = "text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5";
const somma = (rows: Pagamento[]) => rows.reduce((s, p) => s + p.importo, 0);
const dataIt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "";

export default function ReportDipendentiPage() {
  const { anno: annoCtx } = useAnno();
  const anno = annoCtx > 0 ? annoCtx : new Date().getFullYear();
  const [persone, setPersone] = useState<Persona[]>([]);
  const [pagamenti, setPagamenti] = useState<Pagamento[]>([]);
  const [vista, setVista] = useState<Vista>("dettaglio");
  const [personaId, setPersonaId] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const [p, pag] = await Promise.all([
          fetch("/api/dipendenti").then((r) => r.json()),
          fetch(`/api/pagamenti-mensili?anno=${anno}`).then((r) => r.json()),
        ]);
        setPersone(Array.isArray(p) ? p : []);
        setPagamenti(Array.isArray(pag) ? pag : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [anno]);

  // Persone con dati nell'anno (o la sola scelta), nell'ordine dell'anagrafica
  const personeConDati = useMemo(
    () =>
      persone.filter(
        (d) => (!personaId || d.id === personaId) && pagamenti.some((p) => p.dipendenteId === d.id),
      ),
    [persone, pagamenti, personaId],
  );
  const righe = useMemo(
    () => (personaId ? pagamenti.filter((p) => p.dipendenteId === personaId) : pagamenti),
    [pagamenti, personaId],
  );
  const vociUsate = VOCI_ORDINE.filter((v) => righe.some((p) => p.voce === v));
  const totaleAnno = somma(righe);
  const di = (f: (p: Pagamento) => boolean) => righe.filter(f);

  // Colonne di una persona: le voci del suo tipo più quelle che ha comunque usato
  const colonnePersona = (d: Persona) => {
    const set = new Set<Voce>(vociDiTipo(d.tipo));
    for (const p of pagamenti) if (p.dipendenteId === d.id) set.add(p.voce);
    return VOCI_ORDINE.filter((v) => set.has(v));
  };

  // ── Export ──
  const righeRiepilogoPersone = () =>
    personeConDati.map((d) => {
      const mie = di((p) => p.dipendenteId === d.id);
      return [
        nomeCompleto(d),
        ...vociUsate.map((v) => somma(mie.filter((p) => p.voce === v))),
        somma(mie),
      ];
    });
  const righeRiepilogoMesi = () =>
    MESI.map((m, i) => {
      const del = di((p) => p.mese === i + 1);
      return [m, ...vociUsate.map((v) => somma(del.filter((p) => p.voce === v))), somma(del)];
    });

  const esportaExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const intest = ["Persona", ...vociUsate.map((v) => VOCI[v].label), "Totale"];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        intest,
        ...righeRiepilogoPersone(),
        ["Totale", ...vociUsate.map((v) => somma(di((p) => p.voce === v))), totaleAnno],
      ]),
      "Riepilogo persone",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Mese", ...vociUsate.map((v) => VOCI[v].label), "Totale"],
        ...righeRiepilogoMesi(),
      ]),
      "Riepilogo mesi",
    );
    for (const d of personeConDati) {
      const cols = colonnePersona(d);
      const mie = di((p) => p.dipendenteId === d.id);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Mese", ...cols.map((v) => VOCI[v].label), "Totale"],
          ...MESI.map((m, i) => {
            const del = mie.filter((p) => p.mese === i + 1);
            return [m, ...cols.map((v) => somma(del.filter((p) => p.voce === v))), somma(del)];
          }),
          ["Totale", ...cols.map((v) => somma(mie.filter((p) => p.voce === v))), somma(mie)],
        ]),
        nomeCompleto(d).slice(0, 31),
      );
    }
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        [...righe]
          .sort((a, b) => a.mese - b.mese || a.dipendenteId - b.dipendenteId)
          .map((p) => {
            const d = persone.find((x) => x.id === p.dipendenteId);
            return {
              Persona: d ? nomeCompleto(d) : p.dipendenteId,
              Mese: MESI[p.mese - 1],
              Voce: VOCI[p.voce]?.label ?? p.voce,
              Data: p.data ? new Date(p.data).toLocaleDateString("it-IT") : "",
              Importo: p.importo,
              Descrizione: p.note ?? (p.fattura ? `Fattura ${p.fattura.numero ?? p.fattura.id}` : ""),
            };
          }),
      ),
      "Movimenti",
    );
    XLSX.writeFile(wb, `report-dipendenti-${anno}${personaId ? "-persona" : ""}.xlsx`);
  };

  const esportaPDF = async () => {
    const extra: { columns: string[]; rows: (string | number)[][] }[] = [
      {
        columns: ["Mese", ...vociUsate.map((v) => VOCI[v].breve), "Totale"],
        rows: righeRiepilogoMesi().map((r) => r.map((c, i) => (i === 0 ? String(c) : fmt(Number(c))))),
      },
    ];
    if (vista === "dettaglio") {
      for (const d of personeConDati) {
        const cols = colonnePersona(d);
        const mie = di((p) => p.dipendenteId === d.id);
        extra.push({
          columns: [nomeCompleto(d), ...cols.map((v) => VOCI[v].breve), "Totale"],
          rows: [
            ...MESI_BREVI.map((m, i) => {
              const del = mie.filter((p) => p.mese === i + 1);
              return [m, ...cols.map((v) => fmt(somma(del.filter((p) => p.voce === v)))), fmt(somma(del))];
            }),
            ["Totale", ...cols.map((v) => fmt(somma(mie.filter((p) => p.voce === v)))), fmt(somma(mie))],
          ],
        });
        const rimborsi = mie.filter((p) => p.voce === "rimborsi");
        if (rimborsi.length) {
          extra.push({
            columns: [`Rimborsi ${nomeCompleto(d)}`, "Data", "Descrizione", "Importo"],
            rows: rimborsi
              .sort((a, b) => a.mese - b.mese)
              .map((p) => [MESI[p.mese - 1], dataIt(p.data), p.note ?? "", fmt(p.importo)]),
          });
        }
      }
    }
    await exportPDF(
      `Report dipendenti ${anno}${personaId ? ` — ${nomeCompleto(persone.find((d) => d.id === personaId)!)}` : ""}`,
      ["Persona", ...vociUsate.map((v) => VOCI[v].label), "Totale"],
      righeRiepilogoPersone().map((r) => r.map((c, i) => (i === 0 ? String(c) : fmt(Number(c))))),
      `report-dipendenti-${anno}`,
      {
        extraTables: extra,
        footerCells: [
          { label: "Totale anno", value: fmt(totaleAnno), color: [233, 30, 140] },
          ...vociUsate.slice(0, 3).map((v) => ({
            label: VOCI[v].label,
            value: fmt(somma(di((p) => p.voce === v))),
          })),
        ],
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report {anno}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {vista === "dettaglio"
              ? "Per persona, mese per mese, voce per voce"
              : "Bilancio generale dell'anno: persone e voci"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(
              [
                { val: "dettaglio", label: "Dettaglio mensile" },
                { val: "riepilogo", label: "Riepilogo" },
              ] as { val: Vista; label: string }[]
            ).map((o) => (
              <button
                key={o.val}
                type="button"
                onClick={() => setVista(o.val)}
                className="text-sm px-3 py-1.5 rounded-lg font-medium transition-colors"
                style={vista === o.val ? { background: BRAND, color: "#fff" } : { color: "#64748b" }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <select
            value={personaId}
            onChange={(e) => setPersonaId(parseInt(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-pink-300"
          >
            <option value={0}>Tutte le persone</option>
            {persone.map((d) => (
              <option key={d.id} value={d.id}>
                {nomeCompleto(d)}
              </option>
            ))}
          </select>
          <button
            onClick={esportaExcel}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
          <button
            onClick={esportaPDF}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50"
          >
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Totale anno</p>
          <p className="text-2xl font-bold mt-1" style={{ color: BRAND }}>
            {fmt(totaleAnno)}
          </p>
        </div>
        {vociUsate.slice(0, 3).map((v) => (
          <div key={v} className="glass-card rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{VOCI[v].label}</p>
            <p className="text-2xl font-bold mt-1 text-gray-900">{fmt(somma(di((p) => p.voce === v)))}</p>
          </div>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>}
      {!loading && righe.length === 0 && (
        <div className="glass-card rounded-2xl p-10 text-center text-sm text-gray-400">
          Nessun pagamento registrato nel {anno}.
        </div>
      )}

      {/* ── Dettaglio mensile: una tabella per persona ── */}
      {!loading &&
        vista === "dettaglio" &&
        personeConDati.map((d) => {
          const cols = colonnePersona(d);
          const mie = di((p) => p.dipendenteId === d.id);
          const rimborsi = mie
            .filter((p) => p.voce === "rimborsi")
            .sort((a, b) => a.mese - b.mese || (a.data ?? "").localeCompare(b.data ?? ""));
          return (
            <div key={d.id} className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <div className="text-sm font-bold text-gray-900">{nomeCompleto(d)}</div>
                  <div className="text-[11px] text-gray-400">{TIPO_LABEL[d.tipo] ?? d.tipo}</div>
                </div>
                <div className="text-sm font-bold text-gray-900">{fmt(somma(mie))}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className={cn(thCls, "text-left")}>Mese</th>
                      {cols.map((v) => (
                        <th key={v} className={cn(thCls, "text-right whitespace-nowrap")}>
                          {VOCI[v].label}
                        </th>
                      ))}
                      <th className={cn(thCls, "text-right")}>Totale</th>
                    </tr>
                  </thead>
                  <tbody className="zebra">
                    {MESI.map((m, i) => {
                      const del = mie.filter((p) => p.mese === i + 1);
                      if (!del.length) return null;
                      return (
                        <tr key={m} className="border-b border-gray-50">
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{m}</td>
                          {cols.map((v) => {
                            const voce = del.filter((p) => p.voce === v);
                            const tot = somma(voce);
                            return (
                              <td
                                key={v}
                                className="px-4 py-2.5 text-sm text-right text-gray-700 tabular-nums"
                                title={
                                  voce.length > 1
                                    ? voce.map((p) => `${dataIt(p.data)} ${p.note ?? ""} ${fmt(p.importo)}`).join("\n")
                                    : undefined
                                }
                              >
                                {tot > 0 ? fmt(tot) : <span className="text-gray-300">—</span>}
                                {v === "rimborsi" && voce.length > 1 && (
                                  <div className="text-[10px] text-gray-400">{voce.length} voci</div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-2.5 text-sm text-right font-semibold text-gray-900 tabular-nums">
                            {fmt(somma(del))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-100">
                      <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Totale
                      </td>
                      {cols.map((v) => (
                        <td key={v} className="px-4 py-2.5 text-sm text-right font-semibold text-gray-800 tabular-nums">
                          {fmt(somma(mie.filter((p) => p.voce === v)))}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-sm text-right font-bold text-gray-900 tabular-nums">
                        {fmt(somma(mie))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {rimborsi.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Rimborsi nel dettaglio
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                    {rimborsi.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-[11px] text-gray-400 w-20 shrink-0">
                            {MESI_BREVI[p.mese - 1]} {dataIt(p.data)}
                          </span>
                          <span className="text-gray-700 truncate">{p.note ?? "rimborso"}</span>
                        </div>
                        <span className="font-semibold text-gray-900 tabular-nums">{fmt(p.importo)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      {/* ── Riepilogo: bilancio generale ── */}
      {!loading && vista === "riepilogo" && righe.length > 0 && (
        <>
          <Tabella
            titolo="Per persona"
            colonne={[...vociUsate.map((v) => VOCI[v].label)]}
            righe={personeConDati.map((d) => ({
              label: nomeCompleto(d),
              sub: TIPO_LABEL[d.tipo],
              valori: vociUsate.map((v) => somma(di((p) => p.dipendenteId === d.id && p.voce === v))),
            }))}
            totali={vociUsate.map((v) => somma(di((p) => p.voce === v)))}
          />
          <Tabella
            titolo="Per mese"
            colonne={[...vociUsate.map((v) => VOCI[v].label)]}
            righe={MESI.map((m, i) => ({
              label: m,
              valori: vociUsate.map((v) => somma(di((p) => p.mese === i + 1 && p.voce === v))),
            })).filter((r) => r.valori.some((x) => x > 0))}
            totali={vociUsate.map((v) => somma(di((p) => p.voce === v)))}
          />
        </>
      )}
    </div>
  );
}

function Tabella({
  titolo,
  colonne,
  righe,
  totali,
}: {
  titolo: string;
  colonne: string[];
  righe: { label: string; sub?: string; valori: number[] }[];
  totali: number[];
}) {
  const totRiga = (v: number[]) => v.reduce((s, x) => s + x, 0);
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-bold text-gray-900">{titolo}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className={cn(thCls, "text-left")} />
              {colonne.map((c) => (
                <th key={c} className={cn(thCls, "text-right whitespace-nowrap")}>
                  {c}
                </th>
              ))}
              <th className={cn(thCls, "text-right")}>Totale</th>
            </tr>
          </thead>
          <tbody className="zebra">
            {righe.map((r) => (
              <tr key={r.label} className="border-b border-gray-50">
                <td className="px-4 py-2.5">
                  <div className="text-sm font-medium text-gray-800">{r.label}</div>
                  {r.sub && <div className="text-[11px] text-gray-400">{r.sub}</div>}
                </td>
                {r.valori.map((v, i) => (
                  <td key={i} className="px-4 py-2.5 text-sm text-right text-gray-700 tabular-nums">
                    {v > 0 ? fmt(v) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-sm text-right font-semibold text-gray-900 tabular-nums">
                  {fmt(totRiga(r.valori))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-100">
              <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Totale</td>
              {totali.map((t, i) => (
                <td key={i} className="px-4 py-2.5 text-sm text-right font-semibold text-gray-800 tabular-nums">
                  {t > 0 ? fmt(t) : "—"}
                </td>
              ))}
              <td className="px-4 py-2.5 text-sm text-right font-bold text-gray-900 tabular-nums">
                {fmt(totRiga(totali))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

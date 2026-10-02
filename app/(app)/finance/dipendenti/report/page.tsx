"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { VOCI, VOCI_ORDINE, type Voce, nomeCompleto } from "@/lib/dipendenti";
import { exportExcel } from "@/lib/export";

interface Persona {
  id: number;
  nome: string;
  cognome: string | null;
  tipo: string;
}
interface Pagamento {
  id: number;
  dipendenteId: number;
  anno: number;
  mese: number;
  voce: Voce;
  importo: number;
}

const MESI_BREVI = MESI.map((m) => m.slice(0, 3));

export default function ReportDipendentiPage() {
  const { anno: annoCtx } = useAnno();
  const anno = annoCtx > 0 ? annoCtx : new Date().getFullYear();
  const [persone, setPersone] = useState<Persona[]>([]);
  const [pagamenti, setPagamenti] = useState<Pagamento[]>([]);
  const [personaId, setPersonaId] = useState(0);

  useEffect(() => {
    (async () => {
      const [p, pag] = await Promise.all([
        fetch("/api/dipendenti").then((r) => r.json()),
        fetch(`/api/pagamenti-mensili?anno=${anno}`).then((r) => r.json()),
      ]);
      setPersone(Array.isArray(p) ? p : []);
      setPagamenti(Array.isArray(pag) ? pag : []);
    })();
  }, [anno]);

  const righe = useMemo(
    () => (personaId ? pagamenti.filter((p) => p.dipendenteId === personaId) : pagamenti),
    [pagamenti, personaId],
  );
  const somma = (f: (p: Pagamento) => boolean) =>
    righe.filter(f).reduce((s, p) => s + p.importo, 0);

  const vociUsate = VOCI_ORDINE.filter((v) => righe.some((p) => p.voce === v));
  const personeConDati = persone.filter((d) => righe.some((p) => p.dipendenteId === d.id));
  const totaleAnno = somma(() => true);

  // Tabella 1: per persona (o per voce della persona scelta) × mese
  const righeTab1: { label: string; sub?: string; f: (p: Pagamento) => boolean }[] = personaId
    ? vociUsate.map((v) => ({ label: VOCI[v].label, f: (p) => p.voce === v }))
    : personeConDati.map((d) => ({
        label: nomeCompleto(d),
        sub: d.tipo === "commerciale" ? "Commerciale" : d.tipo === "socio_dipendente" ? "Socio dipendente" : "Dipendente",
        f: (p) => p.dipendenteId === d.id,
      }));

  const esporta = () => {
    const rows = righe.map((p) => {
      const d = persone.find((x) => x.id === p.dipendenteId);
      return {
        Persona: d ? nomeCompleto(d) : p.dipendenteId,
        Anno: p.anno,
        Mese: MESI[p.mese - 1],
        Voce: VOCI[p.voce]?.label ?? p.voce,
        Importo: p.importo,
      };
    });
    exportExcel(rows, `pagamenti-dipendenti-${anno}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report {anno}</h1>
          <p className="text-gray-500 text-sm mt-1">
            Totali per persona e per voce, mese per mese
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
            onClick={esporta}
            className="glass-btn-secondary flex items-center gap-1.5 text-gray-700 text-sm font-medium px-3 py-2 rounded-xl"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Totale anno</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "#e8308a" }}>{fmt(totaleAnno)}</p>
        </div>
        {vociUsate.slice(0, 3).map((v) => (
          <div key={v} className="glass-card rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{VOCI[v].label}</p>
            <p className="text-2xl font-bold mt-1 text-gray-900">{fmt(somma((p) => p.voce === v))}</p>
          </div>
        ))}
      </div>

      <Tabella
        titolo={personaId ? "Per voce" : "Per persona"}
        righe={righeTab1}
        colonne={MESI_BREVI}
        valore={(f, i) => somma((p) => f(p) && p.mese === i + 1)}
        totaleRiga={(f) => somma(f)}
        totaleColonna={(i) => somma((p) => p.mese === i + 1)}
        totale={totaleAnno}
      />

      {!personaId && (
        <Tabella
          titolo="Per voce"
          righe={vociUsate.map((v) => ({ label: VOCI[v].label, f: (p: Pagamento) => p.voce === v }))}
          colonne={personeConDati.map((d) => nomeCompleto(d))}
          valore={(f, i) => somma((p) => f(p) && p.dipendenteId === personeConDati[i].id)}
          totaleRiga={(f) => somma(f)}
          totaleColonna={(i) => somma((p) => p.dipendenteId === personeConDati[i].id)}
          totale={totaleAnno}
        />
      )}
    </div>
  );
}

function Tabella({
  titolo,
  righe,
  colonne,
  valore,
  totaleRiga,
  totaleColonna,
  totale,
}: {
  titolo: string;
  righe: { label: string; sub?: string; f: (p: Pagamento) => boolean }[];
  colonne: string[];
  valore: (f: (p: Pagamento) => boolean, i: number) => number;
  totaleRiga: (f: (p: Pagamento) => boolean) => number;
  totaleColonna: (i: number) => number;
  totale: number;
}) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">{titolo}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5" />
              {colonne.map((c) => (
                <th
                  key={c}
                  className="text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2.5 whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
              <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5">
                Totale
              </th>
            </tr>
          </thead>
          <tbody className="zebra">
            {righe.length === 0 && (
              <tr>
                <td colSpan={colonne.length + 2} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nessun pagamento registrato
                </td>
              </tr>
            )}
            {righe.map((r) => (
              <tr key={r.label} className="border-b border-gray-50">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <div className="text-sm font-semibold text-gray-900">{r.label}</div>
                  {r.sub && <div className="text-[11px] text-gray-400">{r.sub}</div>}
                </td>
                {colonne.map((c, i) => {
                  const v = valore(r.f, i);
                  return (
                    <td key={c} className="px-2 py-2.5 text-right text-xs tabular-nums text-gray-700 whitespace-nowrap">
                      {v > 0 ? fmt(v) : <span className="text-gray-300">—</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-gray-900">
                  {fmt(totaleRiga(r.f))}
                </td>
              </tr>
            ))}
          </tbody>
          {righe.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-100">
                <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Totale</td>
                {colonne.map((c, i) => (
                  <td key={c} className="px-2 py-2.5 text-right text-xs font-semibold tabular-nums text-gray-700 whitespace-nowrap">
                    {totaleColonna(i) > 0 ? fmt(totaleColonna(i)) : "—"}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums" style={{ color: "#e8308a" }}>
                  {fmt(totale)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

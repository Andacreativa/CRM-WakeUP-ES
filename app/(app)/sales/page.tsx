"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink, FileText } from "lucide-react";
import { fmt } from "@/lib/constants";
import { STATI_APERTI, STATI_PIPELINE, STATO_LEAD } from "@/lib/lead";
import LeadFormModal from "@/components/crm/LeadFormModal";
import { cn } from "@/lib/utils";

interface Lead {
  id: number;
  codice: string | null;
  nome: string;
  azienda: string | null;
  valore: number | null;
  stato: string;
  responsabile: string | null;
  prossimaAzione: string | null;
  prossimaAzioneData: string | null;
  cliente: { id: number; nome: string } | null;
  preventivi: { id: number; numero: string; totale: number; status: string }[];
  createdAt: string;
}
interface Preventivo {
  id: number;
  numero: string;
  nomeCliente: string;
  aziendaCliente: string | null;
  oggetto: string;
  totale: number;
  status: string;
  createdAt: string;
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [preventivi, setPreventivi] = useState<Preventivo[]>([]);
  const [nuovo, setNuovo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [l, p] = await Promise.all([
      fetch("/api/leads").then((r) => r.json()),
      fetch("/api/preventivi").then((r) => r.json()),
    ]);
    setLeads(Array.isArray(l) ? l : []);
    setPreventivi(Array.isArray(p) ? p : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const aperti = useMemo(() => leads.filter((l) => STATI_APERTI.includes(l.stato as (typeof STATI_APERTI)[number])), [leads]);
  const vinti = leads.filter((l) => l.stato === "vinta");
  const valorePipeline = aperti.reduce((s, l) => s + (l.valore ?? 0), 0);

  const sposta = async (l: Lead, stato: string) => {
    await fetch(`/api/leads/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-gray-500 text-sm mt-1">
            {aperti.length} trattative aperte · {fmt(valorePipeline)} in pipeline · {vinti.length} vinte
          </p>
        </div>
        <button onClick={() => setNuovo("nuovo")} className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Nuovo lead
        </button>
      </div>

      <div className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex gap-3" style={{ minWidth: `${STATI_PIPELINE.length * 230}px` }}>
          {STATI_PIPELINE.map((stato) => {
            const st = STATO_LEAD[stato];
            const col = leads.filter((l) => l.stato === stato);
            const val = col.reduce((s, l) => s + (l.valore ?? 0), 0);
            return (
              <div key={stato} className="flex-1 min-w-[220px] glass-card rounded-2xl p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: st.color }} />
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{st.label}</span>
                    <span className="text-[10px] font-semibold text-white rounded-full px-1.5 py-0.5" style={{ background: st.color }}>{col.length}</span>
                  </div>
                  <button onClick={() => setNuovo(stato)} className="text-gray-400 hover:text-gray-700" title="Aggiungi qui">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {val > 0 && <div className="px-1 text-[11px] text-gray-500">{fmt(val)}</div>}
                <div className="space-y-2 min-h-[80px]">
                  {col.map((l) => {
                    const scaduta = l.prossimaAzioneData ? new Date(l.prossimaAzioneData).getTime() < Date.now() : false;
                    return (
                      <div key={l.id} className="bg-white border border-gray-100 rounded-xl p-3 space-y-1.5">
                        <Link href={`/crm/lead/${l.id}`} className="block text-sm font-semibold text-gray-900 hover:text-brand leading-tight">
                          {l.azienda ?? l.nome}
                        </Link>
                        {l.azienda && l.nome !== l.azienda && <div className="text-[11px] text-gray-500">{l.nome}</div>}
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-gray-700">{l.valore != null ? fmt(l.valore) : ""}</span>
                          <span className="text-gray-400">{l.responsabile ?? ""}</span>
                        </div>
                        {l.prossimaAzione && (
                          <div className={cn("text-[11px] truncate", scaduta ? "text-bad font-semibold" : "text-gray-500")} title={l.prossimaAzione}>
                            → {l.prossimaAzione}
                            {l.prossimaAzioneData && ` · ${new Date(l.prossimaAzioneData).toLocaleDateString("it-IT")}`}
                          </div>
                        )}
                        {l.preventivi.length > 0 && (
                          <div className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                            <FileText className="w-3 h-3" /> {l.preventivi.length} preventiv{l.preventivi.length === 1 ? "o" : "i"}
                          </div>
                        )}
                        <select
                          value={l.stato}
                          onChange={(e) => sposta(l, e.target.value)}
                          className="w-full text-[11px] text-gray-500 border border-gray-100 rounded-md px-1.5 py-1 bg-gray-50 outline-none"
                          title="Sposta"
                        >
                          {STATI_PIPELINE.map((s) => (
                            <option key={s} value={s}>{STATO_LEAD[s].label}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                  {col.length === 0 && (
                    <button onClick={() => setNuovo(stato)} className="w-full text-[11px] text-gray-400 border border-dashed border-gray-200 rounded-xl py-4 hover:border-brand/40 hover:text-brand">
                      + aggiungi lead
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="glass-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Ultimi preventivi</h2>
          <Link href="/sales/preventivi" className="text-xs font-semibold text-brand hover:text-brand inline-flex items-center gap-1">
            Tutti <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["Numero", "Cliente", "Oggetto", "Stato", "Totale"].map((h) => (
                <th key={h} className={cn("text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5", h === "Totale" ? "text-right" : "text-left")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="zebra">
            {preventivi.slice(0, 8).map((p) => (
              <tr key={p.id} className="border-b border-gray-50">
                <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{p.numero}</td>
                <td className="px-4 py-2.5 text-sm text-gray-900">{p.aziendaCliente ?? p.nomeCliente}</td>
                <td className="px-4 py-2.5 text-sm text-gray-600 truncate max-w-[280px]">{p.oggetto}</td>
                <td className="px-4 py-2.5"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 capitalize">{p.status}</span></td>
                <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 text-right">{fmt(p.totale)}</td>
              </tr>
            ))}
            {preventivi.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Nessun preventivo</td></tr>
            )}
          </tbody>
        </table>
      </section>

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

"use client";

import Pills from "@/components/Pills";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { fmt } from "@/lib/constants";
import { FONTI_LEAD, STATI_LEAD, STATO_LEAD } from "@/lib/lead";
import LeadFormModal, { type LeadFormValues } from "@/components/crm/LeadFormModal";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import { cn } from "@/lib/utils";

interface Lead extends LeadFormValues {
  id: number;
  codice: string | null;
  createdAt: string;
  cliente: { id: number; nome: string } | null;
  attivita: { prossimaAzione: string | null; prossimaAzioneData: string | null }[];
  _count: { attivita: number; contatti: number };
}

const selectCls =
  "sel";

export default function LeadPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stato, setStato] = useState("");
  const [q, setQ] = useState("");
  const [fonte, setFonte] = useState("");
  const [responsabile, setResponsabile] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form, setForm] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });

  const load = useCallback(async () => {
    const data = await (await fetch("/api/leads")).json();
    setLeads(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [stato, q, fonte, responsabile, pageSize]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.stato] = (c[l.stato] ?? 0) + 1;
    return c;
  }, [leads]);
  const responsabili = useMemo(
    () => Array.from(new Set(leads.map((l) => l.responsabile).filter((x): x is string => !!x))).sort(),
    [leads],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return leads.filter(
      (l) =>
        (!stato || l.stato === stato) &&
        (!fonte || l.fonte === fonte) &&
        (!responsabile || l.responsabile === responsabile) &&
        (!s ||
          [l.nome, l.azienda, l.email, l.citta, l.codice].some((v) => (v ?? "").toLowerCase().includes(s))),
    );
  }, [leads, stato, q, fonte, responsabile]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const cambiaStato = async (l: Lead, nuovo: string) => {
    await fetch(`/api/leads/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato: nuovo }),
    });
    load();
  };
  const del = async (l: Lead) => {
    if (!confirm(`Eliminare il lead ${l.azienda ?? l.nome}?`)) return;
    await fetch(`/api/leads/${l.id}`, { method: "DELETE" });
    load();
  };

  const kpi = [
    { label: "Totale", value: leads.length },
    { label: "Nuovi", value: counts.nuovo ?? 0 },
    { label: "Contattati", value: counts.contattato ?? 0 },
    { label: "In trattativa", value: (counts.qualificato ?? 0) + (counts.prospect ?? 0) + (counts.opportunita ?? 0) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Lead</h1>
          <p className="page-sub">Potenziali clienti e trattative in corso</p>
        </div>
        <button
          onClick={() => setForm({ open: true, lead: null })}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" /> Nuovo lead
        </button>
      </div>

      <KpiGrid cols={4}>
        {kpi.map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} />
        ))}
      </KpiGrid>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca azienda, nome, email, città…" />
        <Pills
          value={stato}
          onChange={setStato}
          options={[{ value: "", label: "Tutti" }, ...STATI_LEAD].map((s) => ({
            val: s.value as string,
            label: `${s.label}${s.value && counts[s.value] ? ` (${counts[s.value]})` : s.value === "" ? ` (${leads.length})` : ""}`,
          }))}
        />
        <select value={fonte} onChange={(e) => setFonte(e.target.value)} className={selectCls}>
          <option value="">Tutte le fonti</option>
          {FONTI_LEAD.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select value={responsabile} onChange={(e) => setResponsabile(e.target.value)} className={selectCls}>
          <option value="">Tutti i responsabili</option>
          {responsabili.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl min-w-[960px]">
            <thead>
              <tr>
                {["Data", "Azienda", "Contatto", "Fonte", "Responsabile", "Città", "Stato", "Valore", "Prossima azione", ""].map((h) => (
                  <th
                    key={h}
                    className={cn(
                      "",
                      h === "Valore" ? "text-right" : "text-left",
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
                  <td colSpan={10} className="text-center text-gray-400 py-12">Nessun lead</td>
                </tr>
              )}
              {paged.map((l) => {
                const st = STATO_LEAD[l.stato] ?? STATO_LEAD.nuovo;
                const pa = l.prossimaAzione ?? l.attivita[0]?.prossimaAzione;
                const paData = l.prossimaAzioneData ?? l.attivita[0]?.prossimaAzioneData;
                const scaduta = paData ? new Date(paData).getTime() < Date.now() : false;
                return (
                  <tr key={l.id}>
                    <td className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleDateString("it-IT")}
                    </td>
                    <td>
                      <Link href={`/crm/lead/${l.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand">
                        {l.azienda ?? l.nome}
                      </Link>
                      <div className="tbl-muted">
                        {l.codice ?? ""}
                        {l.cliente && <span className="ml-1 text-ok">· cliente {l.cliente.nome}</span>}
                      </div>
                    </td>
                    <td className="text-xs">
                      {l.azienda && <div className="text-gray-900">{l.nome}</div>}
                      <div>{l.email ?? "—"}</div>
                      <div className="text-gray-400">{l.telefono ?? ""}</div>
                    </td>
                    <td className="text-xs">
                      {FONTI_LEAD.find((f) => f.value === l.fonte)?.label ?? "—"}
                      {l.fonteDettaglio && <div className="text-gray-400 truncate max-w-[140px]">{l.fonteDettaglio}</div>}
                    </td>
                    <td className="text-xs">{l.responsabile ?? "—"}</td>
                    <td className="text-xs">{l.citta ?? "—"}</td>
                    <td>
                      <select
                        value={l.stato}
                        onChange={(e) => cambiaStato(l, e.target.value)}
                        className="tag cursor-pointer"
                        style={{ background: st.color, color: "#fff" }}
                      >
                        {STATI_LEAD.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="font-semibold text-gray-900 text-right whitespace-nowrap">
                      {l.valore != null ? fmt(l.valore) : "—"}
                    </td>
                    <td className="text-xs">
                      {pa ? (
                        <>
                          <div className="text-gray-700 truncate max-w-[180px]">{pa}</div>
                          {paData && (
                            <div className={cn("text-[11px]", scaduta ? "text-bad font-semibold" : "text-gray-400")}>
                              {new Date(paData).toLocaleDateString("it-IT")}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <Link href={`/crm/lead/${l.id}`} className="p-1.5 text-gray-400 hover:text-brand" title="Apri">
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        <button onClick={() => del(l)} className="p-1.5 text-gray-400 hover:text-bad" title="Elimina">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length > 0 && (
        <PageNav total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="lead" />
      )}

      {form.open && (
        <LeadFormModal
          lead={form.lead}
          onClose={() => setForm({ open: false, lead: null })}
          onSaved={() => {
            setForm({ open: false, lead: null });
            load();
          }}
        />
      )}
    </div>
  );
}

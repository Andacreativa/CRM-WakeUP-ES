"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Search, ExternalLink } from "lucide-react";
import { fmt } from "@/lib/constants";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import ClienteFormModal, { type ClienteBase } from "@/components/crm/ClienteFormModal";
import { cn } from "@/lib/utils";

interface Cliente extends ClienteBase {
  id: number;
  fatture: { importo: number; pagato: boolean; acconti: { importo: number }[] }[];
  _count: { contatti: number; contratti: number };
}

const stats = (c: Cliente) => {
  let fatturato = 0;
  let incassato = 0;
  for (const f of c.fatture) {
    fatturato += f.importo;
    const acc = f.acconti.reduce((s, a) => s + a.importo, 0);
    incassato += f.pagato ? f.importo : Math.min(f.importo, acc);
  }
  return { fatturato, incassato, daIncassare: Math.max(0, fatturato - incassato), n: c.fatture.length };
};

const selectCls =
  "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30";

export default function ClientiPage() {
  const router = useRouter();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [paese, setPaese] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [form, setForm] = useState<{ open: boolean; cliente: Cliente | null }>({ open: false, cliente: null });

  const load = useCallback(async () => {
    const data = await (await fetch("/api/clienti")).json();
    setClienti(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [q, paese, pageSize]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clienti.filter(
      (c) =>
        (!paese || (paese === "Altri" ? !["Italia", "Spagna"].includes(c.paese) : c.paese === paese)) &&
        (!s || [c.nome, c.email, c.partitaIva, c.citta].some((v) => (v ?? "").toLowerCase().includes(s))),
    );
  }, [clienti, q, paese]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const tot = useMemo(() => {
    let fatturato = 0;
    let daIncassare = 0;
    for (const c of clienti) {
      const s = stats(c);
      fatturato += s.fatturato;
      daIncassare += s.daIncassare;
    }
    return { fatturato, daIncassare };
  }, [clienti]);

  const del = async (c: Cliente) => {
    if (!confirm(`Eliminare ${c.nome}? Le fatture restano ma perdono il collegamento.`)) return;
    await fetch(`/api/clienti/${c.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clienti</h1>
          <p className="text-gray-500 text-sm mt-1">{clienti.length} in anagrafica</p>
        </div>
        <button onClick={() => setForm({ open: true, cliente: null })} className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Nuovo cliente
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Clienti", value: String(clienti.length), color: "#111827" },
          { label: "Fatturato totale", value: fmt(tot.fatturato), color: "#22c55e" },
          { label: "Da incassare", value: fmt(tot.daIncassare), color: "#f59e0b" },
        ].map((k) => (
          <div key={k.label} className="glass-card rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome, P.IVA, email, città…" className={cn(selectCls, "pl-9 w-72")} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {["", "Italia", "Spagna", "Altri"].map((p) => (
            <button key={p} onClick={() => setPaese(p)} className="text-sm px-3 py-1.5 rounded-lg font-medium" style={paese === p ? { background: "#e8308a", color: "#fff" } : { color: "#6b7280" }}>
              {p || "Tutti"}
            </button>
          ))}
        </div>
        <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {["Cliente", "Paese", "Città", "Imposta", "Fatturato", "Incassato", "Da incassare", ""].map((h) => (
                  <th key={h} className={cn("text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3", ["Fatturato", "Incassato", "Da incassare"].includes(h) ? "text-right" : "text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="zebra">
              {paged.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-12 text-sm">Nessun cliente</td></tr>
              )}
              {paged.map((c) => {
                const s = stats(c);
                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer" onClick={() => router.push(`/crm/clienti/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">{c.nome}</div>
                      <div className="text-[11px] text-gray-400">
                        {c.partitaIva ?? "P.IVA mancante"}
                        {c.email ? ` · ${c.email}` : ""}
                        {s.n > 0 && ` · ${s.n} fattur${s.n === 1 ? "a" : "e"}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.paese}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.citta ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 whitespace-nowrap">{c.tipoImposta ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right tabular-nums">{fmt(s.fatturato)}</td>
                    <td className="px-4 py-3 text-sm text-ok text-right tabular-nums">{fmt(s.incassato)}</td>
                    <td className={cn("px-4 py-3 text-sm text-right tabular-nums", s.daIncassare > 0 ? "text-warn font-semibold" : "text-gray-400")}>{fmt(s.daIncassare)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <Link href={`/crm/clienti/${c.id}`} className="p-1.5 text-gray-400 hover:text-brand" title="Apri scheda"><ExternalLink className="w-4 h-4" /></Link>
                        <button onClick={() => setForm({ open: true, cliente: c })} className="p-1.5 text-gray-400 hover:text-gray-700" title="Modifica"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => del(c)} className="p-1.5 text-gray-400 hover:text-bad" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length > 0 && <PageNav total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="clienti" />}

      {form.open && (
        <ClienteFormModal
          cliente={form.cliente}
          onClose={() => setForm({ open: false, cliente: null })}
          onSaved={(c) => {
            setForm({ open: false, cliente: null });
            if (!form.cliente) router.push(`/crm/clienti/${c.id}`);
            else load();
          }}
        />
      )}
    </div>
  );
}

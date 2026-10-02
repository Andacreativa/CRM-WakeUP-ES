"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Search, Star, X } from "lucide-react";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import { cn } from "@/lib/utils";

interface Contatto {
  id: number;
  nome: string;
  cognome: string | null;
  ruolo: string | null;
  email: string | null;
  telefono: string | null;
  note: string | null;
  principale: boolean;
  clienteId: number | null;
  leadId: number | null;
  cliente: { id: number; nome: string } | null;
  lead: { id: number; codice: string | null; nome: string; azienda: string | null } | null;
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";
const selectCls =
  "text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-pink-300";

const vuoto = () => ({
  nome: "",
  cognome: "",
  ruolo: "",
  email: "",
  telefono: "",
  note: "",
  tipo: "cliente" as "cliente" | "lead",
  clienteId: "",
  leadId: "",
  principale: false,
});

export default function ContattiPage() {
  const [rows, setRows] = useState<Contatto[]>([]);
  const [clienti, setClienti] = useState<{ id: number; nome: string }[]>([]);
  const [leads, setLeads] = useState<{ id: number; nome: string; azienda: string | null }[]>([]);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contatto | null>(null);
  const [form, setForm] = useState(vuoto());

  const load = useCallback(async () => {
    const [c, cl, ld] = await Promise.all([
      fetch("/api/contatti").then((r) => r.json()),
      fetch("/api/clienti").then((r) => r.json()),
      fetch("/api/leads").then((r) => r.json()),
    ]);
    setRows(Array.isArray(c) ? c : []);
    setClienti(Array.isArray(cl) ? cl.map((x: { id: number; nome: string }) => ({ id: x.id, nome: x.nome })) : []);
    setLeads(Array.isArray(ld) ? ld : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [q, tipo, pageSize]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (c) =>
        (tipo === "" || (tipo === "cliente" ? !!c.clienteId : tipo === "lead" ? !!c.leadId && !c.clienteId : !c.clienteId && !c.leadId)) &&
        (!s ||
          [c.nome, c.cognome, c.email, c.telefono, c.ruolo, c.cliente?.nome, c.lead?.azienda, c.lead?.nome].some((v) =>
            (v ?? "").toLowerCase().includes(s),
          )),
    );
  }, [rows, q, tipo]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openNew = () => {
    setEditing(null);
    setForm(vuoto());
    setShowForm(true);
  };
  const openEdit = (c: Contatto) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      cognome: c.cognome ?? "",
      ruolo: c.ruolo ?? "",
      email: c.email ?? "",
      telefono: c.telefono ?? "",
      note: c.note ?? "",
      tipo: c.clienteId ? "cliente" : "lead",
      clienteId: c.clienteId ? String(c.clienteId) : "",
      leadId: c.leadId ? String(c.leadId) : "",
      principale: c.principale,
    });
    setShowForm(true);
  };
  const save = async () => {
    if (!form.nome.trim()) return;
    const payload = {
      nome: form.nome,
      cognome: form.cognome,
      ruolo: form.ruolo,
      email: form.email,
      telefono: form.telefono,
      note: form.note,
      clienteId: form.tipo === "cliente" ? form.clienteId || null : null,
      leadId: form.tipo === "lead" ? form.leadId || null : null,
      principale: form.principale,
    };
    await fetch(editing ? `/api/contatti/${editing.id}` : "/api/contatti", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowForm(false);
    load();
  };
  const del = async (c: Contatto) => {
    if (!confirm(`Eliminare il referente ${c.nome}?`)) return;
    await fetch(`/api/contatti/${c.id}`, { method: "DELETE" });
    load();
  };
  const setPrincipale = async (c: Contatto) => {
    await fetch(`/api/contatti/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principale: true }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contatti</h1>
          <p className="text-gray-500 text-sm mt-1">Persone di riferimento dei clienti e dei lead</p>
        </div>
        <button onClick={openNew} className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl">
          <Plus className="w-4 h-4" /> Nuovo contatto
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome, email, cliente…" className={cn(selectCls, "pl-9 w-72")} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { v: "", l: "Tutti" },
            { v: "cliente", l: "Di clienti" },
            { v: "lead", l: "Di lead" },
            { v: "nessuno", l: "Non collegati" },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => setTipo(o.v)}
              className="text-sm px-3 py-1.5 rounded-lg font-medium"
              style={tipo === o.v ? { background: "#e8308a", color: "#fff" } : { color: "#64748b" }}
            >
              {o.l}
            </button>
          ))}
        </div>
        <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {["Contatto", "Di", "Email", "Telefono", "", ""].map((h, i) => (
                <th key={i} className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="zebra">
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-gray-400 py-12 text-sm">Nessun contatto</td>
              </tr>
            )}
            {paged.map((c) => (
              <tr key={c.id} className="border-b border-gray-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">
                    {c.nome}{c.cognome ? ` ${c.cognome}` : ""}
                  </div>
                  {c.ruolo && <div className="text-xs text-gray-500">{c.ruolo}</div>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {c.cliente ? (
                    <Link href={`/crm/clienti/${c.cliente.id}`} className="inline-flex items-center gap-1.5 hover:text-pink-600">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">cliente</span>
                      {c.cliente.nome}
                    </Link>
                  ) : c.lead ? (
                    <Link href={`/crm/lead/${c.lead.id}`} className="inline-flex items-center gap-1.5 hover:text-pink-600">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">lead</span>
                      {c.lead.azienda ?? c.lead.nome}
                    </Link>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{c.telefono ?? "—"}</td>
                <td className="px-4 py-3">
                  {c.clienteId && (
                    <button
                      onClick={() => !c.principale && setPrincipale(c)}
                      className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md", c.principale ? "bg-amber-50 text-amber-700" : "text-gray-300 hover:text-amber-600")}
                      title={c.principale ? "Referente principale" : "Imposta come principale"}
                    >
                      <Star className="w-3 h-3" /> {c.principale ? "principale" : ""}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Modifica"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => del(c)} className="p-1.5 text-gray-400 hover:text-red-500" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <PageNav total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="contatti" />
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editing ? "Modifica contatto" : "Nuovo contatto"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nome *</label>
                <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cognome</label>
                <input value={form.cognome} onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ruolo</label>
                <input value={form.ruolo} onChange={(e) => setForm((f) => ({ ...f, ruolo: e.target.value }))} className={inputCls} placeholder="Es. titolare, marketing" />
              </div>
              <div>
                <label className={labelCls}>Telefono</label>
                <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Email</label>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Collegato a</label>
                <div className="flex gap-2 mb-2">
                  {(["cliente", "lead"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo: t }))}
                      className="flex-1 text-sm py-2 rounded-lg border font-semibold"
                      style={form.tipo === t ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" } : { background: "#fff", borderColor: "#e2e8f0", color: "#94a3b8" }}
                    >
                      {t === "cliente" ? "Cliente" : "Lead"}
                    </button>
                  ))}
                </div>
                {form.tipo === "cliente" ? (
                  <select value={form.clienteId} onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value }))} className={inputCls}>
                    <option value="">— nessuno —</option>
                    {clienti.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                ) : (
                  <select value={form.leadId} onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value }))} className={inputCls}>
                    <option value="">— nessuno —</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>{l.azienda ?? l.nome}</option>
                    ))}
                  </select>
                )}
              </div>
              {form.tipo === "cliente" && (
                <label className="col-span-2 flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.principale} onChange={(e) => setForm((f) => ({ ...f, principale: e.target.checked }))} />
                  Referente principale del cliente
                </label>
              )}
              <div className="col-span-2">
                <label className={labelCls}>Note</label>
                <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Annulla</button>
              <button onClick={save} className="glass-btn-primary text-white text-sm font-medium px-5 py-2 rounded-xl">{editing ? "Salva" : "Aggiungi"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

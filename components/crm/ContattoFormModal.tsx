"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import ClienteSelect from "@/components/crm/ClienteSelect";

// Form del contatto (referente di un cliente o di un lead): Nuovo e
// Modifica. Usato dalla lista Contatti e dalla scheda del contatto.

export interface ContattoBase {
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
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

export default function ContattoFormModal({
  contatto,
  onClose,
  onSaved,
}: {
  contatto: ContattoBase | null;
  onClose: () => void;
  onSaved: (c: { id: number }) => void;
}) {
  const [form, setForm] = useState({
    nome: contatto?.nome ?? "",
    cognome: contatto?.cognome ?? "",
    ruolo: contatto?.ruolo ?? "",
    email: contatto?.email ?? "",
    telefono: contatto?.telefono ?? "",
    note: contatto?.note ?? "",
    tipo: (contatto?.leadId && !contatto.clienteId ? "lead" : "cliente") as "cliente" | "lead",
    clienteId: contatto?.clienteId ? String(contatto.clienteId) : "",
    leadId: contatto?.leadId ? String(contatto.leadId) : "",
    principale: contatto?.principale ?? false,
  });
  const [clienti, setClienti] = useState<{ id: number; nome: string }[]>([]);
  const [leads, setLeads] = useState<{ id: number; nome: string; azienda: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clienti?min=1")
      .then((r) => r.json())
      .then((c) => setClienti(Array.isArray(c) ? c : []))
      .catch(() => {});
    fetch("/api/leads")
      .then((r) => r.json())
      .then((l) => setLeads(Array.isArray(l) ? l : []))
      .catch(() => {});
  }, []);

  const salva = async () => {
    if (!form.nome.trim()) {
      setErr("Il nome è obbligatorio");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(contatto ? `/api/contatti/${contatto.id}` : "/api/contatti", {
        method: contatto ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          cognome: form.cognome,
          ruolo: form.ruolo,
          email: form.email,
          telefono: form.telefono,
          note: form.note,
          clienteId: form.tipo === "cliente" ? form.clienteId || null : null,
          leadId: form.tipo === "lead" ? form.leadId || null : null,
          principale: form.tipo === "cliente" && form.principale,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Salvataggio non riuscito");
        return;
      }
      onSaved(j);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{contatto ? "Modifica contatto" : "Nuovo contatto"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Nome *</label>
            <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} className={inputCls} autoFocus={!contatto} />
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
                  style={form.tipo === t ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" } : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }}
                >
                  {t === "cliente" ? "Cliente" : "Lead"}
                </button>
              ))}
            </div>
            {form.tipo === "cliente" ? (
              <ClienteSelect
                value={form.clienteId}
                onChange={(id) => setForm((f) => ({ ...f, clienteId: id }))}
                clienti={clienti}
                placeholder="— nessuno —"
              />
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
              <input type="checkbox" checked={form.principale} onChange={(e) => setForm((f) => ({ ...f, principale: e.target.checked }))} className="accent-pink-600" />
              Referente principale del cliente
            </label>
          )}
          <div className="col-span-2">
            <label className={labelCls}>Note</label>
            <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={`${inputCls} min-h-[64px]`} />
          </div>
        </div>
        {err && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Annulla</button>
          <button onClick={salva} disabled={busy} className="btn btn-primary disabled:opacity-60">
            {busy ? "Salvataggio…" : contatto ? "Salva" : "Aggiungi"}
          </button>
        </div>
      </div>
    </div>
  );
}

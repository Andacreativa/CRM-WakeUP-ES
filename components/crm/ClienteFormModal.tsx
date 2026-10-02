"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PAESI, TIPO_IMPOSTA_OPTIONS } from "@/lib/constants";
import AddressFields from "@/components/AddressFields";

export interface ClienteBase {
  id?: number;
  nome: string;
  paese: string;
  email: string | null;
  telefono: string | null;
  partitaIva: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  iban: string | null;
  tipoImposta: string | null;
  note: string | null;
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

export default function ClienteFormModal({
  cliente,
  onClose,
  onSaved,
}: {
  cliente: ClienteBase | null;
  onClose: () => void;
  onSaved: (c: { id: number }) => void;
}) {
  const [form, setForm] = useState({
    nome: cliente?.nome ?? "",
    paese: cliente?.paese ?? "Italia",
    email: cliente?.email ?? "",
    telefono: cliente?.telefono ?? "",
    partitaIva: cliente?.partitaIva ?? "",
    via: cliente?.via ?? "",
    cap: cliente?.cap ?? "",
    citta: cliente?.citta ?? "",
    provincia: cliente?.provincia ?? "",
    iban: cliente?.iban ?? "",
    tipoImposta: cliente?.tipoImposta ?? "IGIC Exenta",
    note: cliente?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const salva = async () => {
    if (!form.nome.trim()) {
      setErr("La ragione sociale è obbligatoria");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(cliente?.id ? `/api/clienti/${cliente.id}` : "/api/clienti", {
        method: cliente?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{cliente?.id ? "Modifica cliente" : "Nuovo cliente"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Ragione sociale *</label>
            <input value={form.nome} onChange={(e) => set("nome", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Paese</label>
            <select value={form.paese} onChange={(e) => set("paese", e.target.value)} className={inputCls}>
              {PAESI.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tipo imposta</label>
            <div className="flex gap-2">
              {TIPO_IMPOSTA_OPTIONS.map((o) => {
                const active = form.tipoImposta === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => set("tipoImposta", o)}
                    className="flex-1 text-sm py-2 rounded-lg border font-semibold"
                    style={active ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" } : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className={labelCls}>P.IVA / NIF</label>
            <input value={form.partitaIva} onChange={(e) => set("partitaIva", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>IBAN</label>
            <input value={form.iban} onChange={(e) => set("iban", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Telefono</label>
            <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Indirizzo</p>
            <AddressFields
              value={{ via: form.via, cap: form.cap, citta: form.citta, provincia: form.provincia, paese: form.paese }}
              onChange={(a) => setForm((f) => ({ ...f, via: a.via, cap: a.cap, citta: a.citta, provincia: a.provincia, paese: a.paese || f.paese }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Note</label>
            <textarea value={form.note} onChange={(e) => set("note", e.target.value)} className={`${inputCls} min-h-[64px]`} />
          </div>
        </div>

        {err && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Annulla</button>
          <button onClick={salva} disabled={busy} className="glass-btn-primary text-white text-sm font-medium px-5 py-2 rounded-xl disabled:opacity-60">
            {busy ? "Salvataggio…" : cliente?.id ? "Salva" : "Crea cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

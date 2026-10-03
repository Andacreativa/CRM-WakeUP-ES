"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { PAESI, prefissaPiva, unisciPrefisso } from "@/lib/constants";
import AddressFields from "@/components/AddressFields";
import { trovaDoppioni, type ClienteMinimo } from "@/components/crm/ClienteFormModal";

// Form del fornitore: Nuovo e Modifica. Il paese è la sede del fornitore e
// dà il prefisso alla P.IVA/NIF, come nel form cliente.

export interface FornitoreBase {
  id: number;
  nome: string;
  paese: string;
  email: string | null;
  telefono: string | null;
  partitaIva: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  note: string | null;
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

export default function FornitoreFormModal({
  fornitore,
  onClose,
  onSaved,
}: {
  fornitore: FornitoreBase | null;
  onClose: () => void;
  onSaved: (f: { id: number }) => void;
}) {
  const nuovo = !fornitore;
  const [form, setForm] = useState(() => {
    const paese = fornitore?.paese ?? "Spagna";
    return {
      nome: fornitore?.nome ?? "",
      paese,
      email: fornitore?.email ?? "",
      telefono: fornitore?.telefono ?? "",
      partitaIva: fornitore?.partitaIva ?? (nuovo ? prefissaPiva("", paese) : ""),
      via: fornitore?.via ?? "",
      cap: fornitore?.cap ?? "",
      citta: fornitore?.citta ?? "",
      provincia: fornitore?.provincia ?? "",
      note: fornitore?.note ?? "",
    };
  });
  const [anagrafica, setAnagrafica] = useState<ClienteMinimo[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!nuovo) return;
    fetch("/api/fornitori")
      .then((r) => r.json())
      .then((f) => setAnagrafica(Array.isArray(f) ? f : []))
      .catch(() => {});
  }, [nuovo]);
  const doppioni = useMemo(() => (nuovo ? trovaDoppioni(form, anagrafica) : []), [nuovo, form, anagrafica]);

  const salva = async () => {
    if (!form.nome.trim()) {
      setErr("Il nome è obbligatorio");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(fornitore ? `/api/fornitori/${fornitore.id}` : "/api/fornitori", {
        method: fornitore ? "PATCH" : "POST",
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
          <h2 className="text-lg font-bold text-gray-900">{nuovo ? "Nuovo fornitore" : "Modifica fornitore"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Ragione sociale *</label>
            <input value={form.nome} onChange={(e) => set("nome", e.target.value)} className={inputCls} placeholder="Es. Acme SL" autoFocus={nuovo} />
          </div>
          <div>
            <label className={labelCls}>Paese (sede)</label>
            <select
              value={form.paese}
              onChange={(e) => {
                const p = e.target.value;
                setForm((f) => ({ ...f, paese: p, partitaIva: prefissaPiva(f.partitaIva, p, f.paese) }));
              }}
              className={inputCls}
            >
              {PAESI.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>P.IVA / NIF</label>
            <input value={form.partitaIva} onChange={(e) => set("partitaIva", unisciPrefisso(e.target.value))} className={inputCls} />
          </div>

          {doppioni.length > 0 && (
            <div className="md:col-span-2 rounded-lg px-3 py-2 border bg-warn/10 border-warn/30 space-y-1.5">
              <p className="text-xs font-semibold text-warn inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {doppioni.length === 1 ? "In anagrafica c'è già un fornitore simile" : `In anagrafica ci sono già ${doppioni.length} fornitori simili`}
              </p>
              {doppioni.map(({ c, motivo }) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-t border-warn/20 pt-1.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{c.nome}</div>
                    <div className="text-[11px] text-gray-500">
                      {motivo} · {c.paese}
                      {c.partitaIva ? ` · ${c.partitaIva}` : ""}
                    </div>
                  </div>
                  <Link href={`/crm/fornitori/${c.id}`} className="btn btn-secondary btn-sm shrink-0">
                    Apri scheda
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Telefono</label>
            <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Indirizzo</p>
            <AddressFields
              senzaPaese
              value={{ via: form.via, cap: form.cap, citta: form.citta, provincia: form.provincia, paese: form.paese }}
              onChange={(a) => setForm((f) => ({ ...f, via: a.via, cap: a.cap, citta: a.citta, provincia: a.provincia }))}
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
          <button onClick={salva} disabled={busy} className="btn btn-primary disabled:opacity-60">
            {busy ? "Salvataggio…" : !nuovo ? "Salva" : doppioni.length ? "Crea comunque" : "Crea fornitore"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MESI, CATEGORIE_INGRESSO } from "@/lib/constants";

// Form dell'altro ingresso (entrata non da fattura): Nuovo e Modifica.
// Usato dalla lista Altri ingressi e dalla scheda dell'ingresso.

export interface AltroIngressoBase {
  id: number;
  fonte: string;
  categoria: string | null;
  azienda: string;
  aziendaNota: string | null;
  descrizione: string | null;
  mese: number;
  anno: number;
  importo: number;
  incassato: boolean;
  dataIncasso: string | null;
  fatturaId: number | null;
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

export default function AltroIngressoFormModal({
  ingresso,
  categoria,
  annoDefault,
  onClose,
  onSaved,
}: {
  ingresso: AltroIngressoBase | null;
  // categoria effettiva (le ritenute nate senza categoria)
  categoria?: string;
  annoDefault: number;
  onClose: () => void;
  onSaved: (r: { id: number }) => void;
}) {
  const [form, setForm] = useState(() => ({
    fonte: ingresso?.fonte ?? "",
    categoria: categoria ?? ingresso?.categoria ?? "altro",
    azienda: ingresso?.azienda ?? "Spagna",
    aziendaNota: ingresso?.aziendaNota ?? "",
    descrizione: ingresso?.descrizione ?? "",
    mese: ingresso?.mese ?? new Date().getMonth() + 1,
    anno: ingresso?.anno ?? (annoDefault > 0 ? annoDefault : new Date().getFullYear()),
    importo: ingresso ? String(ingresso.importo) : "",
    incassato: ingresso?.incassato ?? false,
    dataIncasso: ingresso?.dataIncasso ? ingresso.dataIncasso.slice(0, 10) : "",
  }));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.fonte || !form.importo || saving) return;
    setSaving(true);
    try {
      const res = await fetch(ingresso ? `/api/altri-ingressi/${ingresso.id}` : "/api/altri-ingressi", {
        method: ingresso ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          importo: parseFloat(String(form.importo).replace(",", ".")),
          dataIncasso: form.dataIncasso || null,
          aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Salvataggio non riuscito");
        return;
      }
      onSaved(j);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{ingresso ? "Modifica ingresso" : "Nuovo ingresso"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Categoria</label>
                <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className={inputCls}>
                  {CATEGORIE_INGRESSO.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Fonte *</label>
                <input value={form.fonte} onChange={(e) => setForm((f) => ({ ...f, fonte: e.target.value }))} className={inputCls} placeholder="Es. BBVA, AEAT, nome cliente…" />
              </div>
              <div>
                <label className={labelCls}>Descrizione</label>
                <input value={form.descrizione} onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Mese</label>
                  <select value={form.mese} onChange={(e) => setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))} className={inputCls}>
                    {MESI.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Anno</label>
                  <input type="number" value={form.anno} onChange={(e) => setForm((f) => ({ ...f, anno: parseInt(e.target.value) || f.anno }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Importo (€)</label>
                  <input value={form.importo} onChange={(e) => setForm((f) => ({ ...f, importo: e.target.value }))} className={inputCls} inputMode="decimal" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.incassato} onChange={(e) => setForm((f) => ({ ...f, incassato: e.target.checked }))} />
                  Incassato
                </label>
                <div>
                  <label className={labelCls}>Data incasso</label>
                  <input type="date" value={form.dataIncasso} onChange={(e) => setForm((f) => ({ ...f, dataIncasso: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Annulla</button>
          <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-60">
            {ingresso ? "Salva" : "Aggiungi"}
          </button>
        </div>
      </div>
    </div>
  );
}

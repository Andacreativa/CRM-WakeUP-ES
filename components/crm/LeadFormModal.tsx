"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PAESI } from "@/lib/constants";
import {
  FONTI_LEAD,
  PRIORITA_LEAD,
  QUALIFICHE_LEAD,
  STATI_LEAD,
} from "@/lib/lead";
import { cn } from "@/lib/utils";

export interface LeadFormValues {
  id?: number;
  nome: string;
  azienda: string | null;
  email: string | null;
  telefono: string | null;
  valore: number | null;
  stato: string;
  fonte: string | null;
  fonteDettaglio: string | null;
  responsabile: string | null;
  qualifica: string;
  priorita: string;
  paese: string | null;
  citta: string | null;
  partitaIva: string | null;
  sitoWeb: string | null;
  settore: string | null;
  prossimaAzione: string | null;
  prossimaAzioneData: string | null;
  note: string | null;
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

const vuoto = () => ({
  azienda: "",
  nome: "",
  email: "",
  telefono: "",
  valore: "",
  stato: "nuovo",
  fonte: "",
  fonteDettaglio: "",
  responsabile: "",
  qualifica: "fredda",
  priorita: "media",
  paese: "Italia",
  citta: "",
  partitaIva: "",
  sitoWeb: "",
  settore: "",
  prossimaAzione: "",
  prossimaAzioneData: "",
  note: "",
});

export default function LeadFormModal({
  lead,
  statoIniziale,
  onClose,
  onSaved,
}: {
  lead: LeadFormValues | null;
  statoIniziale?: string;
  onClose: () => void;
  onSaved: (lead: { id: number }) => void;
}) {
  const [form, setForm] = useState(() =>
    lead
      ? {
          azienda: lead.azienda ?? "",
          nome: lead.nome ?? "",
          email: lead.email ?? "",
          telefono: lead.telefono ?? "",
          valore: lead.valore != null ? String(lead.valore) : "",
          stato: lead.stato,
          fonte: lead.fonte ?? "",
          fonteDettaglio: lead.fonteDettaglio ?? "",
          responsabile: lead.responsabile ?? "",
          qualifica: lead.qualifica,
          priorita: lead.priorita,
          paese: lead.paese ?? "Italia",
          citta: lead.citta ?? "",
          partitaIva: lead.partitaIva ?? "",
          sitoWeb: lead.sitoWeb ?? "",
          settore: lead.settore ?? "",
          prossimaAzione: lead.prossimaAzione ?? "",
          prossimaAzioneData: lead.prossimaAzioneData ? lead.prossimaAzioneData.slice(0, 10) : "",
          note: lead.note ?? "",
        }
      : { ...vuoto(), stato: statoIniziale ?? "nuovo" },
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const salva = async () => {
    if (!form.azienda.trim() && !form.nome.trim()) {
      setErr("Inserisci almeno l'azienda o il nome del contatto");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        ...form,
        nome: form.nome.trim() || form.azienda.trim(),
        valore: form.valore ? parseFloat(form.valore.replace(",", ".")) : null,
        prossimaAzioneData: form.prossimaAzioneData || null,
      };
      const res = await fetch(lead?.id ? `/api/leads/${lead.id}` : "/api/leads", {
        method: lead?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
          <h2 className="text-lg font-bold text-gray-900">{lead?.id ? "Modifica lead" : "Nuovo lead"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Azienda</label>
            <input value={form.azienda} onChange={(e) => set("azienda", e.target.value)} className={inputCls} placeholder="Ragione sociale" />
          </div>
          <div>
            <label className={labelCls}>Persona di contatto</label>
            <input value={form.nome} onChange={(e) => set("nome", e.target.value)} className={inputCls} placeholder="Nome e cognome" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Telefono</label>
            <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Fonte</label>
            <select value={form.fonte} onChange={(e) => set("fonte", e.target.value)} className={inputCls}>
              <option value="">—</option>
              {FONTI_LEAD.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Dettaglio fonte</label>
            <input value={form.fonteDettaglio} onChange={(e) => set("fonteDettaglio", e.target.value)} className={inputCls} placeholder="Es. campagna, chi lo ha segnalato" />
          </div>
          <div>
            <label className={labelCls}>Responsabile</label>
            <input value={form.responsabile} onChange={(e) => set("responsabile", e.target.value)} className={inputCls} placeholder="Chi segue il lead" />
          </div>
          <div>
            <label className={labelCls}>Valore stimato (€)</label>
            <input value={form.valore} onChange={(e) => set("valore", e.target.value)} className={inputCls} inputMode="decimal" />
          </div>
          <div>
            <label className={labelCls}>Stato</label>
            <select value={form.stato} onChange={(e) => set("stato", e.target.value)} className={inputCls}>
              {STATI_LEAD.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Qualifica</label>
              <select value={form.qualifica} onChange={(e) => set("qualifica", e.target.value)} className={inputCls}>
                {QUALIFICHE_LEAD.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priorità</label>
              <select value={form.priorita} onChange={(e) => set("priorita", e.target.value)} className={inputCls}>
                {PRIORITA_LEAD.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
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
            <label className={labelCls}>Città</label>
            <input value={form.citta} onChange={(e) => set("citta", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>P.IVA / NIF</label>
            <input value={form.partitaIva} onChange={(e) => set("partitaIva", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Settore</label>
            <input value={form.settore} onChange={(e) => set("settore", e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Sito web</label>
            <input value={form.sitoWeb} onChange={(e) => set("sitoWeb", e.target.value)} className={inputCls} placeholder="https://" />
          </div>
          <div>
            <label className={labelCls}>Prossima azione</label>
            <input value={form.prossimaAzione} onChange={(e) => set("prossimaAzione", e.target.value)} className={inputCls} placeholder="Es. richiamare, inviare proposta" />
          </div>
          <div>
            <label className={labelCls}>Entro il</label>
            <input type="date" value={form.prossimaAzioneData} onChange={(e) => set("prossimaAzioneData", e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Note</label>
            <textarea value={form.note} onChange={(e) => set("note", e.target.value)} className={cn(inputCls, "min-h-[72px]")} />
          </div>
        </div>

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Annulla</button>
          <button onClick={salva} disabled={busy} className="glass-btn-primary text-white text-sm font-medium px-5 py-2 rounded-xl disabled:opacity-60">
            {busy ? "Salvataggio…" : lead?.id ? "Salva" : "Crea lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

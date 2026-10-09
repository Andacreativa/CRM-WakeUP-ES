"use client";

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import ClienteSelect from "@/components/crm/ClienteSelect";
import type { ClienteMin } from "@/components/richieste/tipi";
import { cn } from "@/lib/utils";
import {
  type Rinnovo,
  FATTURAZIONI,
  HOSTING_NOTI,
  PROPRIETA,
  STATI_RINNOVO,
  inputCls,
  labelCls,
} from "./tipi";

const formDa = (r: Rinnovo | null) => ({
  dominio: r?.dominio ?? "",
  clienteId: r?.clienteId ? String(r.clienteId) : "",
  nomeCliente: r?.nomeCliente ?? "",
  scadenza: r?.scadenza ? r.scadenza.slice(0, 10) : "",
  importo: r ? String(r.importo || "") : "",
  fatturazione: r?.fatturazione ?? "rinnovo",
  stato: r?.stato ?? "attivo",
  hosting: r?.hosting ?? "",
  proprieta: r?.proprieta ?? "nostra",
  accesso: r?.accesso ?? "",
  note: r?.note ?? "",
});

// Form del rinnovo: Nuovo e Modifica (con Elimina). Usato da lista e scheda.
export default function RinnovoFormModal({
  rinnovo,
  clienti: clientiProp,
  onClose,
  onSaved,
  onDeleted,
}: {
  rinnovo: Rinnovo | null;
  clienti?: ClienteMin[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onDeleted?: () => void;
}) {
  const editing = rinnovo;
  const [form, setForm] = useState(() => formDa(rinnovo));
  const [clienti, setClienti] = useState<ClienteMin[]>(clientiProp ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (clientiProp) return;
    fetch("/api/clienti?min=1")
      .then((r) => r.json())
      .then((c) =>
        setClienti(
          (Array.isArray(c) ? c : [])
            .map((x: ClienteMin) => ({ id: x.id, nome: x.nome, paese: x.paese }))
            .sort((a: ClienteMin, b: ClienteMin) => a.nome.localeCompare(b.nome)),
        ),
      )
      .catch(() => {});
  }, [clientiProp]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.dominio.trim()) return setErr("Scrivi il dominio");
    if (!form.scadenza) return setErr("Scegli la data di scadenza");
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        ...form,
        // il nome libero resta solo finché non c'è il cliente in anagrafica
        nomeCliente: form.clienteId ? "" : form.nomeCliente,
      };
      const res = await fetch(editing ? `/api/rinnovi/${editing.id}` : "/api/rinnovi", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Salvataggio non riuscito");
        return;
      }
      onSaved(editing ? "Rinnovo aggiornato" : "Rinnovo creato");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!editing || !confirm(`Eliminare il rinnovo di ${editing.dominio}?`)) return;
    await fetch(`/api/rinnovi/${editing.id}`, { method: "DELETE" });
    onDeleted?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? `Modifica ${editing.dominio}` : "Nuovo rinnovo sito"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Dominio *</label>
            <input
              value={form.dominio}
              onChange={(e) => set("dominio", e.target.value)}
              className={inputCls}
              placeholder="es. nomecliente.it"
              autoFocus={!editing}
            />
          </div>
          <div>
            <label className={labelCls}>Scadenza *</label>
            <input
              type="date"
              value={form.scadenza}
              onChange={(e) => set("scadenza", e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Cliente</label>
            {!form.clienteId && form.nomeCliente && (
              <p className="text-xs rounded-lg px-3 py-2 mb-2 border bg-warn/10 border-warn/30 text-warn">
                «{form.nomeCliente}» non è in anagrafica: sceglilo dalla lista o crealo con «+ Nuovo».
                Senza cliente la richiesta di fattura resta «da assegnare».
              </p>
            )}
            <ClienteSelect
              value={form.clienteId}
              onChange={(id) => set("clienteId", id)}
              clienti={clienti}
              nomeIniziale={form.nomeCliente || undefined}
              placeholder="— nessuno (sito nostro o cliente da assegnare) —"
            />
          </div>
          {!form.clienteId && (
            <div className="md:col-span-2">
              <label className={labelCls}>Nome cliente (promemoria, se non è in anagrafica)</label>
              <input
                value={form.nomeCliente}
                onChange={(e) => set("nomeCliente", e.target.value)}
                className={inputCls}
                placeholder="es. Rossi Srl"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className={labelCls}>Fatturazione</label>
            <div className="flex gap-2">
              {FATTURAZIONI.map((o) => {
                const active = form.fatturazione === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set("fatturazione", o.value)}
                    className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                    style={
                      active
                        ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" }
                        : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Solo «Rinnovo a parte» genera la richiesta di fattura. «Compresa» = pagata dentro
              un&apos;altra gestione, «Sito nostro» = nessuna fattura.
            </p>
          </div>
          <div>
            <label className={labelCls}>Importo annuo (imponibile)</label>
            <input
              value={form.importo}
              onChange={(e) => set("importo", e.target.value)}
              className={cn(inputCls, "text-right")}
              placeholder="0"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className={labelCls}>Stato</label>
            <select value={form.stato} onChange={(e) => set("stato", e.target.value)} className={inputCls}>
              {STATI_RINNOVO.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Proprietà</label>
            <select
              value={form.proprieta}
              onChange={(e) => set("proprieta", e.target.value)}
              className={inputCls}
            >
              {PROPRIETA.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Hosting</label>
            <input
              value={form.hosting}
              onChange={(e) => set("hosting", e.target.value)}
              className={inputCls}
              list="hosting-noti"
              placeholder="es. Squarespace"
            />
            <datalist id="hosting-noti">
              {HOSTING_NOTI.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Accesso (account con cui si entra nell&apos;hosting)</label>
            <input
              value={form.accesso}
              onChange={(e) => set("accesso", e.target.value)}
              className={inputCls}
              placeholder="es. social.protein@…"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Note</label>
          <textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={cn(inputCls, "min-h-[64px]")}
          />
        </div>

        {err && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end flex-wrap gap-3 pt-2 border-t border-gray-100">
          {editing && onDeleted && (
            <button
              onClick={del}
              className="inline-flex items-center gap-1 text-sm text-bad hover:underline px-2 py-2 mr-auto"
            >
              <Trash2 className="w-4 h-4" /> Elimina
            </button>
          )}
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Annulla
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-60">
            {saving ? "Salvataggio…" : editing ? "Salva" : "Crea"}
          </button>
        </div>
      </div>
    </div>
  );
}

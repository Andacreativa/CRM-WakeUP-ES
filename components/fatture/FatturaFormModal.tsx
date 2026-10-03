"use client";

import { useEffect, useState } from "react";
import { fmt, MESI } from "@/lib/constants";
import type { Fattura } from "@/lib/fatture";
import ClienteSelect from "@/components/crm/ClienteSelect";

// Form unico della fattura: Nuova, Modifica e Duplica (nuova precompilata
// con i dati di un'altra). Usato dalla lista e dal pannello della fattura.

type TipoIva = "igic_exenta" | "igic7";
const TIPO_IVA_OPTIONS: { value: TipoIva; label: string }[] = [
  { value: "igic_exenta", label: "IGIC Exenta" },
  { value: "igic7", label: "IGIC 7%" },
];
const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

interface ClienteMin {
  id: number;
  nome: string;
}
interface Commerciale {
  id: number;
  nome: string;
  cognome: string | null;
  percentualeCommissione: number;
}

const oggiISO = () => new Date().toISOString().slice(0, 10);
const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

const formDa = (f: Fattura | null | undefined, anno: number) => ({
  numero: f?.numero || "",
  data: f?.data ? f.data.slice(0, 10) : f ? "" : oggiISO(),
  clienteId: f?.clienteId != null ? String(f.clienteId) : "",
  // storico del vecchio canale: le nuove sono sempre dirette, il paese è del cliente
  azienda: f?.azienda ?? "Spagna",
  aziendaNota: f?.aziendaNota || "",
  commerciale: f?.commerciale || "",
  commercialeId: f?.commercialeId ? String(f.commercialeId) : "",
  mese: f?.mese ?? new Date().getMonth() + 1,
  anno: f?.anno ?? anno,
  importo: f ? String(f.importo) : "",
  tipoIva: (f?.tipoIva === "igic7" ? "igic7" : "igic_exenta") as TipoIva,
  pagato: f?.pagato ?? false,
  scadenza: f?.scadenza ? f.scadenza.slice(0, 10) : "",
});

export default function FatturaFormModal({
  fattura,
  duplicaDa,
  annoDefault,
  clienti: clientiProp,
  commerciali: commercialiProp,
  onClose,
  onSaved,
}: {
  fattura?: Fattura | null; // modifica
  duplicaDa?: Fattura | null; // nuova, con i dati di questa
  annoDefault: number;
  clienti?: ClienteMin[];
  commerciali?: Commerciale[];
  onClose: () => void;
  onSaved: (f: Fattura) => void;
}) {
  const editing = fattura ?? null;
  const annoNuova = annoDefault > 0 ? annoDefault : new Date().getFullYear();
  const [form, setForm] = useState(() =>
    editing
      ? formDa(editing, editing.anno)
      : {
          ...formDa(duplicaDa, annoNuova),
          // Una copia è una fattura nuova: numero, date e incasso ripartono
          numero: "",
          data: oggiISO(),
          mese: new Date().getMonth() + 1,
          anno: annoNuova,
          scadenza: "",
          pagato: false,
        },
  );
  const [clienti, setClienti] = useState<ClienteMin[]>(clientiProp ?? []);
  const [commerciali, setCommerciali] = useState<Commerciale[]>(commercialiProp ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientiProp)
      fetch("/api/clienti?min=1")
        .then((r) => r.json())
        .then((d) => setClienti(Array.isArray(d) ? d : []))
        .catch(() => {});
    if (!commercialiProp)
      fetch("/api/dipendenti?tipo=commerciale")
        .then((r) => r.json())
        .then((d) => setCommerciali(Array.isArray(d) ? d : []))
        .catch(() => {});
  }, [clientiProp, commercialiProp]);

  // Nuova fattura: numero, scadenza e imposta dalle Impostazioni fatture
  useEffect(() => {
    if (editing) return;
    Promise.all([
      fetch(`/api/impostazioni/fatture/prossimo-numero?anno=${annoNuova}`).then((r) => r.json()),
      fetch("/api/impostazioni/fatture").then((r) => r.json()),
    ])
      .then(([n, c]) => {
        let scadenza = "";
        if (c?.giorniScadenza > 0) {
          const d = new Date();
          d.setDate(d.getDate() + Number(c.giorniScadenza));
          scadenza = d.toISOString().slice(0, 10);
        }
        setForm((f) => ({
          ...f,
          numero: f.numero || n?.numero || "",
          scadenza: f.scadenza || scadenza,
          tipoIva: !duplicaDa && c?.tipoIvaDefault === "igic7" ? "igic7" : f.tipoIva,
        }));
      })
      .catch(() => {
        /* restano i valori del form */
      });
  }, [editing, duplicaDa, annoNuova]);

  const save = async () => {
    if (!form.importo || saving) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        data: form.data || null,
        clienteId: form.clienteId ? parseInt(form.clienteId) : null,
        importo: parseFloat(form.importo),
        iva: form.tipoIva === "igic7" ? 7 : 0,
        scadenza: form.scadenza || null,
        aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
      };
      const res = await fetch(editing ? `/api/fatture/${editing.id}` : "/api/fatture", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({ error: "non-JSON response" }));
      if (!res.ok) {
        alert(
          `Errore salvataggio (${res.status}): ${body.error ?? "errore"}${body.stage ? ` [stage=${body.stage}]` : ""}`,
        );
        return;
      }
      onSaved(body);
    } finally {
      setSaving(false);
    }
  };

  const sub = parseFloat(form.importo) || 0;
  const imposta = (sub * (form.tipoIva === "igic7" ? 7 : 0)) / 100;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900">
          {editing ? "Modifica Fattura" : duplicaDa ? "Duplica Fattura" : "Nuova Fattura"}
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Numero Fattura</label>
              <input
                type="text"
                value={form.numero}
                onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                placeholder="Es. F202641"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Data emissione</label>
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Cliente *</label>
            <ClienteSelect
              value={form.clienteId}
              onChange={(id) => setForm((f) => ({ ...f, clienteId: id }))}
              clienti={clienti}
              placeholder="Seleziona cliente..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Mese di competenza *</label>
              <select
                value={form.mese}
                onChange={(e) => setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))}
                className={inputCls}
              >
                {MESI_NUMS.map((m) => (
                  <option key={m} value={m}>
                    {MESI[m - 1]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Importo (€) *</label>
              <input
                type="number"
                step="0.01"
                value={form.importo}
                onChange={(e) => setForm((f) => ({ ...f, importo: e.target.value }))}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Tipo Imposta</label>
            <div className="flex gap-2">
              {TIPO_IVA_OPTIONS.map((o) => {
                const active = form.tipoIva === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => setForm((f) => ({ ...f, tipoIva: o.value }))}
                    className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                    style={
                      active
                        ? { background: "#fce7f3", color: "#be185d", borderColor: "#f9a8d4" }
                        : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotale</span>
              <span className="font-medium">{fmt(sub)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{form.tipoIva === "igic7" ? "IGIC 7%" : "IGIC Exenta"}</span>
              <span className="font-medium">{fmt(imposta)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
              <span>TOTALE</span>
              <span>{fmt(sub + imposta)}</span>
            </div>
            <div className="flex justify-between text-ok pt-1">
              <span>Guadagno netto</span>
              <span className="font-semibold">{fmt(sub)}</span>
            </div>
          </div>

          <div>
            <label className={labelCls}>Scadenza</label>
            <input
              type="date"
              value={form.scadenza}
              onChange={(e) => setForm((f) => ({ ...f, scadenza: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Commerciale</label>
            <select
              value={form.commercialeId}
              onChange={(e) => setForm((f) => ({ ...f, commercialeId: e.target.value }))}
              className={`${inputCls} bg-white`}
            >
              <option value="">— nessuno —</option>
              {commerciali.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.cognome ? ` ${c.cognome}` : ""} · {c.percentualeCommissione}%
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              All&apos;incasso crea la commissione in automatico (voce Commissioni).
              {form.commerciale && !form.commercialeId ? ` Valore storico: ${form.commerciale}.` : ""}
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pagato}
              onChange={(e) => setForm((f) => ({ ...f, pagato: e.target.checked }))}
              className="w-4 h-4"
              style={{ accentColor: "#e8308a" }}
            />
            <span className="text-sm text-gray-700">Già pagata</span>
          </label>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Annulla
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary flex-1">
            {editing ? "Salva" : "Aggiungi"}
          </button>
        </div>
      </div>
    </div>
  );
}

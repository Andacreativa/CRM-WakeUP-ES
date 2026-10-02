"use client";

import { useEffect, useState } from "react";
import { Plus, X, FileText } from "lucide-react";
import { fmt } from "@/lib/constants";
import {
  type Lingua,
  type Preventivo,
  type TipoVoce,
  type VocePreventivo,
  DEFAULT_CONDIZIONI,
  STATUS_OPTIONS,
  linguaDi,
  nuovaVoce,
  parseVociPreventivo,
} from "./tipi";

interface Contatto {
  id: number;
  nome: string;
  email: string | null;
}

const BRAND = "#e8308a";

const formDa = (p: Preventivo | null) => ({
  oggetto: p?.oggetto ?? "",
  nomeCliente: p?.nomeCliente ?? "",
  emailCliente: p?.emailCliente ?? "",
  aziendaCliente: p?.aziendaCliente ?? "",
  azienda: p?.azienda ?? "Anda",
  iva: p?.iva ?? 0,
  feeCommerciale: p?.feeCommerciale ?? 0,
  status: p?.status ?? "attesa",
  note: p?.note ?? "",
  condizioni: p?.condizioni || DEFAULT_CONDIZIONI,
  dataScadenza: p?.dataScadenza ? p.dataScadenza.slice(0, 10) : "",
  lingua: (p ? linguaDi(p) : "it") as Lingua,
});

// Form del preventivo: Nuovo e Modifica. Usato dalla lista e dalla scheda.
export default function PreventivoFormModal({
  preventivo,
  onClose,
  onSaved,
  onGeneraContratto,
}: {
  preventivo: Preventivo | null;
  onClose: () => void;
  onSaved: (p: Preventivo) => void;
  onGeneraContratto?: (p: Preventivo) => void;
}) {
  const editing = preventivo;
  const [form, setForm] = useState(() => formDa(preventivo));
  const [voci, setVoci] = useState<VocePreventivo[]>(() => {
    const v = preventivo ? parseVociPreventivo(preventivo.voci) : [];
    return v.length ? v : [nuovaVoce()];
  });
  const [contatti, setContatti] = useState<Contatto[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/contatti")
      .then((r) => r.json())
      .then((c) => setContatti(Array.isArray(c) ? c : []))
      .catch(() => {});
  }, []);

  const subtotale = (voci ?? []).reduce(
    (s, v) => s + (Number(v?.quantita) || 0) * (Number(v?.prezzoUnitario) || 0),
    0,
  );
  const ivaAmt = (subtotale * (Number(form.iva) || 0)) / 100;
  const totale = subtotale + ivaAmt;

  const applyContatto = (id: string) => {
    const c = (contatti ?? []).find((x) => x.id === parseInt(id));
    if (c)
      setForm((f) => ({
        ...f,
        nomeCliente: c.nome ?? "",
        emailCliente: c.email ?? "",
      }));
  };

  const updateVoce = (
    id: string,
    field: keyof Omit<VocePreventivo, "id">,
    val: string | number,
  ) => {
    setVoci((vs) => vs.map((v) => (v.id === id ? { ...v, [field]: val } : v)));
  };

  const save = async () => {
    if (!form.oggetto || !form.nomeCliente || voci.length === 0 || saving) return;
    const payload = {
      ...form,
      iva: Number(form.iva),
      voci: voci.map(
        ({ servizio, descrizione, quantita, prezzoUnitario, tipo }) => ({
          servizio,
          descrizione,
          quantita: Number(quantita),
          prezzoUnitario: Number(prezzoUnitario),
          tipo,
        }),
      ),
      dataScadenza: form.dataScadenza || null,
    };
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/preventivi/${editing.id}` : "/api/preventivi", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Salvataggio non riuscito: ${j.error ?? res.status}`);
        return;
      }
      onSaved(j);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-start justify-center z-50 p-0 md:p-4 overflow-y-auto">
      <div className="glass-modal rounded-t-2xl md:rounded-2xl w-full max-w-3xl md:my-4 p-4 md:p-6 space-y-4 md:space-y-5 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? `Modifica ${editing.numero}` : "Nuovo Preventivo"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Row 1: Oggetto + Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Oggetto / Titolo *
            </label>
            <input
              type="text"
              value={form.oggetto}
              onChange={(e) =>
                setForm((f) => ({ ...f, oggetto: e.target.value }))
              }
              placeholder="Es. Servizi di Marketing Digitale & Social Media"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Status
            </label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((o) => {
                const active = form.status === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() =>
                      setForm((f) => ({ ...f, status: o.value }))
                    }
                    className="flex-1 text-xs py-2 rounded-lg border font-semibold transition-all"
                    style={
                      active
                        ? {
                            background: o.bg,
                            color: o.text,
                            borderColor: o.border,
                          }
                        : {
                            background: "#fff",
                            borderColor: "#e5e7eb",
                            color: "#9ca3af",
                          }
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Lingua PDF */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Lingua PDF
          </label>
          <div className="flex gap-2">
            {(
              [
                { v: "it", l: "Italiano" },
                { v: "es", l: "Español" },
                { v: "en", l: "English" },
              ] as const
            ).map(({ v, l }) => {
              const active = form.lingua === v;
              return (
                <button
                  key={v}
                  onClick={() =>
                    setForm((f) => ({ ...f, lingua: v as Lingua }))
                  }
                  className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                  style={
                    active
                      ? {
                          background: BRAND,
                          color: "#fff",
                          borderColor: BRAND,
                        }
                      : {
                          background: "#fff",
                          borderColor: "#e5e7eb",
                          color: "#9ca3af",
                        }
                  }
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Cliente */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Cliente
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <select
                onChange={(e) => applyContatto(e.target.value)}
                defaultValue=""
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 text-gray-500"
              >
                <option value="">Seleziona da contatti...</option>
                {(contatti ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome ?? "—"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <input
                type="text"
                value={form.nomeCliente}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nomeCliente: e.target.value }))
                }
                placeholder="Nome cliente *"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <input
                type="text"
                value={form.aziendaCliente}
                onChange={(e) =>
                  setForm((f) => ({ ...f, aziendaCliente: e.target.value }))
                }
                placeholder="Ragione sociale"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div className="col-span-2">
              <input
                type="email"
                value={form.emailCliente}
                onChange={(e) =>
                  setForm((f) => ({ ...f, emailCliente: e.target.value }))
                }
                placeholder="Email cliente"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <input
                type="date"
                value={form.dataScadenza}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dataScadenza: e.target.value }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 text-gray-700"
              />
            </div>
          </div>
        </div>

        {/* Row 3: Voci */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">
              Voci / Servizi *
            </label>
            <button
              onClick={() => setVoci((vs) => [...vs, nuovaVoce()])}
              className="text-xs font-medium px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Aggiungi voce
            </button>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="tbl">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-left w-[26%]">
                    Servizio
                  </th>
                  <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-left w-[22%]">
                    Descrizione
                  </th>
                  <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-left w-[14%]">
                    Tipo
                  </th>
                  <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-center w-[10%]">
                    Q.tà
                  </th>
                  <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-right w-[14%]">
                    €/Unit.
                  </th>
                  <th className="text-xs font-semibold text-gray-500 px-3 py-2 text-right w-[12%]">
                    Totale
                  </th>
                  <th className="w-[2%]" />
                </tr>
              </thead>
              <tbody>
                {voci.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <input
                        type="text"
                        value={v.servizio}
                        onChange={(e) =>
                          updateVoce(v.id, "servizio", e.target.value)
                        }
                        placeholder="Es. Social Media Management"
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={v.descrizione}
                        onChange={(e) =>
                          updateVoce(v.id, "descrizione", e.target.value)
                        }
                        placeholder="Dettaglio breve"
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    </td>
                    <td>
                      <select
                        value={v.tipo}
                        onChange={(e) =>
                          updateVoce(
                            v.id,
                            "tipo",
                            e.target.value as TipoVoce,
                          )
                        }
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                      >
                        <option value="mensile">Mensile</option>
                        <option value="una_tantum">Una Tantum</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={v.quantita}
                        onChange={(e) =>
                          updateVoce(
                            v.id,
                            "quantita",
                            parseFloat(e.target.value) || 1,
                          )
                        }
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={v.prezzoUnitario}
                        onChange={(e) =>
                          updateVoce(
                            v.id,
                            "prezzoUnitario",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                    </td>
                    <td className="text-xs font-semibold text-gray-900 text-right whitespace-nowrap">
                      {fmt(
                        (Number(v.quantita) || 0) *
                          (Number(v.prezzoUnitario) || 0),
                      )}
                    </td>
                    <td>
                      {voci.length > 1 && (
                        <button
                          onClick={() =>
                            setVoci((vs) => vs.filter((x) => x.id !== v.id))
                          }
                          className="p-1 rounded text-gray-400 hover:text-bad transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totali */}
          <div className="mt-3 flex justify-end">
            <div className="space-y-1 text-sm min-w-[240px]">
              <div className="flex justify-between text-gray-600">
                <span>Subtotale</span>
                <span className="font-medium">{fmt(subtotale)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>IVA</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.iva}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        iva: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-14 border border-gray-200 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand/30"
                  />
                  <span className="text-xs text-gray-400">%</span>
                  <span className="font-medium ml-1">{fmt(ivaAmt)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>Fee commerciale</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.feeCommerciale}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        feeCommerciale: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-16 border border-gray-200 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand/30"
                  />
                  <span className="text-xs text-gray-400">%</span>
                  <span className="font-medium ml-1 text-partial">
                    {fmt((subtotale * (form.feeCommerciale || 0)) / 100)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
                <span>TOTALE</span>
                <span>{fmt(totale)}</span>
              </div>
              <div className="flex justify-between text-ok font-semibold">
                <span>Guadagno netto</span>
                <span>
                  {fmt(subtotale * (1 - (form.feeCommerciale || 0) / 100))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: Condizioni + Note */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Condizioni commerciali
            </label>
            <textarea
              value={form.condizioni}
              onChange={(e) =>
                setForm((f) => ({ ...f, condizioni: e.target.value }))
              }
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Note interne
            </label>
            <textarea
              value={form.note}
              onChange={(e) =>
                setForm((f) => ({ ...f, note: e.target.value }))
              }
              rows={4}
              placeholder="Note non visibili nel PDF..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
            />
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex gap-3 pt-1 border-t border-gray-100">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Annulla
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn btn-primary flex-1"
          >
            {editing ? "Salva Modifiche" : "Crea Preventivo"}
          </button>
        </div>
        {editing && editing.status === "accettato" && onGeneraContratto && (
          <button
            onClick={() => onGeneraContratto(editing)}
            className="w-full flex items-center justify-center gap-2 border border-brand/30 text-brand text-sm font-medium py-2.5 rounded-xl hover:bg-brand/10 transition-colors"
          >
            <FileText className="w-4 h-4" /> Genera Contratto
          </button>
        )}
      </div>
    </div>
  );
}

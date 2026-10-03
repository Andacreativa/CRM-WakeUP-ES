"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { fmt } from "@/lib/constants";
import ClienteSelect from "@/components/crm/ClienteSelect";
import {
  type ClienteAnag,
  type Contratto,
  type VoceContratto,
  STATI_CONTRATTO,
  nuovaVoce,
  uid,
} from "./tipi";

// Form del contratto: Nuovo e Modifica. Usato dalla lista e dalla scheda.
export default function ContrattoFormModal({
  contratto,
  onClose,
  onSaved,
}: {
  contratto: Contratto | null;
  onClose: () => void;
  onSaved: (c: Contratto) => void;
}) {
  const editing = !!contratto;
  const [clienti, setClienti] = useState<ClienteAnag[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(
    contratto?.clienteId ?? null,
  );
  const [nomeFallback, setNomeFallback] = useState(
    contratto?.nomeClienteFallback ?? "",
  );
  const [rappresentante, setRappresentante] = useState(
    contratto?.rappresentanteLegale ?? "",
  );
  const [dataDecorrenza, setDataDecorrenza] = useState(
    contratto
      ? contratto.dataDecorrenza.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );
  const [durataMesi, setDurataMesi] = useState(contratto?.durataMesi ?? 6);
  const [importoMensile, setImportoMensile] = useState(
    contratto?.importoMensile ?? 0,
  );
  const [numeroRate, setNumeroRate] = useState(contratto?.numeroRate ?? 6);
  const [oggetto, setOggetto] = useState(contratto?.oggetto ?? "");
  const [voci, setVoci] = useState<VoceContratto[]>(() => {
    if (contratto?.voci) {
      try {
        const arr = JSON.parse(contratto.voci) as {
          servizio: string;
          descrizione?: string;
        }[];
        return arr.map((v) => ({
          id: uid(),
          servizio: v.servizio,
          descrizione: v.descrizione || "",
        }));
      } catch {
        return [nuovaVoce()];
      }
    }
    return [nuovaVoce()];
  });
  const [lingua, setLingua] = useState(contratto?.lingua === "es" ? "es" : "it");
  const [status, setStatus] = useState(contratto?.status ?? "bozza");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clienti")
      .then((r) => r.json())
      .then((d) => setClienti(Array.isArray(d) ? d : []));
  }, []);

  const cliente = clienti.find((c) => c.id === clienteId) ?? null;
  const totale = importoMensile * numeroRate;
  const updateVoce = (id: string, patch: Partial<VoceContratto>) =>
    setVoci((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const addVoce = () => setVoci((vs) => [...vs, nuovaVoce()]);
  const removeVoce = (id: string) =>
    setVoci((vs) => vs.filter((v) => v.id !== id));

  const submit = async () => {
    if (!clienteId && !nomeFallback.trim()) {
      setError("Seleziona un cliente o scrivi il nome");
      return;
    }
    if (!rappresentante.trim()) {
      setError("Inserisci il rappresentante legale");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const body = {
        clienteId,
        nomeClienteFallback: clienteId ? null : nomeFallback,
        rappresentanteLegale: rappresentante,
        dataDecorrenza,
        durataMesi,
        importoMensile,
        numeroRate,
        oggetto,
        voci: JSON.stringify(
          voci
            .filter((v) => v.servizio.trim())
            .map((v) => ({
              servizio: v.servizio,
              descrizione: v.descrizione,
              quantita: 1,
              prezzoUnitario: importoMensile,
            })),
        ),
        lingua,
        status,
      };
      const url = editing
        ? `/api/contratti/${contratto!.id}`
        : "/api/contratti";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Errore salvataggio");
        return;
      }
      onSaved(j);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? `Modifica ${contratto?.numero}` : "Nuovo Contratto"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Lingua *
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { v: "it", l: "Italiano" },
                    { v: "es", l: "Spagnolo" },
                  ] as const
                ).map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => setLingua(v)}
                    className="flex-1 text-sm py-2 rounded-lg border font-semibold"
                    style={
                      lingua === v
                        ? {
                            background: "#e8308a",
                            color: "#fff",
                            borderColor: "#e8308a",
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
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Stato
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 capitalize"
              >
                {STATI_CONTRATTO.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Cliente (anagrafica)
            </label>
            <ClienteSelect
              value={clienteId ? String(clienteId) : ""}
              onChange={(id, nuovo) => {
                // il cliente appena creato ha già l'indirizzo: entra nella lista
                if (nuovo && !clienti.some((c) => c.id === nuovo.id))
                  setClienti((cs) => [...cs, nuovo as unknown as ClienteAnag]);
                setClienteId(parseInt(id) || null);
              }}
              clienti={clienti}
              placeholder="— manuale (nome libero sotto) —"
            />
            {cliente && (
              <p className="text-[11px] text-gray-500 mt-1">
                {[cliente.via, cliente.cap, cliente.citta]
                  .filter(Boolean)
                  .join(", ")}
                {cliente.partitaIva ? ` — P.IVA ${cliente.partitaIva}` : ""}
              </p>
            )}
            {!clienteId && (
              <input
                type="text"
                value={nomeFallback}
                onChange={(e) => setNomeFallback(e.target.value)}
                placeholder="Nome cliente (free text)"
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Rappresentante Legale *
            </label>
            <input
              type="text"
              value={rappresentante}
              onChange={(e) => setRappresentante(e.target.value)}
              placeholder="Es. Eugenio Zuppichin"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Oggetto del contratto
            </label>
            <input
              type="text"
              value={oggetto}
              onChange={(e) => setOggetto(e.target.value)}
              placeholder="Descrizione attività"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Decorrenza
              </label>
              <input
                type="date"
                value={dataDecorrenza}
                onChange={(e) => setDataDecorrenza(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Durata (mesi)
              </label>
              <input
                type="number"
                min={1}
                value={durataMesi}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 1;
                  setDurataMesi(v);
                  setNumeroRate(v);
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Importo mensile (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={importoMensile}
                onChange={(e) =>
                  setImportoMensile(parseFloat(e.target.value) || 0)
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Numero rate
              </label>
              <input
                type="number"
                min={1}
                value={numeroRate}
                onChange={(e) => setNumeroRate(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 text-sm flex justify-between">
            <span className="text-gray-600">
              Totale contratto ({numeroRate} × {fmt(importoMensile)})
            </span>
            <span className="font-bold text-gray-900">{fmt(totale)}</span>
          </div>

          {/* Voci servizi */}
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 uppercase">
                Servizi inclusi (Art. 1.2)
              </p>
              <button
                onClick={addVoce}
                className="text-xs text-brand hover:text-brand flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Aggiungi
              </button>
            </div>
            <div className="space-y-2">
              {voci.map((v) => (
                <div key={v.id} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={v.servizio}
                    onChange={(e) => updateVoce(v.id, { servizio: e.target.value })}
                    placeholder="Servizio"
                    className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand/30"
                  />
                  <input
                    type="text"
                    value={v.descrizione}
                    onChange={(e) =>
                      updateVoce(v.id, { descrizione: e.target.value })
                    }
                    placeholder="Descrizione (opzionale)"
                    className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand/30"
                  />
                  {voci.length > 1 && (
                    <button
                      onClick={() => removeVoce(v.id)}
                      className="p-1.5 text-gray-400 hover:text-brand"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="btn btn-primary flex-1"
          >
            {saving ? "Salvataggio..." : editing ? "Salva" : "Crea Contratto"}
          </button>
        </div>
      </div>
    </div>
  );
}

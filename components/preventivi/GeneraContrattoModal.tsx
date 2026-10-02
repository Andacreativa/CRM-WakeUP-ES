"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fmt } from "@/lib/constants";
import { exportContrattoPDF } from "@/lib/export";
import type { ClienteAnag } from "@/components/contratti/tipi";
import type { Preventivo } from "./tipi";

// Dal preventivo accettato al contratto: importo mensile, durata e una
// tantum si leggono dalle voci; si crea il contratto e si scarica il PDF.
export default function GeneraContrattoModal({
  preventivo,
  onClose,
  onCreated,
}: {
  preventivo: Preventivo;
  onClose: () => void;
  onCreated?: (c: { id: number; numero: string }) => void;
}) {
  const [clienti, setClienti] = useState<ClienteAnag[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [rappresentante, setRappresentante] = useState("");
  const [dataDecorrenza, setDataDecorrenza] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // Deriva importo mensile, durata e una tantum dalle voci del preventivo
  const { vociMensili, vociTantum, importoMensileAuto, durataAuto, totUnaTantum } = (() => {
    type V = { quantita?: number; prezzoUnitario?: number; tipo?: string };
    let parsed: V[] = [];
    try {
      parsed = JSON.parse(preventivo.voci);
    } catch {
      parsed = [];
    }
    const mens = parsed.filter((v) => v.tipo !== "una_tantum");
    const tan = parsed.filter((v) => v.tipo === "una_tantum");
    const im = mens.reduce((s, v) => s + (Number(v.prezzoUnitario) || 0), 0);
    const du = mens.length > 0 ? Math.max(...mens.map((v) => Number(v.quantita) || 0)) : 6;
    const tt = tan.reduce(
      (s, v) => s + (Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0),
      0,
    );
    return {
      vociMensili: mens.length,
      vociTantum: tan.length,
      importoMensileAuto: im,
      durataAuto: du > 0 ? du : 6,
      totUnaTantum: tt,
    };
  })();

  const [durataMesi, setDurataMesi] = useState(durataAuto);
  const [importoMensile, setImportoMensile] = useState(importoMensileAuto);
  const [numeroRate, setNumeroRate] = useState(durataAuto);
  const [lingua, setLingua] = useState<"it" | "es">("it");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clienti")
      .then((r) => r.json())
      .then((data) => {
        const arr: ClienteAnag[] = Array.isArray(data) ? data : [];
        setClienti(arr);
        // Match per nome
        const match = arr.find(
          (c) =>
            c.nome.toLowerCase() === preventivo.nomeCliente.toLowerCase() ||
            (preventivo.aziendaCliente &&
              c.nome.toLowerCase() ===
                preventivo.aziendaCliente.toLowerCase()),
        );
        if (match) setClienteId(match.id);
      });
  }, [preventivo.nomeCliente, preventivo.aziendaCliente]);

  const cliente = clienti.find((c) => c.id === clienteId) ?? null;
  const totaleRicorrente = importoMensile * numeroRate;
  const totale = totaleRicorrente + totUnaTantum;

  const submit = async () => {
    if (!clienteId) {
      setError("Seleziona un cliente dall'anagrafica");
      return;
    }
    if (!rappresentante.trim()) {
      setError("Inserisci il rappresentante legale");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/contratti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preventivoId: preventivo.id,
          clienteId,
          rappresentanteLegale: rappresentante,
          dataDecorrenza,
          durataMesi,
          importoMensile,
          numeroRate,
          oggetto: preventivo.oggetto,
          voci: preventivo.voci,
          lingua,
          status: "bozza",
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Errore salvataggio");
        return;
      }
      const c = await res.json();
      // Download PDF
      await exportContrattoPDF({
        numero: c.numero,
        cliente: {
          nome: c.cliente.nome,
          via: c.cliente.via,
          cap: c.cliente.cap,
          citta: c.cliente.citta,
          provincia: c.cliente.provincia,
          partitaIva: c.cliente.partitaIva,
        },
        rappresentanteLegale: c.rappresentanteLegale,
        oggetto: c.oggetto,
        voci: c.voci,
        dataDecorrenza: c.dataDecorrenza,
        durataMesi: c.durataMesi,
        importoMensile: c.importoMensile,
        numeroRate: c.numeroRate,
        totaleContratto: c.totaleContratto,
        lingua: c.lingua === "es" ? "es" : "it",
      });
      onCreated?.({ id: c.id, numero: c.numero });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Genera Contratto da {preventivo.numero}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Cliente (anagrafica) *
            </label>
            <select
              value={clienteId ?? ""}
              onChange={(e) => setClienteId(parseInt(e.target.value) || null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">Seleziona cliente...</option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {cliente && (
              <p className="text-[11px] text-gray-500 mt-1">
                {[cliente.via, cliente.cap, cliente.citta]
                  .filter(Boolean)
                  .join(", ")}
                {cliente.partitaIva ? ` — P.IVA ${cliente.partitaIva}` : ""}
              </p>
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
              Lingua contratto
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

          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
            {vociMensili > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">
                  Ricorrente ({numeroRate} × {fmt(importoMensile)}/mese)
                </span>
                <span className="font-medium text-gray-900">
                  {fmt(totaleRicorrente)}
                </span>
              </div>
            )}
            {vociTantum > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Una tantum</span>
                <span className="font-medium text-gray-900">
                  {fmt(totUnaTantum)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1.5">
              <span className="text-gray-700 font-semibold">
                Totale contratto
              </span>
              <span className="font-bold text-gray-900">{fmt(totale)}</span>
            </div>
            <p className="text-[11px] text-gray-500">
              {vociMensili > 0
                ? `Importo mensile = somma costi mensili (${vociMensili} servizi). Durata = max mesi tra i servizi mensili.`
                : "Nessun servizio mensile nel preventivo — solo una tantum."}
            </p>
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
            className="btn btn-primary flex-1 disabled:opacity-60"
          >
            {saving ? "Generazione..." : "Genera e Scarica PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

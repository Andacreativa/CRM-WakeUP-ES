"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Download, RotateCcw } from "lucide-react";
import { fmt } from "@/lib/constants";
import { buildContrattoText, exportContrattoTextPDF } from "@/lib/export";

type TipoVoce = "mensile" | "una_tantum";
interface Voce {
  id: string;
  servizio: string;
  descrizione: string;
  tipo: TipoVoce;
  quantita: number;
  prezzoUnitario: number;
}
interface Contratto {
  id: number;
  numero: string;
  cliente: {
    nome: string;
    via: string | null;
    cap: string | null;
    citta: string | null;
    provincia: string | null;
    partitaIva: string | null;
  } | null;
  nomeClienteFallback: string | null;
  rappresentanteLegale: string;
  dataDecorrenza: string;
  durataMesi: number;
  importoMensile: number;
  numeroRate: number;
  oggetto: string;
  voci: string;
  lingua: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);

function parseVoci(json: string): Voce[] {
  try {
    const arr = JSON.parse(json) as {
      servizio?: string;
      descrizione?: string;
      tipo?: TipoVoce;
      quantita?: number;
      prezzoUnitario?: number;
    }[];
    return arr.map((v) => ({
      id: uid(),
      servizio: v.servizio ?? "",
      descrizione: v.descrizione ?? "",
      tipo: v.tipo === "una_tantum" ? "una_tantum" : "mensile",
      quantita: Number(v.quantita) || 1,
      prezzoUnitario: Number(v.prezzoUnitario) || 0,
    }));
  } catch {
    return [];
  }
}

export default function ContrattoExportModal({
  contratto,
  onClose,
}: {
  contratto: Contratto;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"dati" | "anteprima">("dati");

  // Tab 1 fields
  const [rappresentante, setRappresentante] = useState(
    contratto.rappresentanteLegale,
  );
  const [dataDecorrenza, setDataDecorrenza] = useState(
    contratto.dataDecorrenza.slice(0, 10),
  );
  const [durataMesi, setDurataMesi] = useState(contratto.durataMesi);
  const [importoMensile, setImportoMensile] = useState(contratto.importoMensile);
  const [numeroRate, setNumeroRate] = useState(contratto.numeroRate);
  const [lingua, setLingua] = useState<"it" | "es">(
    contratto.lingua === "es" ? "es" : "it",
  );
  const [voci, setVoci] = useState<Voce[]>(() => parseVoci(contratto.voci));

  // Tab 2: text editable
  const [text, setText] = useState("");
  const [manuallyEdited, setManuallyEdited] = useState(false);

  const dataFine = useMemo(() => {
    const d = new Date(dataDecorrenza);
    d.setMonth(d.getMonth() + durataMesi);
    return d.toISOString().slice(0, 10);
  }, [dataDecorrenza, durataMesi]);

  const fallbackCliente = contratto.cliente ?? {
    nome: contratto.nomeClienteFallback ?? "—",
    via: null,
    cap: null,
    citta: null,
    provincia: null,
    partitaIva: null,
  };

  const generateText = useMemo(() => {
    return buildContrattoText({
      cliente: fallbackCliente,
      rappresentanteLegale: rappresentante,
      oggetto: contratto.oggetto,
      voci: JSON.stringify(
        voci.map((v) => ({
          servizio: v.servizio,
          descrizione: v.descrizione,
          tipo: v.tipo,
          quantita: v.quantita,
          prezzoUnitario: v.prezzoUnitario,
        })),
      ),
      dataDecorrenza,
      durataMesi,
      importoMensile,
      numeroRate,
      lingua,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rappresentante,
    dataDecorrenza,
    durataMesi,
    importoMensile,
    numeroRate,
    lingua,
    voci,
  ]);

  // Auto-rigenera testo quando cambiano i campi del Tab 1, solo se non editato a mano
  useEffect(() => {
    if (!manuallyEdited) setText(generateText);
  }, [generateText, manuallyEdited]);

  // Inizializzazione testo (primo render)
  useEffect(() => {
    setText(generateText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetText = () => {
    setText(generateText);
    setManuallyEdited(false);
  };

  const updateVoce = (id: string, patch: Partial<Voce>) =>
    setVoci((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const handleExport = async () => {
    await exportContrattoTextPDF(text, { numero: contratto.numero });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-4xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Esporta {contratto.numero}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {(
            [
              { v: "dati", l: "Dati" },
              { v: "anteprima", l: "Anteprima" },
            ] as const
          ).map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className="text-sm px-4 py-2 font-medium transition-colors"
              style={
                tab === v
                  ? {
                      color: "#db291b",
                      borderBottom: "2px solid #db291b",
                      marginBottom: "-1px",
                    }
                  : { color: "#6b7280" }
              }
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "dati" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Lingua
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
                              background: "#db291b",
                              color: "#fff",
                              borderColor: "#db291b",
                            }
                          : {
                              background: "#fff",
                              borderColor: "#e2e8f0",
                              color: "#94a3b8",
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
                  Rappresentante legale cliente *
                </label>
                <input
                  type="text"
                  value={rappresentante}
                  onChange={(e) => setRappresentante(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Data inizio
                </label>
                <input
                  type="date"
                  value={dataDecorrenza}
                  onChange={(e) => setDataDecorrenza(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Data fine (calcolata)
                </label>
                <input
                  type="date"
                  value={dataFine}
                  disabled
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Durata periodo prova (mesi)
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
              <div className="flex items-end">
                <div className="text-xs text-gray-500">
                  Totale:{" "}
                  <span className="font-bold text-gray-900">
                    {fmt(importoMensile * numeroRate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  Servizi
                </h3>
              </div>
              <div className="p-3 space-y-2">
                {voci.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">
                    Nessun servizio
                  </p>
                )}
                {voci.map((v) => (
                  <div key={v.id} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={v.servizio}
                      onChange={(e) =>
                        updateVoce(v.id, { servizio: e.target.value })
                      }
                      placeholder="Servizio"
                      className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      value={v.descrizione}
                      onChange={(e) =>
                        updateVoce(v.id, { descrizione: e.target.value })
                      }
                      placeholder="Descrizione"
                      className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs"
                    />
                    <select
                      value={v.tipo}
                      onChange={(e) =>
                        updateVoce(v.id, {
                          tipo: e.target.value as TipoVoce,
                        })
                      }
                      className="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="mensile">Mensile</option>
                      <option value="una_tantum">Una Tantum</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "anteprima" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {manuallyEdited
                  ? "Testo modificato manualmente — i cambi nel tab Dati non aggiornano più questa anteprima"
                  : "Si aggiorna automaticamente con i campi del tab Dati"}
              </p>
              <button
                onClick={resetText}
                className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                title="Rigenera dal template"
              >
                <RotateCcw className="w-3 h-3" /> Rigenera
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setManuallyEdited(true);
              }}
              rows={28}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
              spellCheck={false}
            />
            <p className="text-[10px] text-gray-400">
              Convenzioni: <code># Titolo</code>,{" "}
              <code>## Heading articolo</code>, <code>**bold**</code>,{" "}
              <code>• bullet</code>, <code>___</code> linea firma.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            onClick={handleExport}
            className="flex-1 flex items-center justify-center gap-2 text-white text-sm font-medium py-2.5 rounded-xl"
            style={{ background: "#db291b" }}
          >
            <Download className="w-4 h-4" /> Esporta PDF
          </button>
        </div>
      </div>
    </div>
  );
}

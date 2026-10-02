"use client";

import { useEffect, useState } from "react";
import { Download, Trash2, Plus, FileText, X, Receipt } from "lucide-react";
import Link from "next/link";
import { fmt } from "@/lib/constants";
import ContrattoExportModal from "@/components/ContrattoExportModal";

interface ClienteAnag {
  id: number;
  nome: string;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  partitaIva: string | null;
}
interface Contratto {
  id: number;
  numero: string;
  preventivoId: number | null;
  preventivo: { numero: string } | null;
  clienteId: number | null;
  cliente: ClienteAnag | null;
  nomeClienteFallback: string | null;
  rappresentanteLegale: string;
  dataDecorrenza: string;
  durataMesi: number;
  importoMensile: number;
  numeroRate: number;
  totaleContratto: number;
  status: string;
  oggetto: string;
  voci: string;
  lingua: string;
  createdAt: string;
}
type TipoVoce = "mensile" | "una_tantum";
interface Voce {
  id: string;
  servizio: string;
  descrizione: string;
  tipo?: TipoVoce;
  quantita?: number;
  prezzoUnitario?: number;
}

const STATI = ["bozza", "inviato", "firmato"] as const;
const STATO_COLORI: Record<string, { bg: string; text: string }> = {
  bozza: { bg: "#9ca3af", text: "#ffffff" },
  inviato: { bg: "#f59e0b", text: "#ffffff" },
  firmato: { bg: "#22c55e", text: "#ffffff" },
};

const uid = () => Math.random().toString(36).slice(2, 9);
const newVoce = (): Voce => ({ id: uid(), servizio: "", descrizione: "" });

export default function ContrattiPage() {
  const [contratti, setContratti] = useState<Contratto[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string>("tutti");
  const [editing, setEditing] = useState<Contratto | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [exporting, setExporting] = useState<Contratto | null>(null);

  const load = async () => {
    const data = await (await fetch("/api/contratti")).json();
    setContratti(Array.isArray(data) ? data : []);
  };
  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/contratti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const del = async (id: number) => {
    if (!confirm("Eliminare questo contratto?")) return;
    await fetch(`/api/contratti/${id}`, { method: "DELETE" });
    load();
  };

  // Genera le richieste di fattura (una per rata): niente fatture dirette.
  const [richiesteMsg, setRichiesteMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const generaRichieste = async (c: Contratto) => {
    const nome = c.cliente?.nome ?? c.nomeClienteFallback ?? c.numero;
    if (
      !confirm(
        `Generare ${c.numeroRate} richieste di fattura per ${nome} (${c.numero})?`,
      )
    )
      return;
    const res = await fetch("/api/richieste-fattura/da-contratto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrattoId: c.id }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRichiesteMsg({ text: j.error ?? "Generazione non riuscita", ok: false });
      return;
    }
    setRichiesteMsg({
      text: `${Array.isArray(j) ? j.length : 0} richieste create per ${c.numero}.`,
      ok: true,
    });
  };

  const openExport = (c: Contratto) => {
    if (!c.cliente && !c.nomeClienteFallback) {
      alert("Imposta un cliente prima di esportare il PDF");
      return;
    }
    setExporting(c);
  };

  const filtered = (contratti ?? []).filter(
    (c) => filtroStatus === "tutti" || c.status === filtroStatus,
  );

  return (
    <div className="space-y-6">
      {richiesteMsg && (
        <div
          className={`text-sm rounded-lg px-3 py-2 border flex items-center justify-between gap-3 ${
            richiesteMsg.ok
              ? "bg-ok/10 border-ok/30 text-ok"
              : "bg-bad/10 border-bad/30 text-bad"
          }`}
        >
          <span>{richiesteMsg.text}</span>
          <span className="flex items-center gap-3">
            {richiesteMsg.ok && (
              <Link href="/sales/richieste" className="font-semibold underline">
                Vai alle richieste
              </Link>
            )}
            <button onClick={() => setRichiesteMsg(null)} aria-label="Chiudi">
              <X className="w-4 h-4" />
            </button>
          </span>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratti</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {filtered.length} contratti
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {(["tutti", ...STATI] as string[]).map((s) => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className="text-sm px-4 py-1.5 rounded-lg font-medium transition-colors capitalize"
                style={
                  filtroStatus === s
                    ? { background: "#e8308a", color: "#fff" }
                    : { color: "#6b7280" }
                }
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl"
            style={{ background: "#e8308a" }}
          >
            <Plus className="w-4 h-4" /> Nuovo Contratto
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {[
                "N. Contratto",
                "Cliente",
                "Data",
                "Durata",
                "Importo Mensile",
                "Totale",
                "Lingua",
                "Stato",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 ${["Importo Mensile", "Totale", "Durata"].includes(h) ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessun contratto. Crea il primo o accetta un preventivo.
                </td>
              </tr>
            )}
            {filtered.map((c, i) => {
              const stato = STATO_COLORI[c.status] ?? STATO_COLORI.bozza;
              const nome = c.cliente?.nome ?? c.nomeClienteFallback ?? "—";
              return (
                <tr
                  key={c.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 1 ? "bg-[#f9fafb]" : "bg-white"}`}
                >
                  <td className="px-4 py-3 text-sm font-mono font-semibold text-gray-700">
                    <button
                      onClick={() => setEditing(c)}
                      className="hover:text-brand hover:underline"
                    >
                      {c.numero}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {nome}
                    {!c.cliente && (
                      <span className="pill-wait ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                        non collegato
                      </span>
                    )}
                    {c.preventivo && (
                      <span className="text-xs text-gray-400 ml-2">
                        ← {c.preventivo.numero}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(c.dataDecorrenza).toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    {c.durataMesi} mesi
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right tabular-nums">
                    {fmt(c.importoMensile)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right tabular-nums">
                    {fmt(c.totaleContratto)}
                  </td>
                  <td className="px-4 py-3 text-xs uppercase text-gray-500">
                    {c.lingua === "es" ? "ES" : "IT"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={c.status}
                      onChange={(e) => updateStatus(c.id, e.target.value)}
                      className="text-xs font-semibold px-2 py-1 rounded-full border-none outline-none cursor-pointer capitalize"
                      style={{ background: stato.bg, color: stato.text }}
                    >
                      {STATI.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => generaRichieste(c)}
                        title="Genera richieste di fattura (una per rata)"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 transition-colors"
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openExport(c)}
                        title="Esporta PDF"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(c.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && contratti.length === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center text-gray-500">
          <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
          <p className="text-sm">
            Nessun contratto. Crea il primo o accetta un preventivo per
            generarne uno automaticamente.
          </p>
        </div>
      )}

      {(editing || showNew) && (
        <ContrattoFormModal
          contratto={editing}
          onClose={() => {
            setEditing(null);
            setShowNew(false);
          }}
          onSaved={() => {
            setEditing(null);
            setShowNew(false);
            load();
          }}
        />
      )}

      {exporting && (
        <ContrattoExportModal
          contratto={exporting}
          onClose={() => setExporting(null)}
        />
      )}
    </div>
  );
}

// ─── Form Modal: nuovo o edit ─────────────────────────────────────────────
function ContrattoFormModal({
  contratto,
  onClose,
  onSaved,
}: {
  contratto: Contratto | null;
  onClose: () => void;
  onSaved: () => void;
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
  const [voci, setVoci] = useState<Voce[]>(() => {
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
        return [newVoce()];
      }
    }
    return [newVoce()];
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
  const updateVoce = (id: string, patch: Partial<Voce>) =>
    setVoci((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const addVoce = () => setVoci((vs) => [...vs, newVoce()]);
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
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Errore salvataggio");
        return;
      }
      onSaved();
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
                {STATI.map((s) => (
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
            <select
              value={clienteId ?? ""}
              onChange={(e) => setClienteId(parseInt(e.target.value) || null)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">— manuale (nome libero sotto) —</option>
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
                className="text-xs text-bad hover:text-bad flex items-center gap-1"
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
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-60"
            style={{ background: "#e8308a" }}
          >
            {saving ? "Salvataggio..." : editing ? "Salva" : "Crea Contratto"}
          </button>
        </div>
      </div>
    </div>
  );
}


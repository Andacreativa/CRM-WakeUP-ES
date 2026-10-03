"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Unlink, X } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import ClienteSelect from "@/components/crm/ClienteSelect";
import { cn } from "@/lib/utils";
import {
  type ClienteMin,
  type ContrattoMin,
  type Richiesta,
  ANNI_FORM,
  RICORRENZE,
  inputCls,
  labelCls,
  parseVoci,
} from "./tipi";

const formDa = (r: Richiesta | null, anno: number) => {
  const voci = r ? parseVoci(r.voci) : [];
  return {
    clienteId: r?.clienteId ? String(r.clienteId) : "",
    nomeCliente: r?.nomeCliente ?? "",
    contrattoId: r?.contrattoId ? String(r.contrattoId) : "",
    responsabile: r?.responsabile ?? "",
    // il canale non si chiede più: le richieste sono sempre dirette
    azienda: r?.azienda ?? "Spagna",
    aziendaNota: r?.aziendaNota ?? "",
    voci: r
      ? voci.length
        ? voci.map((v) => ({ descrizione: v.descrizione, importo: String(v.importo) }))
        : [{ descrizione: r.descrizione, importo: String(r.imponibile) }]
      : [{ descrizione: "", importo: "" }],
    tipoIva: r?.tipoIva === "igic7" ? "igic7" : "igic_exenta",
    mese: r?.mese ?? new Date().getMonth() + 1,
    anno: r?.anno ?? anno,
    dataInvio: r?.dataInvio ? r.dataInvio.slice(0, 10) : "",
    ricorrenza: r?.ricorrenza ?? "una_tantum",
    ripetizioni: "1",
    autorizzaTutte: false,
    note: r?.note ?? "",
  };
};

// Form della richiesta: Nuova e Modifica (con Elimina e Scollega fattura).
// Usato dalla lista e dalla scheda della richiesta.
export default function RichiestaFormModal({
  richiesta,
  annoDefault,
  clienti: clientiProp,
  contratti: contrattiProp,
  onClose,
  onSaved,
  onDeleted,
  onScollegata,
}: {
  richiesta: Richiesta | null;
  annoDefault: number;
  clienti?: ClienteMin[];
  contratti?: ContrattoMin[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onDeleted?: () => void;
  onScollegata?: () => void;
}) {
  const editing = richiesta;
  const [form, setForm] = useState(() =>
    formDa(richiesta, annoDefault > 0 ? annoDefault : new Date().getFullYear()),
  );
  const [clienti, setClienti] = useState<ClienteMin[]>(clientiProp ?? []);
  const [contratti, setContratti] = useState<ContrattoMin[]>(contrattiProp ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!clientiProp)
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
    if (!contrattiProp)
      fetch("/api/contratti")
        .then((r) => r.json())
        .then((k) => setContratti(Array.isArray(k) ? k : []))
        .catch(() => {});
  }, [clientiProp, contrattiProp]);

  const imponibileForm = form.voci.reduce(
    (s, v) => s + (parseFloat(String(v.importo).replace(",", ".")) || 0),
    0,
  );
  const ivaForm = form.tipoIva === "igic7" ? 7 : 0;
  const totaleForm = Math.round(imponibileForm * (1 + ivaForm / 100) * 100) / 100;

  const save = async () => {
    const voci = form.voci
      .map((v) => ({
        descrizione: v.descrizione.trim(),
        importo: parseFloat(String(v.importo).replace(",", ".")) || 0,
      }))
      .filter((v) => v.descrizione || v.importo);
    if (!form.clienteId) {
      setErr("Scegli il cliente dall'anagrafica, oppure crealo con «+ Nuovo»");
      return;
    }
    if (!voci.length || imponibileForm <= 0) {
      setErr("Inserisci almeno una voce con importo");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        clienteId: form.clienteId,
        nomeCliente: null,
        contrattoId: form.contrattoId || null,
        responsabile: form.responsabile,
        azienda: form.azienda,
        aziendaNota: form.aziendaNota,
        descrizione: voci.map((v) => v.descrizione).filter(Boolean).join(", "),
        voci,
        tipoIva: form.tipoIva,
        mese: form.mese,
        anno: form.anno,
        dataInvio: form.dataInvio || null,
        ricorrenza: form.ricorrenza,
        ripetizioni: form.ripetizioni,
        autorizzaTutte: form.autorizzaTutte,
        note: form.note,
      };
      const res = await fetch(
        editing ? `/api/richieste-fattura/${editing.id}` : "/api/richieste-fattura",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Salvataggio non riuscito");
        return;
      }
      onSaved(editing ? "Richiesta aggiornata" : "Richiesta creata");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!editing || !confirm(`Eliminare la richiesta ${editing.codice}?`)) return;
    await fetch(`/api/richieste-fattura/${editing.id}`, { method: "DELETE" });
    onDeleted?.();
  };

  const scollega = async () => {
    if (!editing || !confirm("Scollegare la fattura da questa richiesta?")) return;
    await fetch(`/api/richieste-fattura/${editing.id}/collega`, { method: "DELETE" });
    onScollegata?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? `Modifica ${editing.codice}` : "Nuova richiesta di fattura"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {editing?.fatturaId && (
          <div className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2 border bg-ok/10 border-ok/30">
            <span className="text-gray-700">
              Emessa con la fattura{" "}
              <Link
                href={`/finance/fatture/${editing.fatturaId}`}
                className="font-semibold text-brand hover:underline"
              >
                {editing.fattura?.numero ?? "senza numero"}
              </Link>
            </span>
            <button
              onClick={scollega}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-bad"
              title="Stacca la fattura da questa richiesta (la fattura resta)"
            >
              <Unlink className="w-3.5 h-3.5" /> Scollega
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Cliente *</label>
            {!form.clienteId && form.nomeCliente && (
              <p className="text-xs rounded-lg px-3 py-2 mb-2 border bg-warn/10 border-warn/30 text-warn">
                «{form.nomeCliente}» non è in anagrafica: sceglilo dalla lista o crealo con «+ Nuovo».
              </p>
            )}
            <ClienteSelect
              value={form.clienteId}
              onChange={(id) => setForm((f) => ({ ...f, clienteId: id, contrattoId: "" }))}
              clienti={clienti}
              nomeIniziale={form.nomeCliente || undefined}
            />
          </div>
          <div>
            <label className={labelCls}>Contratto (opzionale)</label>
            <select
              value={form.contrattoId}
              onChange={(e) => setForm((f) => ({ ...f, contrattoId: e.target.value }))}
              className={inputCls}
              disabled={!form.clienteId}
            >
              <option value="">— nessuno —</option>
              {contratti
                .filter((c) => String(c.clienteId) === form.clienteId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.oggetto}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Responsabile commerciale</label>
            <input
              value={form.responsabile}
              onChange={(e) => setForm((f) => ({ ...f, responsabile: e.target.value }))}
              className={inputCls}
              placeholder="Chi segue il cliente"
            />
          </div>
        </div>

        {/* Voci */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>Voci</label>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...f, voci: [...f.voci, { descrizione: "", importo: "" }] }))
              }
              className="text-xs font-semibold text-brand hover:text-brand flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Aggiungi voce
            </button>
          </div>
          <div className="space-y-2">
            {form.voci.map((v, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={v.descrizione}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      voci: f.voci.map((x, j) =>
                        j === i ? { ...x, descrizione: e.target.value } : x,
                      ),
                    }))
                  }
                  className={cn(inputCls, "flex-1")}
                  placeholder="Descrizione (es. Gestione social — Ottobre)"
                />
                <input
                  value={v.importo}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      voci: f.voci.map((x, j) => (j === i ? { ...x, importo: e.target.value } : x)),
                    }))
                  }
                  className={cn(inputCls, "w-32 text-right")}
                  placeholder="Importo"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      voci: f.voci.length > 1 ? f.voci.filter((_, j) => j !== i) : f.voci,
                    }))
                  }
                  className="p-2 text-gray-400 hover:text-bad"
                  title="Rimuovi voce"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Tipo IVA</label>
            <div className="flex gap-2">
              {[
                { value: "igic_exenta", label: "IGIC Exenta" },
                { value: "igic7", label: "IGIC 7%" },
              ].map((o) => {
                const active = form.tipoIva === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tipoIva: o.value }))}
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
          </div>
          <div>
            <label className={labelCls}>Mese di competenza</label>
            <select
              value={form.mese}
              onChange={(e) => setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))}
              className={inputCls}
            >
              {MESI.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Anno</label>
            <select
              value={form.anno}
              onChange={(e) => setForm((f) => ({ ...f, anno: parseInt(e.target.value) }))}
              className={inputCls}
            >
              {ANNI_FORM.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Data invio prevista</label>
            <input
              type="date"
              value={form.dataInvio}
              onChange={(e) => setForm((f) => ({ ...f, dataInvio: e.target.value }))}
              className={inputCls}
            />
          </div>
          {!editing && (
            <>
              <div>
                <label className={labelCls}>Ricorrenza</label>
                <select
                  value={form.ricorrenza}
                  onChange={(e) => setForm((f) => ({ ...f, ricorrenza: e.target.value }))}
                  className={inputCls}
                >
                  {RICORRENZE.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Numero richieste</label>
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={form.ripetizioni}
                  disabled={form.ricorrenza === "una_tantum"}
                  onChange={(e) => setForm((f) => ({ ...f, ripetizioni: e.target.value }))}
                  className={cn(inputCls, "disabled:opacity-50")}
                />
              </div>
            </>
          )}
        </div>

        <div>
          <label className={labelCls}>Note</label>
          <textarea
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className={cn(inputCls, "min-h-[64px]")}
          />
        </div>

        {err && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-gray-100">
          <div className="text-sm text-gray-600">
            Imponibile <strong>{fmt(imponibileForm)}</strong>
            {ivaForm > 0 && <> · IGIC {ivaForm}%</>} · Totale{" "}
            <strong className="text-gray-900">{fmt(totaleForm)}</strong>
          </div>
          <div className="flex items-center gap-3">
            {!editing && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autorizzaTutte}
                  onChange={(e) => setForm((f) => ({ ...f, autorizzaTutte: e.target.checked }))}
                />
                Autorizza subito l&apos;invio
              </label>
            )}
            {editing && onDeleted && (
              <button
                onClick={del}
                className="inline-flex items-center gap-1 text-sm text-bad hover:underline px-2 py-2"
              >
                <Trash2 className="w-4 h-4" /> Elimina
              </button>
            )}
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
            >
              Annulla
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="btn btn-primary disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : editing ? "Salva" : "Crea"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

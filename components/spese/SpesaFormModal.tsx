"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { MESI, ANNI, CATEGORIE_SPESA } from "@/lib/constants";

// Form della spesa: Nuova (anche precompilata dalla ricevuta letta con
// l'AI) e Modifica. Usato dalla lista Spese e dalla scheda della spesa.

export interface SpesaBase {
  id: number;
  azienda: string;
  aziendaNota: string | null;
  fornitore: string;
  fornitoreId: number | null;
  categoria: string;
  descrizione: string | null;
  note: string | null;
  ricevutaPath: string | null;
  mese: number;
  anno: number;
  importo: number;
}
export interface SpesaIniziale {
  fornitore?: string;
  fornitoreId?: number | null;
  categoria?: string;
  mese?: number;
  anno?: number;
  importo?: number | null;
}

const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);
const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

export default function SpesaFormModal({
  spesa,
  iniziale,
  annoDefault,
  onClose,
  onSaved,
}: {
  spesa: SpesaBase | null;
  iniziale?: SpesaIniziale;
  annoDefault: number;
  onClose: () => void;
  onSaved: (s: SpesaBase) => void;
}) {
  const [form, setForm] = useState(() => ({
    azienda: spesa?.azienda ?? "Spagna",
    aziendaNota: spesa?.aziendaNota ?? "",
    fornitore: spesa?.fornitore ?? iniziale?.fornitore ?? "",
    fornitoreId: (spesa?.fornitoreId ?? iniziale?.fornitoreId ?? "") as string | number,
    categoria: spesa?.categoria ?? iniziale?.categoria ?? CATEGORIE_SPESA[0],
    descrizione: spesa?.descrizione ?? "",
    note: spesa?.note ?? "",
    mese: spesa?.mese ?? iniziale?.mese ?? new Date().getMonth() + 1,
    anno: spesa?.anno ?? iniziale?.anno ?? (annoDefault > 0 ? annoDefault : new Date().getFullYear()),
    importo: spesa ? String(spesa.importo) : iniziale?.importo != null ? String(iniziale.importo) : "",
    ricevutaPath: spesa?.ricevutaPath ?? "",
  }));
  const [fornitori, setFornitori] = useState<{ id: number; nome: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/fornitori")
      .then((r) => r.json())
      .then((f) => setFornitori(Array.isArray(f) ? f : []))
      .catch(() => {});
  }, []);

  const uploadRicevuta = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
    setForm((f) => ({ ...f, ricevutaPath: res.path }));
    setUploading(false);
  };

  const save = async () => {
    if (!form.fornitore || !form.importo || saving) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        importo: parseFloat(form.importo),
        fornitoreId: form.fornitoreId || null,
        aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
      };
      const res = await fetch(spesa ? `/api/spese/${spesa.id}` : "/api/spese", {
        method: spesa ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{spesa ? "Modifica spesa" : "Nuova spesa"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fornitore *</label>
              <FornitoreAutocomplete
                value={form.fornitore}
                fornitoreId={form.fornitoreId}
                fornitori={fornitori}
                onChange={(nome, id) => setForm((f) => ({ ...f, fornitore: nome, fornitoreId: id ?? "" }))}
              />
            </div>
            <div>
              <label className={labelCls}>Categoria *</label>
              <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className={inputCls}>
                {CATEGORIE_SPESA.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Mese *</label>
              <select value={form.mese} onChange={(e) => setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))} className={inputCls}>
                {MESI_NUMS.map((m) => (
                  <option key={m} value={m}>{MESI[m - 1]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Anno *</label>
              <select value={form.anno} onChange={(e) => setForm((f) => ({ ...f, anno: parseInt(e.target.value) }))} className={inputCls}>
                {Array.from(new Set([...ANNI, form.anno])).sort((a, b) => b - a).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Importo (€) *</label>
              <input type="number" step="0.01" value={form.importo} onChange={(e) => setForm((f) => ({ ...f, importo: e.target.value }))} placeholder="0.00" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Descrizione</label>
            <input type="text" value={form.descrizione} onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))} className={inputCls} placeholder="Es. Abbonamento mensile" />
          </div>
          <div>
            <label className={labelCls}>Note interne</label>
            <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} className={`${inputCls} resize-none`} placeholder="Note private..." />
          </div>
          <div>
            <label className={labelCls}>Ricevuta / Allegato</label>
            {form.ricevutaPath ? (
              <div className="flex items-center gap-2">
                <a href={form.ricevutaPath} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline flex items-center gap-1">
                  <Paperclip className="w-3 h-3" /> Visualizza allegato
                </a>
                <button onClick={() => setForm((f) => ({ ...f, ricevutaPath: "" }))} className="text-xs text-bad hover:underline">
                  Rimuovi
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 hover:border-brand/40 hover:text-brand transition-colors"
                >
                  <Paperclip className="w-4 h-4" /> {uploading ? "Caricamento..." : "Allega file"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    if (e.target.files?.[0]) uploadRicevuta(e.target.files[0]);
                  }}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">Annulla</button>
          <button onClick={save} disabled={uploading || saving} className="btn btn-primary flex-1 disabled:opacity-60">
            {spesa ? "Salva" : "Aggiungi"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Autocomplete Fornitore ─────────────────────────────────────────────────
// Single input: digiti liberamente; mentre scrivi vedi suggerimenti dall'anagrafica
// fornitori. Click su uno → popola fornitore + fornitoreId. Testo libero → fornitoreId
// resta vuoto.
export function FornitoreAutocomplete({
  value,
  fornitoreId,
  fornitori,
  onChange,
}: {
  value: string;
  fornitoreId: string | number;
  fornitori: { id: number; nome: string }[];
  onChange: (nome: string, id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = (value ?? "").toLowerCase().trim();
  const matches = q
    ? fornitori.filter((f) => f.nome.toLowerCase().includes(q)).slice(0, 8)
    : fornitori.slice(0, 8);

  const selected = fornitoreId
    ? fornitori.find((f) => f.id === parseInt(String(fornitoreId)))
    : null;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Es. Google, Stipendio Leo, ..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {selected && (
        <p className="text-[10px] text-ok mt-0.5">
          ✓ collegato a anagrafica: {selected.nome}
        </p>
      )}
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          {matches.map((f) => {
            const isActive = selected?.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onChange(f.nome, f.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-brand/10 flex items-center justify-between ${isActive ? "bg-brand/10 text-brand" : "text-gray-700"}`}
              >
                <span>{f.nome}</span>
                {isActive && <span className="text-[10px]">✓</span>}
              </button>
            );
          })}
          {q && !matches.some((m) => m.nome.toLowerCase() === q) && (
            <div className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              Premi invio per usare &quot;{value}&quot; come testo libero
            </div>
          )}
        </div>
      )}
    </div>
  );
}


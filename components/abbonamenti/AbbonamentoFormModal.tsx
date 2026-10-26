"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import { PAESI, fmt } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formattaIban, ibanValido, pulisciIban } from "@/lib/sepa";
import {
  type Abbonamento,
  type Piano,
  LINGUE,
  PRODOTTI,
  TIPI_IVA_ABB,
  importiMensili,
  inputCls,
  labelCls,
  tipoIvaSuggerito,
} from "./tipi";

// Form dell'abbonamento (Sales): Nuovo e Modifica. Il nuovo nasce «da
// firmare» con il link inviato al cliente, oppure già firmato su carta.
// Prezzo e imposta si possono forzare (Pro, prezzi concordati).

const oggiYmd = () => new Date().toISOString().slice(0, 10);

const formDa = (a: Abbonamento | null) => ({
  prodotto: a?.prodotto ?? "boogo",
  pianoId: a?.pianoId ? String(a.pianoId) : "",
  prezzo: a ? String(a.prezzo) : "",
  tipoIva: a?.tipoIva ?? "",
  lingua: a?.lingua ?? "es",
  intestatario: a?.intestatario ?? "",
  nif: a?.nif ?? "",
  email: a?.email ?? "",
  telefono: a?.telefono ?? "",
  via: a?.via ?? "",
  cap: a?.cap ?? "",
  citta: a?.citta ?? "",
  provincia: a?.provincia ?? "",
  paese: a?.paese ?? "Spagna",
  titolareConto: a?.titolareConto ?? "",
  iban: a?.iban ? formattaIban(a.iban) : "",
  bic: a?.bic ?? "",
  dataInizio: a?.dataInizio ? a.dataInizio.slice(0, 10) : "",
  note: a?.note ?? "",
  modo: "link" as "link" | "carta",
  mandatoFirmatoIl: oggiYmd(),
});

const MESSAGGI: Record<string, string> = {
  obbligatorio: "obbligatorio",
  email: "email non valida",
  nif: "NIF non valido",
  iban: "IBAN non valido",
  bic: "BIC non valido",
};
const CAMPI: Record<string, string> = {
  intestatario: "Intestatario",
  email: "Email",
  nif: "NIF",
  titolareConto: "Titolare del conto",
  iban: "IBAN",
  bic: "BIC",
};

export default function AbbonamentoFormModal({
  abbonamento,
  onClose,
  onSaved,
  onDeleted,
}: {
  abbonamento: Abbonamento | null;
  onClose: () => void;
  onSaved: (msg: string, a: Abbonamento) => void;
  onDeleted?: () => void;
}) {
  const editing = abbonamento;
  const [form, setForm] = useState(() => formDa(abbonamento));
  const [piani, setPiani] = useState<Piano[]>([]);
  const [ivaManuale, setIvaManuale] = useState(!!abbonamento);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/abbonamenti/piani?prodotto=${form.prodotto}${editing ? "" : "&attivi=1"}`)
      .then((r) => r.json())
      .then((p: Piano[]) => setPiani(Array.isArray(p) ? p : []))
      .catch(() => setPiani([]));
  }, [form.prodotto, editing]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const piano = useMemo(() => piani.find((p) => String(p.id) === form.pianoId) ?? null, [piani, form.pianoId]);

  // Piano scelto → prezzo del piano (se non libero); imposta suggerita dal CAP
  const scegliPiano = (id: string) => {
    const p = piani.find((x) => String(x.id) === id);
    setForm((f) => ({
      ...f,
      pianoId: id,
      prezzo: p && !p.prezzoLibero ? String(p.prezzo) : p ? String(p.prezzo) : f.prezzo,
    }));
  };
  const tipoIvaEff = form.tipoIva || tipoIvaSuggerito(form.paese, form.cap, piano?.tipoIva ?? "igic7");
  useEffect(() => {
    if (ivaManuale) return;
    setForm((f) => ({ ...f, tipoIva: "" }));
  }, [form.paese, form.cap, ivaManuale]);
  const importi = importiMensili(parseFloat(form.prezzo.replace(",", ".")) || 0, tipoIvaEff);
  const ibanOk = !form.iban.trim() || ibanValido(form.iban);

  const save = async () => {
    if (!editing && !form.pianoId) return setErr("Scegli il piano");
    if (!form.intestatario.trim()) return setErr("Scrivi l'intestatario");
    if (!form.email.trim()) return setErr("Scrivi l'email");
    if (!ibanOk) return setErr("IBAN non valido");
    if (!editing && form.modo === "carta" && !pulisciIban(form.iban)) return setErr("Con la firma su carta serve l'IBAN");
    setSaving(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        iban: pulisciIban(form.iban),
        tipoIva: tipoIvaEff,
        pianoId: form.pianoId ? parseInt(form.pianoId, 10) : null,
        prezzo: form.prezzo,
        dataInizio: form.dataInizio || null,
      };
      if (!editing) {
        payload.firmatoSuCarta = form.modo === "carta";
        payload.inviaLink = form.modo === "link";
        payload.inviaConferma = form.modo === "carta";
      } else {
        delete payload.prodotto;
        delete payload.modo;
        delete payload.mandatoFirmatoIl;
      }
      const res = await fetch(editing ? `/api/abbonamenti/${editing.id}` : "/api/abbonamenti", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const dettagli = Array.isArray(j.errori)
          ? j.errori.map((e: { campo: string; codice: string }) => `${CAMPI[e.campo] ?? e.campo}: ${MESSAGGI[e.codice] ?? e.codice}`).join(", ")
          : "";
        setErr(dettagli ? `${j.error ?? "Dati non validi"} (${dettagli})` : (j.error ?? "Salvataggio non riuscito"));
        return;
      }
      const invio = j.invio as { inviata: boolean; a: string | null; errore?: string } | null | undefined;
      let msg = editing ? "Abbonamento aggiornato" : "Abbonamento creato";
      if (!editing && form.modo === "link") {
        msg += invio?.inviata
          ? `: link di firma mandato a ${invio.a}`
          : `: link di firma NON inviato (${invio?.errore ?? "posta non configurata"}), copialo dalla scheda`;
      }
      if (!editing && form.modo === "carta") {
        msg += invio?.inviata ? `: contratto e mandato mandati a ${invio.a}` : " (firmato su carta)";
      }
      onSaved(msg, j as Abbonamento);
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!editing || !confirm(`Eliminare l'abbonamento ${editing.codice} di ${editing.intestatario}?`)) return;
    await fetch(`/api/abbonamenti/${editing.id}`, { method: "DELETE" });
    onDeleted?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-3xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? `Modifica ${editing.codice} — ${editing.intestatario}` : "Nuovo abbonamento"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prodotto e piano */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Prodotto</label>
            <div className="flex gap-2">
              {PRODOTTI.map((p) => {
                const active = form.prodotto === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    disabled={!!editing}
                    onClick={() => setForm((f) => ({ ...f, prodotto: p.value, pianoId: "", prezzo: "" }))}
                    className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all disabled:opacity-70"
                    style={
                      active
                        ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" }
                        : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className={labelCls}>Piano *</label>
            <select value={form.pianoId} onChange={(e) => scegliPiano(e.target.value)} className={inputCls}>
              <option value="">— scegli —</option>
              {piani.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · {p.prezzoLibero ? `da ${fmt(p.prezzo)}` : fmt(p.prezzo)}/mese{p.attivo ? "" : " (non in vendita)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Prezzo al mese (imponibile)</label>
            <input
              value={form.prezzo}
              onChange={(e) => set("prezzo", e.target.value)}
              className={cn(inputCls, "text-right")}
              inputMode="decimal"
              placeholder="0"
            />
            {piano?.prezzoLibero && <p className="text-[11px] text-warn mt-1">Piano a prezzo concordato: scrivi quello pattuito.</p>}
          </div>
          <div>
            <label className={labelCls}>Imposta</label>
            <select
              value={tipoIvaEff}
              onChange={(e) => {
                setIvaManuale(true);
                set("tipoIva", e.target.value);
              }}
              className={inputCls}
            >
              {TIPI_IVA_ABB.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {ivaManuale ? "Scelta a mano." : "Dal CAP: Canarie IGIC 7 %, resto 0 % non soggetto."} Totale {fmt(importi.totale)}/mese
            </p>
          </div>
          <div>
            <label className={labelCls}>Lingua del cliente</label>
            <select value={form.lingua} onChange={(e) => set("lingua", e.target.value)} className={inputCls}>
              {LINGUE.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Primo mese di addebito</label>
            <input type="date" value={form.dataInizio} onChange={(e) => set("dataInizio", e.target.value)} className={inputCls} />
            <p className="text-[11px] text-gray-400 mt-1">Vuoto = dalla firma, secondo le impostazioni.</p>
          </div>
        </div>

        {/* Intestatario */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Intestatario (ragione sociale o nome) *</label>
            <input value={form.intestatario} onChange={(e) => set("intestatario", e.target.value)} className={inputCls} autoFocus={!editing} />
          </div>
          <div>
            <label className={labelCls}>NIF / P.IVA</label>
            <input value={form.nif} onChange={(e) => set("nif", e.target.value)} className={inputCls} placeholder="B12345678" />
          </div>
          <div>
            <label className={labelCls}>Email *</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Telefono</label>
            <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Paese</label>
            <select value={form.paese} onChange={(e) => set("paese", e.target.value)} className={inputCls}>
              {PAESI.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Indirizzo</label>
            <input value={form.via} onChange={(e) => set("via", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>CAP</label>
            <input value={form.cap} onChange={(e) => set("cap", e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Città</label>
            <input value={form.citta} onChange={(e) => set("citta", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Provincia</label>
            <input value={form.provincia} onChange={(e) => set("provincia", e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Conto */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Titolare del conto</label>
            <input value={form.titolareConto} onChange={(e) => set("titolareConto", e.target.value)} className={inputCls} placeholder="= intestatario se vuoto" />
          </div>
          <div>
            <label className={labelCls}>IBAN</label>
            <input
              value={form.iban}
              onChange={(e) => set("iban", e.target.value)}
              onBlur={() => set("iban", form.iban.trim() ? formattaIban(form.iban) : "")}
              className={cn(inputCls, "font-mono", !ibanOk && "border-bad")}
              placeholder="ES00 0000 0000 0000 0000 0000"
            />
          </div>
          <div>
            <label className={labelCls}>BIC (facoltativo)</label>
            <input value={form.bic} onChange={(e) => set("bic", e.target.value.toUpperCase())} className={cn(inputCls, "font-mono")} />
          </div>
        </div>

        {!editing && (
          <div>
            <label className={labelCls}>Mandato SEPA</label>
            <div className="flex gap-2">
              {(
                [
                  ["link", "Manda il link di firma al cliente"],
                  ["carta", "Già firmato su carta"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set("modo", v)}
                  className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                  style={
                    form.modo === v
                      ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" }
                      : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                  }
                >
                  {l}
                </button>
              ))}
            </div>
            {form.modo === "link" ? (
              <p className="text-[11px] text-gray-400 mt-1">
                L&apos;abbonamento resta «da firmare»: il cliente apre il link, mette l&apos;IBAN e accetta contratto e mandato. Si attiva da solo.
              </p>
            ) : (
              <div className="mt-2 max-w-xs">
                <label className={labelCls}>Data della firma</label>
                <input type="date" value={form.mandatoFirmatoIl} onChange={(e) => set("mandatoFirmatoIl", e.target.value)} className={inputCls} />
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelCls}>Note</label>
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} className={cn(inputCls, "min-h-[56px]")} />
        </div>

        {err && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">{err}</div>}

        <div className="flex items-center justify-end flex-wrap gap-3 pt-2 border-t border-gray-100">
          {editing && onDeleted && (
            <button onClick={del} className="inline-flex items-center gap-1 text-sm text-bad hover:underline px-2 py-2 mr-auto">
              <Trash2 className="w-4 h-4" /> Elimina
            </button>
          )}
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Annulla
          </button>
          <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-60">
            {saving ? "Salvataggio…" : editing ? "Salva" : form.modo === "link" ? "Crea e manda il link" : "Crea"}
          </button>
        </div>
      </div>
    </div>
  );
}

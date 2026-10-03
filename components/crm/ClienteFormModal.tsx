"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { PAESI, TIPO_IMPOSTA_OPTIONS, prefissaPiva, unisciPrefisso } from "@/lib/constants";
import AddressFields from "@/components/AddressFields";

export interface ClienteBase {
  id?: number;
  nome: string;
  paese: string;
  email: string | null;
  telefono: string | null;
  partitaIva: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  iban: string | null;
  tipoImposta: string | null;
  note: string | null;
  smh?: boolean;
}

// Cliente minimo per il controllo doppioni e per le tendine
export interface ClienteMinimo {
  id: number;
  nome: string;
  paese: string;
  partitaIva: string | null;
  email: string | null;
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

// Forme societarie e parole che non distinguono due ragioni sociali
const FORME = new Set([
  "srl", "srls", "sas", "snc", "spa", "sl", "slu", "sa", "scp", "ltd", "limited", "di", "de", "e", "c",
  "sociedad", "limitada", "societa", "responsabilita", "unipersonale",
]);
const normNome = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !FORME.has(t))
    .join(" ");
// P.IVA confrontabile: senza prefisso paese e senza simboli
const normPiva = (s: string | null | undefined) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(IT|ES|FR|DE|PT|GB|IE|NL|BE|LU|AT|PIVA)(?=[A-Z0-9]{8,})/, "");

// Clienti già in anagrafica simili a quello che si sta scrivendo: stesso
// nome (anche senza forma societaria), stessa P.IVA o stessa email.
export function trovaDoppioni(
  f: { nome: string; partitaIva: string; email: string },
  clienti: ClienteMinimo[],
  escludiId?: number,
): { c: ClienteMinimo; motivo: string }[] {
  const n = normNome(f.nome);
  const p = normPiva(f.partitaIva);
  const e = f.email.trim().toLowerCase();
  const out: { c: ClienteMinimo; motivo: string }[] = [];
  for (const c of clienti) {
    if (c.id === escludiId) continue;
    const cn = normNome(c.nome);
    if (p.length >= 8 && normPiva(c.partitaIva) === p) out.push({ c, motivo: "stessa P.IVA" });
    else if (e && (c.email ?? "").trim().toLowerCase() === e) out.push({ c, motivo: "stessa email" });
    else if (n.length >= 4 && cn && (cn === n || (cn.length >= 4 && (cn.includes(n) || n.includes(cn)))))
      out.push({ c, motivo: "nome simile" });
  }
  return out.slice(0, 5);
}

export default function ClienteFormModal({
  cliente,
  nomeIniziale,
  onClose,
  onSaved,
  onUsaEsistente,
}: {
  cliente: ClienteBase | null;
  // Nuovo cliente nato da un form (es. richiesta): nome già scritto
  nomeIniziale?: string;
  onClose: () => void;
  onSaved: (c: ClienteMinimo) => void;
  // Se presente, i doppioni hanno "Usa questo" (si sceglie l'esistente)
  onUsaEsistente?: (c: ClienteMinimo) => void;
}) {
  const nuovo = !cliente?.id;
  const [form, setForm] = useState(() => {
    const paese = cliente?.paese ?? "Italia";
    return {
      nome: cliente?.nome ?? nomeIniziale ?? "",
      paese,
      email: cliente?.email ?? "",
      telefono: cliente?.telefono ?? "",
      partitaIva: cliente?.partitaIva ?? (nuovo ? prefissaPiva("", paese) : ""),
      via: cliente?.via ?? "",
      cap: cliente?.cap ?? "",
      citta: cliente?.citta ?? "",
      provincia: cliente?.provincia ?? "",
      iban: cliente?.iban ?? "",
      tipoImposta: cliente?.tipoImposta ?? "IGIC Exenta",
      note: cliente?.note ?? "",
      smh: cliente?.smh ?? false,
    };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [anagrafica, setAnagrafica] = useState<ClienteMinimo[]>([]);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setPaese = (p: string) =>
    setForm((f) => ({ ...f, paese: p, partitaIva: prefissaPiva(f.partitaIva, p, f.paese) }));

  // Il controllo doppioni serve solo quando si crea
  useEffect(() => {
    if (!nuovo) return;
    fetch("/api/clienti?min=1")
      .then((r) => r.json())
      .then((c) => setAnagrafica(Array.isArray(c) ? c : []))
      .catch(() => {});
  }, [nuovo]);
  const doppioni = useMemo(
    () => (nuovo ? trovaDoppioni(form, anagrafica) : []),
    [nuovo, form, anagrafica],
  );

  const salva = async () => {
    if (!form.nome.trim()) {
      setErr("La ragione sociale è obbligatoria");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(cliente?.id ? `/api/clienti/${cliente.id}` : "/api/clienti", {
        method: cliente?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Salvataggio non riuscito");
        return;
      }
      onSaved(j);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{nuovo ? "Nuovo cliente" : "Modifica cliente"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Ragione sociale *</label>
            <input value={form.nome} onChange={(e) => set("nome", e.target.value)} className={inputCls} autoFocus={nuovo} />
          </div>
          <div>
            <label className={labelCls}>Paese (sede)</label>
            <select value={form.paese} onChange={(e) => setPaese(e.target.value)} className={inputCls}>
              {PAESI.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>P.IVA / NIF</label>
            <input value={form.partitaIva} onChange={(e) => set("partitaIva", unisciPrefisso(e.target.value))} className={inputCls} />
          </div>

          {doppioni.length > 0 && (
            <div className="md:col-span-2 rounded-lg px-3 py-2 border bg-warn/10 border-warn/30 space-y-1.5">
              <p className="text-xs font-semibold text-warn inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {doppioni.length === 1
                  ? "In anagrafica c'è già un cliente simile"
                  : `In anagrafica ci sono già ${doppioni.length} clienti simili`}
              </p>
              {doppioni.map(({ c, motivo }) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-t border-warn/20 pt-1.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{c.nome}</div>
                    <div className="text-[11px] text-gray-500">
                      {motivo} · {c.paese}
                      {c.partitaIva ? ` · ${c.partitaIva}` : ""}
                    </div>
                  </div>
                  {onUsaEsistente ? (
                    <button type="button" onClick={() => onUsaEsistente(c)} className="btn btn-secondary btn-sm shrink-0">
                      Usa questo
                    </button>
                  ) : (
                    <Link href={`/crm/clienti/${c.id}`} className="btn btn-secondary btn-sm shrink-0">
                      Apri scheda
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className={labelCls}>Tipo imposta</label>
            <div className="flex gap-2">
              {TIPO_IMPOSTA_OPTIONS.map((o) => {
                const active = form.tipoImposta === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => set("tipoImposta", o)}
                    className="flex-1 text-sm py-2 rounded-lg border font-semibold"
                    style={active ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" } : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className={labelCls}>IBAN</label>
            <input value={form.iban} onChange={(e) => set("iban", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Telefono</label>
            <input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Indirizzo</p>
            <AddressFields
              senzaPaese
              value={{ via: form.via, cap: form.cap, citta: form.citta, provincia: form.provincia, paese: form.paese }}
              onChange={(a) => setForm((f) => ({ ...f, via: a.via, cap: a.cap, citta: a.citta, provincia: a.provincia }))}
            />
          </div>
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.smh}
              onChange={(e) => setForm((f) => ({ ...f, smh: e.target.checked }))}
              className="accent-pink-600"
            />
            Cliente SMH
            <span className="text-xs text-gray-400">portato da Social Media House: le sue fatture entrano nel Rapporto SMH</span>
          </label>
          <div className="md:col-span-2">
            <label className={labelCls}>Note</label>
            <textarea value={form.note} onChange={(e) => set("note", e.target.value)} className={`${inputCls} min-h-[64px]`} />
          </div>
        </div>

        {err && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Annulla</button>
          <button onClick={salva} disabled={busy} className="btn btn-primary disabled:opacity-60">
            {busy ? "Salvataggio…" : !nuovo ? "Salva" : doppioni.length ? "Crea comunque" : "Crea cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

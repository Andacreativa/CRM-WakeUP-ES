"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Copy, Check, Receipt, AlertTriangle, X, Star } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { STATO_LEAD } from "@/lib/lead";
import ClienteFormModal, { type ClienteBase } from "@/components/crm/ClienteFormModal";
import { cn } from "@/lib/utils";

interface Cliente extends ClienteBase {
  id: number;
  createdAt: string;
  fatture: { id: number; numero: string | null; data: string | null; mese: number; anno: number; importo: number; iva: number; pagato: boolean; scadenza: string | null; acconti: { importo: number }[] }[];
  richiesteFattura: { id: number; codice: string; descrizione: string; totale: number; mese: number; anno: number; validazione: string; emessa: boolean; fatturaId: number | null }[];
  contratti: { id: number; numero: string; oggetto: string; status: string; importoMensile: number; numeroRate: number; totaleContratto: number; dataDecorrenza: string }[];
  contatti: { id: number; nome: string; cognome: string | null; ruolo: string | null; email: string | null; telefono: string | null; principale: boolean }[];
  leads: { id: number; codice: string | null; nome: string; azienda: string | null; stato: string; convertitoIl: string | null }[];
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";

export default function ClienteDettaglioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Cliente | null>(null);
  const [edit, setEdit] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/clienti/${id}`);
    if (!r.ok) {
      router.replace("/crm/clienti");
      return;
    }
    setC(await r.json());
  }, [id, router]);
  useEffect(() => {
    load();
  }, [load]);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard non disponibile */
    }
  };

  const del = async () => {
    if (!c || !confirm(`Eliminare ${c.nome}? Le fatture restano ma perdono il collegamento.`)) return;
    await fetch(`/api/clienti/${c.id}`, { method: "DELETE" });
    router.push("/crm/clienti");
  };

  if (!c) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const localita = [c.cap, c.citta, c.provincia ? `(${c.provincia})` : ""].filter(Boolean).join(" ");
  const campi: { key: string; label: string; value: string | null }[] = [
    { key: "nome", label: "Ragione sociale", value: c.nome },
    { key: "piva", label: "P.IVA / NIF", value: c.partitaIva },
    { key: "via", label: "Indirizzo", value: c.via },
    { key: "cap", label: "CAP", value: c.cap },
    { key: "citta", label: "Città", value: c.citta },
    { key: "provincia", label: "Provincia", value: c.provincia },
    { key: "paese", label: "Paese", value: c.paese },
    { key: "email", label: "Email", value: c.email },
    { key: "telefono", label: "Telefono", value: c.telefono },
    { key: "iban", label: "IBAN", value: c.iban },
    { key: "imposta", label: "Tipo imposta", value: c.tipoImposta },
  ];
  const intestazione = [
    c.nome,
    c.via,
    localita,
    c.paese !== "Italia" ? c.paese : null,
    c.partitaIva ? `P.IVA ${c.partitaIva}` : null,
    c.email,
  ]
    .filter(Boolean)
    .join("\n");
  const mancanti = [
    !c.partitaIva && "partita IVA",
    !c.via && "indirizzo",
    !c.citta && "città",
    !c.email && "email",
  ].filter(Boolean) as string[];

  let fatturato = 0;
  let incassato = 0;
  for (const f of c.fatture) {
    fatturato += f.importo;
    const acc = f.acconti.reduce((s, a) => s + a.importo, 0);
    incassato += f.pagato ? f.importo : Math.min(f.importo, acc);
  }
  const daIncassare = Math.max(0, fatturato - incassato);

  return (
    <div className="space-y-5">
      <Link href="/crm/clienti" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Clienti
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{c.nome}</h1>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">{c.paese}</span>
            {c.tipoImposta && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand/10 text-brand">{c.tipoImposta}</span>}
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {c.partitaIva ? `P.IVA ${c.partitaIva}` : "P.IVA non indicata"} · cliente dal {new Date(c.createdAt).toLocaleDateString("it-IT")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/finance/fatture?tab=da-emettere" className="glass-btn-secondary inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl text-gray-700">
            <Receipt className="w-4 h-4" /> Richiesta fattura
          </Link>
          <button onClick={() => setEdit(true)} className="glass-btn-primary inline-flex items-center gap-1.5 text-white text-sm font-medium px-3 py-2 rounded-xl">
            <Pencil className="w-4 h-4" /> Modifica
          </button>
          <button onClick={del} className="p-2 rounded-xl text-gray-500 hover:text-bad hover:bg-bad/10" title="Elimina">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Dati di fatturazione */}
          <section className="glass-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Dati di fatturazione</h2>
              <button
                onClick={() => copy("intestazione", intestazione)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                {copied === "intestazione" ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
                Copia intestazione
              </button>
            </div>
            {mancanti.length > 0 && (
              <div className="text-xs rounded-lg px-3 py-2 border bg-warn/10 border-warn/30 text-warn flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Mancano: {mancanti.join(", ")}</span>
                <button onClick={() => setEdit(true)} className="font-semibold underline">Completa i dati</button>
              </div>
            )}
            <div className="divide-y divide-gray-50">
              {campi.map((f) => (
                <div key={f.key} className="grid grid-cols-[150px_1fr_32px] items-center gap-2 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{f.label}</span>
                  <span className={cn("text-sm break-words", f.value ? "text-gray-900" : "text-gray-400")}>{f.value || "non indicato"}</span>
                  {f.value ? (
                    <button onClick={() => copy(f.key, f.value!)} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100" title={`Copia ${f.label}`}>
                      {copied === f.key ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans">{intestazione}</pre>
          </section>

          <Referenti clienteId={c.id} contatti={c.contatti} onChanged={load} />

          {/* Fatture */}
          <section className="glass-card rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Fatture</h2>
              <Link href="/finance/fatture" className="text-xs font-semibold text-brand hover:text-brand">Registro fatture</Link>
            </div>
            {c.fatture.length === 0 ? (
              <p className="text-sm text-gray-400 px-5 py-4">Nessuna fattura.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Numero", "Periodo", "Scadenza", "Stato", "Importo"].map((h) => (
                      <th key={h} className={cn("text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-5 py-2.5", h === "Importo" ? "text-right" : "text-left")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="zebra">
                  {c.fatture.map((f) => {
                    const acc = f.acconti.reduce((s, a) => s + a.importo, 0);
                    const stato = f.pagato || acc >= f.importo ? "pagata" : acc > 0 ? "acconto" : "da incassare";
                    return (
                      <tr key={f.id} className="border-b border-gray-50">
                        <td className="px-5 py-2.5 text-xs font-mono text-gray-600">{f.numero ?? "—"}</td>
                        <td className="px-5 py-2.5 text-sm text-gray-700">{MESI[f.mese - 1]} {f.anno}</td>
                        <td className="px-5 py-2.5 text-sm text-gray-500">{f.scadenza ? new Date(f.scadenza).toLocaleDateString("it-IT") : "—"}</td>
                        <td className="px-5 py-2.5">
                          <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-md", stato === "pagata" ? "pill-ok" : stato === "acconto" ? "pill-partial" : "pill-wait")}>{stato}</span>
                        </td>
                        <td className="px-5 py-2.5 text-sm font-semibold text-gray-900 text-right">{fmt(f.importo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* Richieste */}
          {c.richiesteFattura.length > 0 && (
            <section className="glass-card rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Richieste di fattura</h2>
                <Link href="/finance/fatture?tab=da-emettere" className="text-xs font-semibold text-brand hover:text-brand">Da emettere</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {c.richiesteFattura.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm gap-3">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-gray-500 mr-2">{r.codice}</span>
                      <span className="text-gray-900 truncate">{r.descrizione}</span>
                      <span className="text-xs text-gray-400 ml-2">{MESI[r.mese - 1]} {r.anno}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-md", r.fatturaId || r.emessa ? "pill-ok" : r.validazione === "ok" ? "pill-info" : "pill-wait")}>
                        {r.fatturaId || r.emessa ? "emessa" : r.validazione === "ok" ? "da fare" : "da validare"}
                      </span>
                      <span className="font-semibold text-gray-900">{fmt(r.totale)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Contratti */}
          {c.contratti.length > 0 && (
            <section className="glass-card rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Contratti</h2>
                <Link href="/sales/contratti" className="text-xs font-semibold text-brand hover:text-brand">Tutti</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {c.contratti.map((k) => (
                  <div key={k.id} className="flex items-center justify-between px-5 py-2.5 text-sm gap-3">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-gray-500 mr-2">{k.numero}</span>
                      <span className="text-gray-900 truncate">{k.oggetto}</span>
                      <span className="text-xs text-gray-400 ml-2">dal {new Date(k.dataDecorrenza).toLocaleDateString("it-IT")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-gray-500">
                      <span className="capitalize bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-md">{k.status}</span>
                      <span>{k.numeroRate} × {fmt(k.importoMensile)}</span>
                      <span className="font-semibold text-gray-900 text-sm">{fmt(k.totaleContratto)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {c.note && (
            <section className="glass-card rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Note</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.note}</p>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="glass-card rounded-2xl p-5 space-y-3">
            {[
              { label: "Fatturato", value: fmt(fatturato), color: "#111827" },
              { label: "Incassato", value: fmt(incassato), color: "#22c55e" },
              { label: "Da incassare", value: fmt(daIncassare), color: daIncassare > 0 ? "#f59e0b" : "#9ca3af" },
              { label: "Fatture", value: String(c.fatture.length), color: "#111827" },
            ].map((k) => (
              <div key={k.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
                <p className="text-xl font-bold" style={{ color: k.color }}>{k.value}</p>
              </div>
            ))}
          </section>
          {c.leads.length > 0 && (
            <section className="glass-card rounded-2xl p-5 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Lead collegati</h2>
              {c.leads.map((l) => {
                const st = STATO_LEAD[l.stato] ?? STATO_LEAD.nuovo;
                return (
                  <Link key={l.id} href={`/crm/lead/${l.id}`} className="flex items-center justify-between text-sm hover:text-brand">
                    <span className="truncate">{l.codice ?? ""} {l.azienda ?? l.nome}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: st.color, color: "#fff" }}>{st.label}</span>
                  </Link>
                );
              })}
            </section>
          )}
        </aside>
      </div>

      {edit && (
        <ClienteFormModal
          cliente={c}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Referenti({
  clienteId,
  contatti,
  onChanged,
}: {
  clienteId: number;
  contatti: Cliente["contatti"];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nome: "", cognome: "", ruolo: "", email: "", telefono: "" });
  const salva = async () => {
    if (!f.nome.trim()) return;
    await fetch("/api/contatti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, clienteId, principale: contatti.length === 0 }),
    });
    setF({ nome: "", cognome: "", ruolo: "", email: "", telefono: "" });
    setOpen(false);
    onChanged();
  };
  const principale = async (id: number) => {
    await fetch(`/api/contatti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principale: true }),
    });
    onChanged();
  };
  const del = async (id: number, nome: string) => {
    if (!confirm(`Eliminare il referente ${nome}?`)) return;
    await fetch(`/api/contatti/${id}`, { method: "DELETE" });
    onChanged();
  };
  return (
    <section className="glass-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Referenti</h2>
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-brand hover:text-brand">{open ? "Chiudi" : "+ Aggiungi"}</button>
      </div>
      {open && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className={inputCls} placeholder="Nome *" />
          <input value={f.cognome} onChange={(e) => setF({ ...f, cognome: e.target.value })} className={inputCls} placeholder="Cognome" />
          <input value={f.ruolo} onChange={(e) => setF({ ...f, ruolo: e.target.value })} className={inputCls} placeholder="Ruolo" />
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} placeholder="Email" />
          <div className="flex gap-2">
            <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className={inputCls} placeholder="Telefono" />
            <button onClick={salva} className="glass-btn-primary text-white text-sm font-medium px-3 rounded-xl">Ok</button>
          </div>
        </div>
      )}
      {contatti.length === 0 ? (
        <p className="text-sm text-gray-400">Nessun referente: aggiungi la persona con cui parli.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {contatti.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2 text-sm gap-3">
              <div className="min-w-0">
                <span className="font-semibold text-gray-900">{r.nome}{r.cognome ? ` ${r.cognome}` : ""}</span>
                {r.ruolo && <span className="text-gray-500"> · {r.ruolo}</span>}
                {r.principale && <span className="pill-wait ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded">principale</span>}
                <div className="text-xs text-gray-500">{[r.email, r.telefono].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!r.principale && (
                  <button onClick={() => principale(r.id)} className="p-1.5 text-gray-400 hover:text-warn" title="Imposta principale"><Star className="w-4 h-4" /></button>
                )}
                <button onClick={() => del(r.id, r.nome)} className="p-1.5 text-gray-400 hover:text-bad" title="Elimina"><X className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

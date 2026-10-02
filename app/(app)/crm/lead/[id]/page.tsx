"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  UserPlus,
  Link2,
  Phone,
  Mail,
  Users,
  MessageCircle,
  StickyNote,
  CheckSquare,
  Check,
  X,
  FileText,
  ExternalLink,
} from "lucide-react";
import { fmt } from "@/lib/constants";
import {
  ESITI_ATTIVITA,
  FONTI_LEAD,
  PRIORITA_LEAD,
  QUALIFICHE_LEAD,
  STATI_LEAD,
  STATO_LEAD,
  TIPI_ATTIVITA,
} from "@/lib/lead";
import LeadFormModal, { type LeadFormValues } from "@/components/crm/LeadFormModal";
import { cn } from "@/lib/utils";

interface Attivita {
  id: number;
  tipo: string;
  oggetto: string | null;
  descrizione: string | null;
  esito: string | null;
  prossimaAzione: string | null;
  prossimaAzioneData: string | null;
  completata: boolean;
  data: string;
}
interface Contatto {
  id: number;
  nome: string;
  cognome: string | null;
  ruolo: string | null;
  email: string | null;
  telefono: string | null;
  principale: boolean;
}
interface Lead extends LeadFormValues {
  id: number;
  codice: string | null;
  createdAt: string;
  convertitoIl: string | null;
  cliente: { id: number; nome: string } | null;
  preventivi: { id: number; numero: string; oggetto: string; totale: number; status: string; createdAt: string }[];
  attivita: Attivita[];
  contatti: Contatto[];
  appunti: { id: number; testo: string; createdAt: string }[];
}

const ICONE: Record<string, typeof Phone> = {
  chiamata: Phone,
  email: Mail,
  riunione: Users,
  whatsapp: MessageCircle,
  nota: StickyNote,
  task: CheckSquare,
};
const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

export default function LeadDettaglioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [edit, setEdit] = useState(false);
  const [collega, setCollega] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/leads/${id}`);
    if (!r.ok) {
      router.replace("/crm/lead");
      return;
    }
    setLead(await r.json());
  }, [id, router]);
  useEffect(() => {
    load();
  }, [load]);

  const notify = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 3500);
  };

  const cambiaStato = async (stato: string) => {
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stato }),
    });
    load();
  };
  const converti = async () => {
    if (!confirm("Convertire il lead in cliente? Verrà creato il cliente (o riusato quello omonimo).")) return;
    const r = await fetch(`/api/leads/${id}/converti`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return notify(j.error ?? "Conversione non riuscita");
    notify(`Cliente ${j.cliente?.nome ?? ""} pronto`);
    load();
  };
  const del = async () => {
    if (!lead || !confirm(`Eliminare il lead ${lead.azienda ?? lead.nome}?`)) return;
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    router.push("/crm/lead");
  };

  if (!lead) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;
  const st = STATO_LEAD[lead.stato] ?? STATO_LEAD.nuovo;

  return (
    <div className="space-y-5">
      {msg && <div className="text-sm rounded-lg px-3 py-2 border bg-ok/10 border-ok/30 text-ok">{msg}</div>}

      <Link href="/crm/lead" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Lead
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title">{lead.azienda ?? lead.nome}</h1>
            <select
              value={lead.stato}
              onChange={(e) => cambiaStato(e.target.value)}
              className="tag cursor-pointer"
              style={{ background: st.color, color: "#fff" }}
            >
              {STATI_LEAD.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <span className="tag tag-neutral">
              {QUALIFICHE_LEAD.find((q) => q.value === lead.qualifica)?.label}
            </span>
            <span className="tag tag-neutral">
              priorità {PRIORITA_LEAD.find((p) => p.value === lead.priorita)?.label.toLowerCase()}
            </span>
          </div>
          <p className="page-sub">
            {lead.codice ?? ""}
            {lead.azienda && lead.nome !== lead.azienda ? ` · ${lead.nome}` : ""}
            {" · creato il "}
            {new Date(lead.createdAt).toLocaleDateString("it-IT")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lead.cliente ? (
            <Link href={`/crm/clienti/${lead.cliente.id}`} className="btn btn-secondary">
              <ExternalLink className="w-4 h-4" /> Cliente: {lead.cliente.nome}
            </Link>
          ) : (
            <>
              <button onClick={converti} className="btn btn-primary">
                <UserPlus className="w-4 h-4" /> Converti in cliente
              </button>
              <button onClick={() => setCollega(true)} className="btn btn-secondary">
                <Link2 className="w-4 h-4" /> Collega cliente
              </button>
            </>
          )}
          <Link href="/sales/preventivi" className="btn btn-secondary">
            <FileText className="w-4 h-4" /> Preventivo
          </Link>
          <button onClick={() => setEdit(true)} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100" title="Modifica">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={del} className="p-2 rounded-xl text-gray-500 hover:text-bad hover:bg-bad/10" title="Elimina">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Attivita lead={lead} onChanged={load} />
          <Referenti lead={lead} onChanged={load} />

          <section className="glass-card rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Preventivi</h2>
            {lead.preventivi.length === 0 ? (
              <p className="text-sm text-gray-400">Nessun preventivo collegato.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {lead.preventivi.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-sm gap-3">
                    <div className="min-w-0">
                      <Link href={`/sales/preventivi/${p.id}`} className="font-mono text-xs text-brand hover:underline mr-2">{p.numero}</Link>
                      <span className="text-gray-900 truncate">{p.oggetto}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="tag tag-neutral capitalize">{p.status}</span>
                      <span className="font-semibold text-gray-900">{fmt(p.totale)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {(lead.note || lead.appunti.length > 0) && (
            <section className="glass-card rounded-2xl p-5 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Note</h2>
              {lead.note && <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.note}</p>}
              {lead.appunti.map((a) => (
                <p key={a.id} className="text-sm text-gray-600 border-l-2 border-gray-200 pl-3">
                  <span className="text-[11px] text-gray-400 mr-2">{new Date(a.createdAt).toLocaleDateString("it-IT")}</span>
                  {a.testo}
                </p>
              ))}
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="glass-card rounded-2xl p-5" style={{ borderColor: st.color }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Consiglio</p>
            <p className="text-sm text-gray-700 mt-1">{st.consiglio}</p>
            {(lead.prossimaAzione || lead.prossimaAzioneData) && (
              <div className="mt-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Prossima azione</p>
                <p className="text-gray-900 font-medium">{lead.prossimaAzione ?? "—"}</p>
                {lead.prossimaAzioneData && (
                  <p className={cn("text-xs", new Date(lead.prossimaAzioneData).getTime() < Date.now() ? "text-bad font-semibold" : "text-gray-500")}>
                    entro il {new Date(lead.prossimaAzioneData).toLocaleDateString("it-IT")}
                  </p>
                )}
              </div>
            )}
          </section>
          <section className="glass-card rounded-2xl p-5 space-y-2 text-sm">
            <h2 className="text-sm font-semibold text-gray-900">Informazioni</h2>
            {[
              ["Email", lead.email],
              ["Telefono", lead.telefono],
              ["Sito", lead.sitoWeb],
              ["Settore", lead.settore],
              ["Paese", [lead.citta, lead.paese].filter(Boolean).join(", ")],
              ["P.IVA / NIF", lead.partitaIva],
              ["Fonte", [FONTI_LEAD.find((f) => f.value === lead.fonte)?.label, lead.fonteDettaglio].filter(Boolean).join(" · ")],
              ["Responsabile", lead.responsabile],
              ["Valore stimato", lead.valore != null ? fmt(lead.valore) : null],
              ["Convertito il", lead.convertitoIl ? new Date(lead.convertitoIl).toLocaleDateString("it-IT") : null],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3 border-b border-gray-50 py-1.5 last:border-0">
                <span className="text-gray-500">{k}</span>
                <span className="text-gray-900 text-right break-all">{v || <span className="text-gray-400">—</span>}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>

      {edit && (
        <LeadFormModal
          lead={lead}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            load();
          }}
        />
      )}
      {collega && (
        <CollegaClienteModal
          leadId={lead.id}
          onClose={() => setCollega(false)}
          onDone={() => {
            setCollega(false);
            notify("Cliente collegato");
            load();
          }}
        />
      )}
    </div>
  );
}

function Attivita({ lead, onChanged }: { lead: Lead; onChanged: () => void }) {
  const [tipo, setTipo] = useState("chiamata");
  const [oggetto, setOggetto] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [esito, setEsito] = useState("");
  const [prossima, setProssima] = useState("");
  const [prossimaData, setProssimaData] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const aggiungi = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/leads/${lead.id}/attivita`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, oggetto, descrizione, esito, prossimaAzione: prossima, prossimaAzioneData: prossimaData || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(j.error ?? "Errore");
      setOggetto("");
      setDescrizione("");
      setEsito("");
      setProssima("");
      setProssimaData("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const completa = async (a: Attivita) => {
    await fetch(`/api/leads/${lead.id}/attivita/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completata: !a.completata }),
    });
    onChanged();
  };
  const elimina = async (a: Attivita) => {
    if (!confirm("Eliminare l'attività?")) return;
    await fetch(`/api/leads/${lead.id}/attivita/${a.id}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Attività</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
          {TIPI_ATTIVITA.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input value={oggetto} onChange={(e) => setOggetto(e.target.value)} className={cn(inputCls, "md:col-span-2")} placeholder="Oggetto (es. call conoscitiva)" />
        <textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} className={cn(inputCls, "md:col-span-3 min-h-[56px]")} placeholder="Cosa è emerso" />
        <select value={esito} onChange={(e) => setEsito(e.target.value)} className={inputCls}>
          <option value="">Esito</option>
          {ESITI_ATTIVITA.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
        <input value={prossima} onChange={(e) => setProssima(e.target.value)} className={inputCls} placeholder="Prossima azione" />
        <div className="flex gap-2">
          <input type="date" value={prossimaData} onChange={(e) => setProssimaData(e.target.value)} className={inputCls} />
          <button onClick={aggiungi} disabled={busy} className="btn btn-primary disabled:opacity-60">
            Aggiungi
          </button>
        </div>
      </div>
      {err && <div className="text-sm text-bad">{err}</div>}

      <div className="space-y-3">
        {lead.attivita.length === 0 && <p className="text-sm text-gray-400">Nessuna attività registrata.</p>}
        {lead.attivita.map((a) => {
          const Icon = ICONE[a.tipo] ?? StickyNote;
          return (
            <div key={a.id} className={cn("flex gap-3 items-start", a.completata && "opacity-60")}>
              <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 grid place-items-center shrink-0">
                <Icon className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{a.oggetto ?? TIPI_ATTIVITA.find((t) => t.value === a.tipo)?.label}</span>
                  <span className="text-[11px] text-gray-400">{new Date(a.data).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>
                  {a.esito && (
                    <span className={cn("tag", a.esito === "positivo" ? "pill-ok" : a.esito === "negativo" ? "pill-late" : "pill-off")}>
                      {a.esito}
                    </span>
                  )}
                </div>
                {a.descrizione && <p className="text-sm text-gray-600 whitespace-pre-wrap">{a.descrizione}</p>}
                {(a.prossimaAzione || a.prossimaAzioneData) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    → {a.prossimaAzione ?? "prossima azione"}
                    {a.prossimaAzioneData && ` entro il ${new Date(a.prossimaAzioneData).toLocaleDateString("it-IT")}`}
                    {a.completata && " · fatta"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(a.prossimaAzione || a.prossimaAzioneData) && (
                  <button onClick={() => completa(a)} className={cn("p-1.5 rounded-lg", a.completata ? "text-ok" : "text-gray-400 hover:text-ok")} title={a.completata ? "Riapri" : "Segna fatta"}>
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => elimina(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-bad" title="Elimina">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Referenti({ lead, onChanged }: { lead: Lead; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nome: "", cognome: "", ruolo: "", email: "", telefono: "" });
  const salva = async () => {
    if (!f.nome.trim()) return;
    await fetch("/api/contatti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, leadId: lead.id }),
    });
    setF({ nome: "", cognome: "", ruolo: "", email: "", telefono: "" });
    setOpen(false);
    onChanged();
  };
  const del = async (c: Contatto) => {
    if (!confirm(`Eliminare il referente ${c.nome}?`)) return;
    await fetch(`/api/contatti/${c.id}`, { method: "DELETE" });
    onChanged();
  };
  return (
    <section className="glass-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Referenti</h2>
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-brand hover:text-brand">
          {open ? "Chiudi" : "+ Aggiungi"}
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className={inputCls} placeholder="Nome *" />
          <input value={f.cognome} onChange={(e) => setF({ ...f, cognome: e.target.value })} className={inputCls} placeholder="Cognome" />
          <input value={f.ruolo} onChange={(e) => setF({ ...f, ruolo: e.target.value })} className={inputCls} placeholder="Ruolo" />
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} placeholder="Email" />
          <div className="flex gap-2">
            <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className={inputCls} placeholder="Telefono" />
            <button onClick={salva} className="btn btn-primary">Ok</button>
          </div>
        </div>
      )}
      {lead.contatti.length === 0 ? (
        <p className="text-sm text-gray-400">Nessun referente.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {lead.contatti.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2 text-sm gap-3">
              <div>
                <span className="font-semibold text-gray-900">{c.nome}{c.cognome ? ` ${c.cognome}` : ""}</span>
                {c.ruolo && <span className="text-gray-500"> · {c.ruolo}</span>}
                <div className="text-xs text-gray-500">{[c.email, c.telefono].filter(Boolean).join(" · ")}</div>
              </div>
              <button onClick={() => del(c)} className="p-1.5 text-gray-400 hover:text-bad"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CollegaClienteModal({ leadId, onClose, onDone }: { leadId: number; onClose: () => void; onDone: () => void }) {
  const [clienti, setClienti] = useState<{ id: number; nome: string }[]>([]);
  const [sel, setSel] = useState("");
  useEffect(() => {
    fetch("/api/clienti").then((r) => r.json()).then((d) => setClienti(Array.isArray(d) ? d : []));
  }, []);
  const salva = async () => {
    if (!sel) return;
    await fetch(`/api/leads/${leadId}/collega-cliente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId: parseInt(sel, 10) }),
    });
    onDone();
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Collega a un cliente esistente</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className={labelCls}>Cliente</label>
          <select value={sel} onChange={(e) => setSel(e.target.value)} className={inputCls}>
            <option value="">— scegli —</option>
            {clienti.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Annulla</button>
          <button onClick={salva} disabled={!sel} className="btn btn-primary disabled:opacity-60">Collega</button>
        </div>
      </div>
    </div>
  );
}

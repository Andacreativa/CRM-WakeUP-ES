"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Clock,
  FileDown,
  FileSignature,
  Pencil,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { fmt } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { dataIt } from "@/lib/fatture";
import { scaricaPreventivoPDF } from "@/lib/preventivo-pdf";
import PreventivoFormModal from "@/components/preventivi/PreventivoFormModal";
import GeneraContrattoModal from "@/components/preventivi/GeneraContrattoModal";
import {
  type PreventivoDettaglio,
  STATUS_OPTIONS,
  isPreventivoScaduto,
  parseVociPreventivo,
  pillPreventivo,
  statusStyle,
} from "@/components/preventivi/tipi";
import { STATO_CONTRATTO_COLORI } from "@/components/contratti/tipi";

const LINGUE: Record<string, string> = { it: "Italiano", es: "Español", en: "English" };

// Scheda del preventivo (come la scheda della fattura): voci, condizioni e
// tutte le azioni, che prima erano icone nella lista.
export default function PreventivoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<PreventivoDettaglio | null>(null);
  const [edit, setEdit] = useState(false);
  const [genera, setGenera] = useState(false);
  const [scaricando, setScaricando] = useState(false);
  const [msg, setMsg] = useState<{ text: string; link?: string } | null>(null);

  const carica = useCallback(
    (): Promise<PreventivoDettaglio | null> =>
      fetch(`/api/preventivi/${id}`).then((r) => (r.ok ? r.json() : null)),
    [id],
  );
  useEffect(() => {
    carica().then((d) => (d ? setP(d) : router.replace("/sales/preventivi")));
  }, [carica, router]);
  const load = async () => {
    const d = await carica();
    if (d) setP(d);
  };

  if (!p) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const st = statusStyle(p.status);
  const scaduto = isPreventivoScaduto(p);
  const voci = parseVociPreventivo(p.voci);
  const ivaAmt = (p.subtotale * (p.iva || 0)) / 100;
  const fee = (p.subtotale * (p.feeCommerciale || 0)) / 100;

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/sales/preventivi");
  };
  const cambiaStato = async (status: string) => {
    if (status === p.status) return;
    const res = await fetch(`/api/preventivi/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(`Cambio stato non riuscito: ${j.error ?? res.status}`);
    // Accettato = nasce la bozza di contratto, come nella lista
    if (j.autoContrattoCreato)
      setMsg({
        text: `Creata la bozza di contratto ${j.autoContrattoCreato.numero}.`,
        link: `/sales/contratti/${j.autoContrattoCreato.id}`,
      });
    load();
  };
  const scaricaPdf = async () => {
    if (scaricando) return;
    setScaricando(true);
    try {
      await scaricaPreventivoPDF(p);
    } finally {
      setScaricando(false);
    }
  };
  const elimina = async () => {
    if (!confirm(`Eliminare il preventivo ${p.numero}?`)) return;
    const res = await fetch(`/api/preventivi/${p.id}`, { method: "DELETE" });
    if (!res.ok) return alert("Eliminazione non riuscita.");
    router.push("/sales/preventivi");
  };

  return (
    <div className="space-y-5">
      {msg && (
        <div className="text-sm rounded-lg px-3 py-2 border bg-ok/10 border-ok/30 text-ok flex items-center justify-between gap-3">
          <span>{msg.text}</span>
          <span className="flex items-center gap-3">
            {msg.link && (
              <Link href={msg.link} className="font-semibold underline">
                Apri il contratto
              </Link>
            )}
            <button onClick={() => setMsg(null)} aria-label="Chiudi">
              <X className="w-4 h-4" />
            </button>
          </span>
        </div>
      )}

      {/* Testata */}
      <div>
        <h1 className="page-title">
          Preventivo <em className="italic font-semibold text-gray-400 text-[20px]">{p.numero}</em>
        </h1>
        <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-[13px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Emesso il {dataIt(p.createdAt)}
          </span>
          {p.dataScadenza && (
            <span className={cn("inline-flex items-center gap-1.5", scaduto && "text-bad font-medium")}>
              <Clock className="w-3.5 h-3.5" /> Valido fino al {dataIt(p.dataScadenza)}
              {scaduto && " · scaduto"}
            </span>
          )}
          {/* Lo stato si sceglie qui: accettato crea la bozza di contratto */}
          <span className="pills">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => cambiaStato(o.value)}
                className={p.status === o.value ? "active" : ""}
                style={p.status === o.value ? { background: o.bg } : undefined}
              >
                {o.label}
              </button>
            ))}
          </span>
          <span className="tag tag-neutral">{LINGUE[p.lingua] ?? p.lingua}</span>
        </div>
      </div>

      {/* Azioni */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={indietro} className="btn btn-secondary">
          <ArrowLeft /> Indietro
        </button>
        <button onClick={() => setEdit(true)} className="btn btn-secondary">
          <Pencil /> Modifica
        </button>
        {p.status === "accettato" && (
          <button onClick={() => setGenera(true)} className="btn btn-secondary">
            <FileSignature /> Genera contratto
          </button>
        )}
        <button onClick={elimina} className="btn btn-secondary text-bad hover:text-bad">
          <Trash2 /> Elimina
        </button>
        <button onClick={scaricaPdf} disabled={scaricando} className="btn btn-primary">
          <FileDown /> {scaricando ? "Preparo il PDF…" : "Scarica PDF"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        {/* Colonna principale */}
        <div className="space-y-4 min-w-0">
          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Intestatario</h2>
            <div className="kv">
              <div className="k">Cliente</div>
              <div className="v">{p.nomeCliente || "—"}</div>
              {p.aziendaCliente && (
                <>
                  <div className="k">Ragione sociale</div>
                  <div className="v">{p.aziendaCliente}</div>
                </>
              )}
              {p.emailCliente && (
                <>
                  <div className="k">Email</div>
                  <div className="v">{p.emailCliente}</div>
                </>
              )}
              <div className="k">Oggetto</div>
              <div className="v">{p.oggetto}</div>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Voci</h2>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Servizio</th>
                    <th>Tipo</th>
                    <th className="text-right">Qtà</th>
                    <th className="text-right">Prezzo</th>
                    <th className="text-right">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {voci.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-gray-400">
                        Nessuna voce
                      </td>
                    </tr>
                  )}
                  {voci.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div className="text-gray-900">{v.servizio || "—"}</div>
                        {v.descrizione && <div className="tbl-muted">{v.descrizione}</div>}
                      </td>
                      <td>
                        <span className="tag tag-neutral">
                          {v.tipo === "una_tantum" ? "Una tantum" : "Mensile"}
                        </span>
                      </td>
                      <td className="text-right">{v.quantita}</td>
                      <td className="text-right whitespace-nowrap">{fmt(v.prezzoUnitario)}</td>
                      <td className="text-right whitespace-nowrap font-semibold text-gray-900">
                        {fmt(v.quantita * v.prezzoUnitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 ml-auto max-w-[320px] text-[13px] text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Subtotale</span>
                <span>{fmt(p.subtotale)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA {p.iva}%</span>
                <span>{fmt(ivaAmt)}</span>
              </div>
              {p.feeCommerciale > 0 && (
                <div className="flex justify-between">
                  <span>Fee commerciale {p.feeCommerciale}%</span>
                  <span className="text-partial">{fmt(fee)}</span>
                </div>
              )}
              <div className="flex justify-between border-t-2 border-brand pt-2.5 text-base font-bold text-brand">
                <span>Totale</span>
                <span>{fmt(p.totale)}</span>
              </div>
              <div className="flex justify-between text-ok font-semibold">
                <span>Guadagno netto</span>
                <span>{fmt(p.subtotale - fee)}</span>
              </div>
            </div>
          </section>

          {p.condizioni && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="card-title">Condizioni commerciali</h2>
              <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{p.condizioni}</p>
            </section>
          )}
          {p.note && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="card-title">Note interne</h2>
              <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{p.note}</p>
              <p className="text-[11px] text-gray-400 mt-2">Non compaiono nel PDF.</p>
            </section>
          )}
        </div>

        {/* Colonna laterale */}
        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Stato</h2>
            <span className={pillPreventivo(p.status)}>
              {p.status === "accettato" && <Check />}
              {p.status === "rifiutato" && <X />}
              {st.label}
            </span>
            <p className="text-[11px] text-gray-400 mt-2 leading-snug">
              Accettato crea in automatico la bozza di contratto e porta il lead a «vinta»;
              rifiutato lo porta a «persa».
            </p>
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Sorgente</h2>
            {p.lead ? (
              <Link
                href={`/crm/lead/${p.lead.id}`}
                className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <UserRound className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  Lead {p.lead.codice ?? ""}
                  <span className="block text-[11px] text-gray-500 truncate">
                    {p.lead.azienda ?? p.lead.nome} · {p.lead.stato}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : (
              <p className="text-xs text-gray-400">Nessun lead collegato.</p>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Contratti</h2>
            {p.contratti.length === 0 ? (
              <p className="text-xs text-gray-400">
                Nessun contratto generato da questo preventivo.
              </p>
            ) : (
              <div className="divide-y divide-gray-50 -mx-2">
                {p.contratti.map((c) => {
                  const col = STATO_CONTRATTO_COLORI[c.status] ?? STATO_CONTRATTO_COLORI.bozza;
                  return (
                    <Link
                      key={c.id}
                      href={`/sales/contratti/${c.id}`}
                      className="flex items-center gap-2 px-2 py-2 text-[13px] hover:bg-brand/10 rounded-lg"
                    >
                      <span className="font-mono text-gray-900">{c.numero}</span>
                      <span className="tag capitalize" style={{ background: col.bg, color: col.text }}>
                        {c.status}
                      </span>
                      <span className="ml-auto font-semibold text-gray-900 whitespace-nowrap">
                        {fmt(c.totaleContratto)}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      {edit && (
        <PreventivoFormModal
          preventivo={p}
          onClose={() => setEdit(false)}
          onSaved={(salvato) => {
            setEdit(false);
            const auto = (salvato as { autoContrattoCreato?: { id: number; numero: string } }).autoContrattoCreato;
            if (auto)
              setMsg({
                text: `Creata la bozza di contratto ${auto.numero}.`,
                link: `/sales/contratti/${auto.id}`,
              });
            load();
          }}
          onGeneraContratto={() => {
            setEdit(false);
            setGenera(true);
          }}
        />
      )}
      {genera && (
        <GeneraContrattoModal
          preventivo={p}
          onClose={() => setGenera(false)}
          onCreated={(c) => router.push(`/sales/contratti/${c.id}`)}
        />
      )}
    </div>
  );
}

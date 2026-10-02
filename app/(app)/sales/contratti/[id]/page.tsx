"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  FileDown,
  FileText,
  Pencil,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { buildContrattoText } from "@/lib/export";
import { dataIt } from "@/lib/fatture";
import ContrattoExportModal from "@/components/ContrattoExportModal";
import ContrattoFormModal from "@/components/contratti/ContrattoFormModal";
import ContrattoTesto from "@/components/contratti/ContrattoTesto";
import {
  type ContrattoDettaglio,
  STATI_CONTRATTO,
  STATO_CONTRATTO_COLORI,
  clientePerContratto,
  dataFineContratto,
  nomeClienteContratto,
} from "@/components/contratti/tipi";

// Scheda del contratto (come la scheda della fattura): anteprima del testo
// che finisce nel PDF e tutte le azioni, che prima erano icone nella lista.
export default function ContrattoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<ContrattoDettaglio | null>(null);
  const [edit, setEdit] = useState(false);
  const [esporta, setEsporta] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean; link?: string } | null>(null);

  const carica = useCallback(
    (): Promise<ContrattoDettaglio | null> =>
      fetch(`/api/contratti/${id}`).then((r) => (r.ok ? r.json() : null)),
    [id],
  );
  useEffect(() => {
    carica().then((d) => (d ? setC(d) : router.replace("/sales/contratti")));
  }, [carica, router]);
  const load = async () => {
    const d = await carica();
    if (d) setC(d);
  };

  if (!c) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const nome = nomeClienteContratto(c);
  const stato = STATO_CONTRATTO_COLORI[c.status] ?? STATO_CONTRATTO_COLORI.bozza;
  const fine = dataFineContratto(c);
  const testo = buildContrattoText({
    cliente: clientePerContratto(c),
    rappresentanteLegale: c.rappresentanteLegale,
    oggetto: c.oggetto,
    voci: c.voci,
    dataDecorrenza: c.dataDecorrenza,
    durataMesi: c.durataMesi,
    importoMensile: c.importoMensile,
    numeroRate: c.numeroRate,
    lingua: c.lingua === "es" ? "es" : "it",
  });

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/sales/contratti");
  };
  const cambiaStato = async (status: string) => {
    await fetch(`/api/contratti/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };
  // Genera le richieste di fattura (una per rata): niente fatture dirette.
  const generaRichieste = async () => {
    if (!confirm(`Generare ${c.numeroRate} richieste di fattura per ${nome} (${c.numero})?`)) return;
    const res = await fetch("/api/richieste-fattura/da-contratto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrattoId: c.id }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ text: j.error ?? "Generazione non riuscita", ok: false });
      return;
    }
    setMsg({
      text: `${Array.isArray(j) ? j.length : 0} richieste di fattura create.`,
      ok: true,
      link: "/sales/richieste",
    });
    load();
  };
  const scaricaPdf = () => {
    if (!c.cliente && !c.nomeClienteFallback) {
      alert("Imposta un cliente prima di esportare il PDF");
      return;
    }
    setEsporta(true);
  };
  const elimina = async () => {
    const avviso = c.richiesteFattura.length
      ? `\nLe ${c.richiesteFattura.length} richieste di fattura generate restano, senza contratto.`
      : "";
    if (!confirm(`Eliminare il contratto ${c.numero}?${avviso}`)) return;
    const res = await fetch(`/api/contratti/${c.id}`, { method: "DELETE" });
    if (!res.ok) return alert("Eliminazione non riuscita.");
    router.push("/sales/contratti");
  };

  const cliente = c.cliente;
  const indirizzo = cliente
    ? [cliente.via, [cliente.cap, cliente.citta, cliente.provincia ? `(${cliente.provincia})` : ""].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ")
    : "";
  const emesse = c.richiesteFattura.filter((r) => r.fatturaId || r.emessa).length;

  return (
    <div className="space-y-5">
      {msg && (
        <div
          className={cn(
            "text-sm rounded-lg px-3 py-2 border flex items-center justify-between gap-3",
            msg.ok ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad",
          )}
        >
          <span>{msg.text}</span>
          <span className="flex items-center gap-3">
            {msg.link && (
              <Link href={msg.link} className="font-semibold underline">
                Vai alle richieste
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
          Contratto <em className="italic font-semibold text-gray-400 text-[20px]">{c.numero}</em>
        </h1>
        <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-[13px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Dal {dataIt(c.dataDecorrenza)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Al {dataIt(fine)} · {c.durataMesi} mesi
          </span>
          {/* Lo stato si cambia qui, come nella lista */}
          <select
            value={c.status}
            onChange={(e) => cambiaStato(e.target.value)}
            className="tag cursor-pointer capitalize"
            style={{ background: stato.bg, color: stato.text }}
            title="Stato del contratto: clicca per cambiarlo"
          >
            {STATI_CONTRATTO.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="tag tag-neutral uppercase">{c.lingua === "es" ? "ES" : "IT"}</span>
          {c.preventivo && (
            <Link
              href={`/sales/preventivi/${c.preventivoId}`}
              className="tag tag-brand hover:underline"
              title="Apri il preventivo da cui nasce"
            >
              da {c.preventivo.numero}
            </Link>
          )}
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
        <button
          onClick={generaRichieste}
          className="btn btn-secondary"
          title="Crea una richiesta di fattura per ogni rata"
        >
          <Receipt /> Genera richieste
        </button>
        <button onClick={elimina} className="btn btn-secondary text-bad hover:text-bad">
          <Trash2 /> Elimina
        </button>
        <button onClick={scaricaPdf} className="btn btn-primary">
          <FileDown /> Scarica PDF
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        {/* Anteprima del contratto */}
        <section className="glass-card rounded-2xl p-6 md:p-8 min-w-0">
          <div className="flex items-center justify-between mb-5">
            <h2 className="card-title mb-0">Anteprima</h2>
            <span className="text-[11px] text-gray-400">
              Il testo del PDF; si può ritoccare da «Scarica PDF»
            </span>
          </div>
          <ContrattoTesto testo={testo} />
        </section>

        {/* Colonna laterale */}
        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Cliente</h2>
            <div className="kv" style={{ gridTemplateColumns: "110px minmax(0,1fr)" }}>
              <div className="k">Cliente</div>
              <div className="v">
                {cliente ? (
                  <Link href={`/crm/clienti/${cliente.id}`} className="hover:text-brand hover:underline">
                    {cliente.nome}
                  </Link>
                ) : (
                  <>
                    {nome} <span className="pill-wait ml-1">non collegato</span>
                  </>
                )}
              </div>
              {indirizzo && (
                <>
                  <div className="k">Indirizzo</div>
                  <div className="v">{indirizzo}</div>
                </>
              )}
              {cliente?.partitaIva && (
                <>
                  <div className="k">P.IVA</div>
                  <div className="v">{cliente.partitaIva}</div>
                </>
              )}
              <div className="k">Firma per</div>
              <div className="v">{c.rappresentanteLegale || "—"}</div>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Importi</h2>
            <div className="text-[13px] text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Importo mensile</span>
                <span className="text-gray-900">{fmt(c.importoMensile)}</span>
              </div>
              <div className="flex justify-between">
                <span>Rate</span>
                <span className="text-gray-900">{c.numeroRate}</span>
              </div>
              <div className="flex justify-between border-t-2 border-brand pt-2.5 text-base font-bold text-brand">
                <span>Totale</span>
                <span>{fmt(c.totaleContratto)}</span>
              </div>
            </div>
            {c.oggetto && <p className="mt-3 text-xs text-gray-500">{c.oggetto}</p>}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Fatturazione</h2>
            {c.richiesteFattura.length === 0 ? (
              <p className="text-xs text-gray-400">
                Nessuna richiesta di fattura: si creano con «Genera richieste», una per rata.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  {emesse} su {c.richiesteFattura.length} emesse
                </p>
                <div className="divide-y divide-gray-50 -mx-2">
                  {c.richiesteFattura.map((r) => {
                    const emessa = !!r.fatturaId || r.emessa;
                    return (
                      <Link
                        key={r.id}
                        href={`/sales/richieste/${r.id}`}
                        className="flex items-center gap-2 px-2 py-2 text-[13px] hover:bg-brand/10 rounded-lg"
                      >
                        <span className="flex-1 min-w-0 truncate text-gray-900">
                          {MESI[r.mese - 1]} {r.anno}
                        </span>
                        <span
                          className={cn(
                            "tag",
                            emessa ? "pill-ok" : r.validazione === "ok" ? "pill-info" : "pill-wait",
                          )}
                        >
                          {emessa ? (r.fattura?.numero ?? "emessa") : r.validazione === "ok" ? "da fare" : "da validare"}
                        </span>
                        <span className="font-semibold text-gray-900 whitespace-nowrap">{fmt(r.totale)}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
            {c.fatture.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">Fatture collegate</p>
                {c.fatture.map((f) => (
                  <Link
                    key={f.id}
                    href={`/finance/fatture/${f.id}`}
                    className="flex items-center gap-2 py-1 text-[13px] hover:text-brand"
                  >
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    <span className="font-mono">{f.numero ?? "senza numero"}</span>
                    <span className="ml-auto font-semibold">{fmt(f.importo)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {edit && (
        <ContrattoFormModal
          contratto={c}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            load();
          }}
        />
      )}
      {esporta && <ContrattoExportModal contratto={c} onClose={() => setEsporta(false)} />}
    </div>
  );
}

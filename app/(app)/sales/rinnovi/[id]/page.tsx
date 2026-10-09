"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  FilePlus2,
  Pencil,
  Receipt,
  RefreshCw,
  Trash2,
  User,
  X,
} from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { dataIt } from "@/lib/fatture";
import RinnovoFormModal from "@/components/rinnovi/RinnovoFormModal";
import { PillRichiesta } from "@/components/rinnovi/RinnoviView";
import {
  type Rinnovo,
  ANTICIPO_GIORNI,
  STATO_PILL,
  fatturazioneLabel,
  proprietaLabel,
  statoLabel,
  testoGiorni,
} from "@/components/rinnovi/tipi";

// Scheda del rinnovo di un sito: dati del dominio, cliente, richiesta di
// fattura del ciclo in corso e storico delle richieste degli anni passati.
export default function RinnovoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Rinnovo | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err"; link?: string } | null>(null);

  const carica = useCallback(
    (): Promise<Rinnovo | null> => fetch(`/api/rinnovi/${id}`).then((x) => (x.ok ? x.json() : null)),
    [id],
  );
  useEffect(() => {
    carica().then((d) => (d ? setR(d) : router.replace("/sales/rinnovi")));
  }, [carica, router]);
  const load = async () => {
    const d = await carica();
    if (d) setR(d);
  };
  const notify = (text: string, kind: "ok" | "err" = "ok", link?: string) =>
    setMsg({ text, kind, link });

  if (!r) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/sales/rinnovi");
  };
  const post = async (url: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(j.error ?? "Operazione non riuscita", "err");
        return null;
      }
      return j;
    } finally {
      setBusy(false);
    }
  };
  const creaRichiesta = async () => {
    const j = await post(`/api/rinnovi/${r.id}/crea-richiesta`);
    if (j) {
      notify(`Richiesta ${j.codice} creata: è in «Richieste fattura», da validare.`, "ok", `/sales/richieste/${j.id}`);
      load();
    }
  };
  const rinnovato = async () => {
    const d = new Date(r.scadenza);
    const prossima = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
    if (!confirm(`Segnare ${r.dominio} come rinnovato? La scadenza passa al ${dataIt(prossima)}.`))
      return;
    const j = await post(`/api/rinnovi/${r.id}/rinnovato`);
    if (j) {
      notify(`Rinnovato: prossima scadenza ${dataIt(j.scadenza)}.`);
      load();
    }
  };
  const elimina = async () => {
    if (!confirm(`Eliminare il rinnovo di ${r.dominio}? Le richieste già create restano.`)) return;
    await fetch(`/api/rinnovi/${r.id}`, { method: "DELETE" });
    router.push("/sales/rinnovi");
  };

  const puoCreare = !r.richiestaCorrente && (r.clienteId || r.nomeCliente) && r.importo > 0;
  const nonAttivo = r.stato === "non_attivo";

  return (
    <div className="space-y-5">
      {msg && (
        <div
          className={cn(
            "text-sm rounded-lg px-3 py-2 border flex items-center justify-between gap-3",
            msg.kind === "ok" ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad",
          )}
        >
          <span>{msg.text}</span>
          <span className="flex items-center gap-3">
            {msg.link && (
              <Link href={msg.link} className="font-semibold underline">
                Apri la richiesta
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
          Rinnovo sito <em className="italic font-semibold text-gray-400 text-[20px]">{r.dominio}</em>
        </h1>
        <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-[13px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> scade il {dataIt(r.scadenza)}
            <span className={cn(!nonAttivo && r.giorni < 0 && "text-bad", !nonAttivo && r.giorni >= 0 && r.giorni <= ANTICIPO_GIORNI && "text-warn")}>
              · {testoGiorni(r.giorni)}
            </span>
          </span>
          <span className={STATO_PILL[r.stato] ?? "pill-off"}>{statoLabel(r.stato)}</span>
          <span className="tag tag-neutral">{fatturazioneLabel(r.fatturazione)}</span>
          {r.cliente?.paese && <span className="tag tag-neutral">{r.cliente.paese}</span>}
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
          onClick={rinnovato}
          disabled={busy}
          className="btn btn-secondary disabled:opacity-60"
          title="Il dominio è stato rinnovato: la scadenza avanza di un anno"
        >
          <RefreshCw /> Rinnovato (+12 mesi)
        </button>
        <button onClick={elimina} className="btn btn-secondary text-bad hover:text-bad">
          <Trash2 /> Elimina
        </button>
        {puoCreare && (
          <button onClick={creaRichiesta} disabled={busy} className="btn btn-primary disabled:opacity-60">
            <FilePlus2 /> Crea richiesta fattura
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        {/* Colonna principale */}
        <div className="space-y-4 min-w-0">
          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Sito</h2>
            <div className="kv">
              <div className="k">Dominio</div>
              <div className="v">
                <a
                  href={`https://${r.dominio}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand hover:underline"
                >
                  {r.dominio}
                </a>
              </div>
              <div className="k">Scadenza</div>
              <div className="v">
                {dataIt(r.scadenza)} <span className="text-gray-400">· {testoGiorni(r.giorni)}</span>
              </div>
              <div className="k">Importo annuo</div>
              <div className="v">{r.importo > 0 ? fmt(r.importo) : "—"}</div>
              <div className="k">Fatturazione</div>
              <div className="v">{fatturazioneLabel(r.fatturazione)}</div>
              <div className="k">Hosting</div>
              <div className="v">{r.hosting || "—"}</div>
              <div className="k">Proprietà</div>
              <div className="v">{proprietaLabel(r.proprieta)}</div>
              <div className="k">Accesso</div>
              <div className="v">{r.accesso || "—"}</div>
            </div>
          </section>

          {r.note && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="card-title">Note</h2>
              <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{r.note}</p>
            </section>
          )}

          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Storico richieste</h2>
            {r.richieste.length === 0 ? (
              <p className="text-xs text-gray-400">Nessuna richiesta di fattura ancora.</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Richiesta</th>
                    <th>Scadenza coperta</th>
                    <th>Mese</th>
                    <th className="text-right">Importo</th>
                    <th>Stato</th>
                    <th>Fattura</th>
                  </tr>
                </thead>
                <tbody>
                  {r.richieste.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Link href={`/sales/richieste/${x.id}`} className="tbl-primary text-brand hover:underline">
                          {x.codice}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{dataIt(x.rinnovoScadenza)}</td>
                      <td className="whitespace-nowrap">
                        {MESI[x.mese - 1]} {x.anno}
                      </td>
                      <td className="text-right whitespace-nowrap">{fmt(x.totale)}</td>
                      <td>
                        <PillRichiesta r={x} />
                      </td>
                      <td>
                        {x.fatturaId ? (
                          <Link href={`/finance/fatture/${x.fatturaId}`} className="text-brand hover:underline">
                            {x.fattura?.numero ?? "bozza"}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Colonna laterale */}
        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Cliente</h2>
            {r.cliente ? (
              <Link
                href={`/crm/clienti/${r.cliente.id}`}
                className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <User className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  {r.cliente.nome}
                  <span className="block text-[11px] text-gray-500">
                    {r.cliente.paese}
                    {r.cliente.smh ? " · cliente SMH" : ""}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : r.nomeCliente ? (
              <p className="text-xs text-gray-600">
                <strong>{r.nomeCliente}</strong> <span className="pill-wait ml-1">non in anagrafica</span>
                <span className="block mt-1 text-gray-400">
                  Con «Modifica» lo scegli o lo crei: la richiesta di fattura lo prende da qui.
                </span>
              </p>
            ) : (
              <p className="text-xs text-gray-400">Nessun cliente: sito nostro o da assegnare.</p>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Fattura del rinnovo</h2>
            {r.richiestaCorrente ? (
              <Link
                href={`/sales/richieste/${r.richiestaCorrente.id}`}
                className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <Receipt className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  Richiesta {r.richiestaCorrente.codice}
                  <span className="block text-[11px] text-gray-500">
                    {fmt(r.richiestaCorrente.totale)} ·{" "}
                    {r.richiestaCorrente.fattura?.numero
                      ? `fattura ${r.richiestaCorrente.fattura.numero}`
                      : r.richiestaCorrente.stato === "da_fare"
                        ? "validata, da fare"
                        : r.richiestaCorrente.stato === "da_validare"
                          ? "da validare"
                          : r.richiestaCorrente.stato}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : (
              <p className="text-xs text-gray-400">
                {r.fatturabile
                  ? r.giorni > ANTICIPO_GIORNI
                    ? `Nessuna ancora: nasce da sola ${ANTICIPO_GIORNI} giorni prima della scadenza, oppure subito con «Crea richiesta fattura».`
                    : "Nessuna ancora: si crea con «Crea richiesta fattura»."
                  : r.fatturazione === "compresa"
                    ? "Il rinnovo è compreso in un'altra gestione: niente fattura da qui."
                    : r.fatturazione === "nessuna"
                      ? "Sito nostro: niente fattura."
                      : r.importo <= 0
                        ? "Manca l'importo del rinnovo: mettilo con «Modifica»."
                        : "Sito non attivo: niente richiesta automatica."}
              </p>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Date</h2>
            <div className="kv" style={{ gridTemplateColumns: "110px minmax(0,1fr)" }}>
              <div className="k">Creato</div>
              <div className="v">{dataIt(r.createdAt)}</div>
              <div className="k">Ultimo rinnovo</div>
              <div className="v">{r.rinnovatoIl ? dataIt(r.rinnovatoIl) : "—"}</div>
            </div>
          </section>
        </aside>
      </div>

      {edit && (
        <RinnovoFormModal
          rinnovo={r}
          onClose={() => setEdit(false)}
          onSaved={(testo) => {
            setEdit(false);
            notify(testo);
            load();
          }}
          onDeleted={() => router.push("/sales/rinnovi")}
        />
      )}
    </div>
  );
}

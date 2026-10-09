"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CircleCheck,
  FilePlus2,
  FileSignature,
  FileText,
  Globe,
  Pencil,
  Receipt,
  Trash2,
  Undo2,
  Unlink,
  X,
} from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { dataIt } from "@/lib/fatture";
import RichiestaFormModal from "@/components/richieste/RichiestaFormModal";
import { CollegaModal, CreaFatturaModal } from "@/components/richieste/modali";
import {
  type Richiesta,
  nomeCliente,
  parseVoci,
  ricorrenzaLabel,
} from "@/components/richieste/tipi";

const ORIGINE: Record<string, string> = {
  manuale: "creata a mano",
  contratto: "generata dal contratto",
  legacy_sales: "convertita dal vecchio registro Sales",
  rinnovo: "generata dal rinnovo del sito",
};

// Scheda della richiesta di fattura (come la scheda della fattura): voci,
// fattura collegata e tutte le azioni, che prima stavano nella riga.
export default function RichiestaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Richiesta | null>(null);
  const [edit, setEdit] = useState(false);
  const [crea, setCrea] = useState(false);
  const [collega, setCollega] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err"; link?: string } | null>(null);

  const carica = useCallback(
    (): Promise<Richiesta | null> =>
      fetch(`/api/richieste-fattura/${id}`).then((x) => (x.ok ? x.json() : null)),
    [id],
  );
  useEffect(() => {
    carica().then((d) => (d ? setR(d) : router.replace("/sales/richieste")));
  }, [carica, router]);
  const load = async () => {
    const d = await carica();
    if (d) setR(d);
  };
  const notify = (text: string, kind: "ok" | "err" = "ok", link?: string) =>
    setMsg({ text, kind, link });

  if (!r) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const validata = r.validazione === "ok";
  const voci = parseVoci(r.voci);
  const righe = voci.length ? voci : [{ descrizione: r.descrizione, importo: r.imponibile }];
  const imposta = Math.round(r.imponibile * (r.iva || 0)) / 100;

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/sales/richieste");
  };
  const toggle = async (flag: "validazione" | "emessa") => {
    const res = await fetch(`/api/richieste-fattura/${r.id}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      notify(j.error ?? "Operazione non riuscita", "err");
      return;
    }
    load();
  };
  const scollega = async () => {
    if (!confirm("Scollegare la fattura da questa richiesta? La fattura resta nel registro.")) return;
    await fetch(`/api/richieste-fattura/${r.id}/collega`, { method: "DELETE" });
    load();
  };
  const elimina = async () => {
    if (!confirm(`Eliminare la richiesta ${r.codice}?`)) return;
    await fetch(`/api/richieste-fattura/${r.id}`, { method: "DELETE" });
    router.push("/sales/richieste");
  };

  const pillStato = (() => {
    if (r.stato === "incassata") return <span className="pill-ok"><Check /> Incassata</span>;
    if (r.stato === "emessa") return <span className="pill-ok"><Check /> Emessa</span>;
    if (r.stato === "da_fare") return <span className="pill-info"><FilePlus2 /> Da fare</span>;
    return <span className="pill-wait"><X /> Da validare</span>;
  })();

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
                Apri la fattura
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
          Richiesta <em className="italic font-semibold text-gray-400 text-[20px]">{r.codice}</em>
        </h1>
        <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-[13px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> {MESI[r.mese - 1]} {r.anno}
            {r.dataInvio ? ` · invio previsto il ${dataIt(r.dataInvio)}` : ""}
          </span>
          {pillStato}
          {r.cliente?.paese && <span className="tag tag-neutral">{r.cliente.paese}</span>}
          {r.serieTotale && (
            <span className="tag tag-neutral" title={ricorrenzaLabel(r.ricorrenza)}>
              {r.serieIndice}/{r.serieTotale} · {ricorrenzaLabel(r.ricorrenza).toLowerCase()}
            </span>
          )}
        </div>
      </div>

      {/* Azioni: validazione → emissione, come la colonna Emissione della lista */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={indietro} className="btn btn-secondary">
          <ArrowLeft /> Indietro
        </button>
        <button onClick={() => setEdit(true)} className="btn btn-secondary">
          <Pencil /> Modifica
        </button>
        {validata ? (
          !r.emessaEff && (
            <button
              onClick={() => toggle("validazione")}
              className="btn btn-secondary"
              title="Rimette la richiesta in attesa di validazione"
            >
              <Undo2 /> Rimetti in attesa
            </button>
          )
        ) : (
          <button
            onClick={() => toggle("validazione")}
            className="btn btn-secondary"
            title="Tutto ok per fatturare"
          >
            <CircleCheck /> Valida
          </button>
        )}
        {validata && !r.emessaEff && (
          <>
            <button
              onClick={() => toggle("emessa")}
              className="btn btn-secondary"
              title="La fattura è stata fatta fuori da qui: spunta senza creare documenti"
            >
              <Check /> Segna emessa
            </button>
            <button onClick={() => setCrea(true)} className="btn btn-primary">
              <FilePlus2 /> Crea fattura
            </button>
          </>
        )}
        {r.emessaEff && !r.fatturaId && (
          <button
            onClick={() => toggle("emessa")}
            className="btn btn-secondary"
            title="Segnata emessa a mano: toglie la spunta"
          >
            <Undo2 /> Non emessa
          </button>
        )}
        {r.fatturaId && (
          <button
            onClick={scollega}
            className="btn btn-secondary"
            title="Stacca la fattura da questa richiesta (la fattura resta)"
          >
            <Unlink /> Scollega fattura
          </button>
        )}
        <button onClick={elimina} className="btn btn-secondary text-bad hover:text-bad">
          <Trash2 /> Elimina
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        {/* Colonna principale */}
        <div className="space-y-4 min-w-0">
          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Intestatario</h2>
            <div className="kv">
              <div className="k">Cliente</div>
              <div className="v">
                {r.cliente ? (
                  <Link href={`/crm/clienti/${r.cliente.id}`} className="hover:text-brand hover:underline">
                    {r.cliente.nome}
                  </Link>
                ) : (
                  <>
                    {nomeCliente(r)}
                    {!r.clienteId && <span className="pill-wait ml-2">non in anagrafica</span>}
                  </>
                )}
              </div>
              <div className="k">Responsabile</div>
              <div className="v">
                {r.responsabile || <span className="text-warn text-xs">da assegnare</span>}
              </div>
              <div className="k">Paese</div>
              <div className="v">{r.cliente?.paese ?? "—"}</div>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Voci</h2>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Descrizione</th>
                  <th className="text-right">Importo</th>
                </tr>
              </thead>
              <tbody>
                {righe.map((v, i) => (
                  <tr key={i}>
                    <td className="text-gray-900">{v.descrizione || "—"}</td>
                    <td className="text-right whitespace-nowrap">{fmt(v.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 ml-auto max-w-[320px] text-[13px] text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Imponibile</span>
                <span>{fmt(r.imponibile)}</span>
              </div>
              <div className="flex justify-between">
                <span>{r.iva > 0 ? `IGIC ${r.iva}%` : "IGIC esente"}</span>
                <span>{fmt(imposta)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-brand pt-2.5 text-base font-bold text-brand">
                <span>Totale</span>
                <span>{fmt(r.totale)}</span>
              </div>
            </div>
          </section>

          {r.note && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="card-title">Note</h2>
              <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{r.note}</p>
            </section>
          )}
        </div>

        {/* Colonna laterale */}
        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Fattura</h2>
            {r.fatturaId ? (
              <Link
                href={`/finance/fatture/${r.fatturaId}`}
                className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <Receipt className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  Fattura {r.fattura?.numero ?? "senza numero"}
                  <span className="block text-[11px] text-gray-500">
                    {fmt(r.fattura?.importo ?? 0)} · {r.incassataEff ? "incassata" : "da incassare"}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : r.emessa ? (
              <p className="text-xs text-gray-500">
                Segnata emessa a mano{r.emessaIl ? ` il ${dataIt(r.emessaIl)}` : ""}: nessuna fattura
                nel registro. Con «Collega» si aggancia quella esistente.
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                Nessuna fattura ancora. {validata ? "Si crea con «Crea fattura»." : "Prima serve la validazione."}
              </p>
            )}
            {!r.fatturaId && (
              <button
                onClick={() => setCollega(true)}
                className="mt-3 text-xs font-semibold text-gray-600 hover:text-brand"
              >
                Collega a una fattura esistente
              </button>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Sorgente</h2>
            {r.contratto ? (
              <Link
                href={`/sales/contratti/${r.contratto.id}`}
                className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <FileSignature className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  Contratto {r.contratto.numero}
                  <span className="block text-[11px] text-gray-500 truncate">{r.contratto.oggetto}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : r.rinnovo ? (
              <Link
                href={`/sales/rinnovi/${r.rinnovo.id}`}
                className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <Globe className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  Rinnovo sito {r.rinnovo.dominio}
                  <span className="block text-[11px] text-gray-500">
                    scadenza {dataIt(r.rinnovoScadenza)}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : (
              <p className="text-xs text-gray-400 inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Richiesta {ORIGINE[r.origine] ?? r.origine}.
              </p>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Date</h2>
            <div className="kv" style={{ gridTemplateColumns: "90px minmax(0,1fr)" }}>
              <div className="k">Creata</div>
              <div className="v">{dataIt(r.createdAt)}</div>
              <div className="k">Validata</div>
              <div className="v">{validata ? dataIt(r.validataIl) : "—"}</div>
              <div className="k">Emessa</div>
              <div className="v">
                {r.fattura?.data ? dataIt(r.fattura.data) : r.emessaIl ? dataIt(r.emessaIl) : "—"}
              </div>
            </div>
          </section>
        </aside>
      </div>

      {edit && (
        <RichiestaFormModal
          richiesta={r}
          annoDefault={r.anno}
          onClose={() => setEdit(false)}
          onSaved={(testo) => {
            setEdit(false);
            notify(testo);
            load();
          }}
          onDeleted={() => router.push("/sales/richieste")}
          onScollegata={() => {
            setEdit(false);
            load();
          }}
        />
      )}
      {crea && (
        <CreaFatturaModal
          richiesta={r}
          onClose={() => setCrea(false)}
          onCollega={() => {
            setCrea(false);
            setCollega(true);
          }}
          onDone={(f) => {
            setCrea(false);
            notify(
              f.numero
                ? `Fattura ${f.numero} creata e collegata.`
                : "Bozza di fattura creata: si emette dal suo pannello.",
              "ok",
              f.id ? `/finance/fatture/${f.id}` : undefined,
            );
            load();
          }}
        />
      )}
      {collega && (
        <CollegaModal
          richiesta={r}
          onClose={() => setCollega(false)}
          onDone={() => {
            setCollega(false);
            notify("Fattura collegata.");
            load();
          }}
        />
      )}
    </div>
  );
}

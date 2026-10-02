"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Calendar,
  Check,
  CircleCheck,
  Clock,
  Copy,
  FileDown,
  FileSignature,
  Mail,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { fmt, MESI, canaleLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  type FatturaDettaglio,
  totalePagato,
  residuo,
  statoCalcolato,
  isScaduta,
  incassoDaBanca,
  dataIt,
} from "@/lib/fatture";
import type { ImpostazioniFatture } from "@/lib/impostazioni";
import {
  exportFatturaPDF,
  inviaFatturaMail,
  totaliFattura,
  vociFattura,
} from "@/lib/fattura-pdf";
import FatturaFormModal from "@/components/fatture/FatturaFormModal";
import Spunta from "@/components/Spunta";

// Pannello della singola fattura (come «Fattura N°» di Northstar): le azioni
// stanno qui, non più nelle icone a destra della lista.

const METODI = ["Bonifico", "Carta", "Contanti", "Altro"];
const inputCls =
  "w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30";
const labelCls = "text-[11px] text-gray-500 block mb-1";
// Tolleranza di 5 centesimi, come la riconciliazione bancaria
const coperta = (incassato: number, importo: number) => incassato + 0.05 >= importo;

export default function FatturaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [f, setF] = useState<FatturaDettaglio | null>(null);
  const [cfg, setCfg] = useState<ImpostazioniFatture | null>(null);
  const [form, setForm] = useState<"modifica" | "duplica" | null>(null);

  const carica = useCallback(
    (): Promise<FatturaDettaglio | null> =>
      fetch(`/api/fatture/${id}`).then((r) => (r.ok ? r.json() : null)),
    [id],
  );
  useEffect(() => {
    carica().then((d) => (d ? setF(d) : router.replace("/finance/fatture")));
  }, [carica, router]);
  const load = async () => {
    const d = await carica();
    if (d) setF(d);
  };
  useEffect(() => {
    fetch("/api/impostazioni/fatture")
      .then((r) => (r.ok ? r.json() : null))
      .then(setCfg)
      .catch(() => {});
  }, []);

  if (!f) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/fatture/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Operazione non riuscita: ${j.error ?? res.status}`);
      return false;
    }
    await load();
    return true;
  };

  const numero = f.numero ?? "senza numero";
  const stato = statoCalcolato(f);
  const incassato = totalePagato(f);
  const scaduta = stato !== "pagato" && isScaduta(f);
  const tot = totaliFattura(f);
  const voci = vociFattura(f);
  const imposta = f.tipoIva.startsWith("igic") ? "IGIC" : "IVA";

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/finance/fatture");
  };
  const segnaIncassata = () => {
    if (confirm(`Segnare la fattura ${numero} come incassata senza registrare un incasso?`))
      patch({ pagato: true });
  };
  const riportaInAttesa = () => {
    if (confirm(`Riportare la fattura ${numero} in attesa di incasso?`)) patch({ pagato: false });
  };
  // Una fattura emessa non si elimina: si annulla e resta nel registro
  const annulla = () => {
    if (f.acconti.length)
      return alert("La fattura ha incassi registrati: eliminali prima di annullarla.");
    if (confirm(`Annullare la fattura ${numero}? Resterà visibile come annullata, fuori dai totali.`))
      patch({ annullata: true });
  };
  const ripristina = () => {
    if (confirm(`Ripristinare la fattura ${numero}? Torna in attesa di incasso.`))
      patch({ annullata: false });
  };
  const scaricaPdf = async () => {
    if (!cfg) return;
    try {
      await exportFatturaPDF(f, cfg);
    } catch {
      alert("Non sono riuscito a creare il PDF della fattura.");
    }
  };
  const inviaMail = async () => {
    try {
      if (await inviaFatturaMail(f.id)) load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Non sono riuscito a inviare la fattura.");
    }
  };

  const registraIncasso = async (dati: {
    importo: number;
    data: string;
    metodoPagamento: string;
    note: string;
  }) => {
    const res = await fetch("/api/acconti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fatturaId: f.id, ...dati, note: dati.note || null }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Incasso non registrato: ${j.error ?? res.status}`);
      return;
    }
    // Coperta dagli incassi = incassata (come fa la riconciliazione bancaria)
    if (!f.pagato && coperta(incassato + dati.importo, f.importo)) {
      await patch({ pagato: true, ...(f.metodo ? {} : { metodo: dati.metodoPagamento }) });
    } else await load();
  };
  const eliminaIncasso = async (a: FatturaDettaglio["acconti"][number]) => {
    if (
      !confirm(
        `Eliminare questo incasso di ${fmt(a.importo)}? Lo stato della fattura viene ricalcolato.`,
      )
    )
      return;
    const res = await fetch(`/api/acconti/${a.id}`, { method: "DELETE" });
    if (!res.ok) return alert("Eliminazione non riuscita.");
    // Torna in attesa solo se era incassata grazie agli incassi; una fattura
    // segnata incassata a mano resta com'è.
    if (f.pagato && coperta(incassato, f.importo) && !coperta(incassato - a.importo, f.importo)) {
      await patch({ pagato: false });
    } else await load();
  };

  const commerciale = f.commercialeRef
    ? [
        `${f.commercialeRef.nome}${f.commercialeRef.cognome ? ` ${f.commercialeRef.cognome}` : ""}`,
        f.commercialeRef.email,
      ]
        .filter(Boolean)
        .join(" · ")
    : f.commerciale;
  const c = f.cliente;
  const indirizzo = [c?.via, [c?.cap, c?.citta, c?.provincia ? `(${c.provincia})` : ""].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-5">
      {/* Testata */}
      <div>
        <h1 className="page-title">
          Fattura <em className="italic font-semibold text-gray-400 text-[20px]">{numero}</em>
        </h1>
        <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-[13px] text-gray-500">
          {f.data && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Emessa il {dataIt(f.data)}
            </span>
          )}
          {f.scadenza && (
            <span className={cn("inline-flex items-center gap-1.5", scaduta && "text-bad font-medium")}>
              <Clock className="w-3.5 h-3.5" /> Scadenza {dataIt(f.scadenza)}
            </span>
          )}
          {stato === "annullata" ? (
            <span className="pill-off">
              <Ban /> Annullata{f.annullataIl ? ` il ${dataIt(f.annullataIl)}` : ""}
            </span>
          ) : stato === "pagato" ? (
            <span className="pill-ok">
              <Check /> Incassato
            </span>
          ) : stato === "acconto" ? (
            <span className="pill-partial">
              <Wallet /> Acconto
            </span>
          ) : (
            <span className="pill-wait">
              <X /> In attesa
            </span>
          )}
          <span className="tag tag-neutral">{canaleLabel(f.azienda, f.aziendaNota)}</span>
          {!f.richiesta && <span className="tag tag-soft-warn">Creata manualmente</span>}
        </div>
      </div>

      {/* Azioni */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={indietro} className="btn btn-secondary">
          <ArrowLeft /> Indietro
        </button>
        {!f.annullata && (
          <button onClick={() => setForm("modifica")} className="btn btn-secondary">
            <Pencil /> Modifica
          </button>
        )}
        {(stato === "attesa" || stato === "acconto") && (
          <button onClick={segnaIncassata} className="btn btn-secondary">
            <CircleCheck /> Segna incassata
          </button>
        )}
        {f.pagato && !coperta(incassato, f.importo) && (
          <button
            onClick={riportaInAttesa}
            className="btn btn-secondary"
            title="È segnata incassata a mano, senza incassi che la coprono"
          >
            <Undo2 /> Riporta in attesa
          </button>
        )}
        {(stato === "attesa" || stato === "acconto") && (
          <button
            onClick={annulla}
            className="btn btn-secondary text-bad hover:text-bad"
            title="La fattura resta nel registro come annullata"
          >
            <Ban /> Annulla
          </button>
        )}
        {f.annullata && (
          <button onClick={ripristina} className="btn btn-secondary">
            <RotateCcw /> Ripristina
          </button>
        )}
        <button onClick={scaricaPdf} disabled={!cfg} className="btn btn-primary">
          <FileDown /> Scarica PDF
        </button>
        <button
          onClick={() => setForm("duplica")}
          className="btn btn-secondary"
          title="Prepara una nuova fattura copiando questa"
        >
          <Copy /> Duplica
        </button>
        {!f.annullata && (
          <button
            onClick={inviaMail}
            disabled={!c?.email}
            className="btn btn-secondary"
            title={
              c?.email
                ? `Invia la fattura a ${c.email}${f.inviata && f.dataInvio ? ` (già inviata il ${dataIt(f.dataInvio)})` : ""}`
                : "Il cliente non ha un indirizzo email: completare l'anagrafica"
            }
          >
            <Mail /> {f.inviata ? "Reinvia email" : "Invia email"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        {/* Colonna principale */}
        <div className="space-y-4 min-w-0">
          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Intestatario</h2>
            <div className="kv">
              <div className="k">Cliente</div>
              <div className="v">
                {c ? (
                  <Link href={`/crm/clienti/${c.id}`} className="hover:text-brand hover:underline">
                    {c.nome}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
              {c?.email && (
                <>
                  <div className="k">Email</div>
                  <div className="v">{c.email}</div>
                </>
              )}
              {indirizzo && (
                <>
                  <div className="k">Indirizzo</div>
                  <div className="v">{indirizzo}</div>
                </>
              )}
              {c?.partitaIva && (
                <>
                  <div className="k">P.IVA</div>
                  <div className="v">{c.partitaIva}</div>
                </>
              )}
              {c?.paese && (
                <>
                  <div className="k">Paese</div>
                  <div className="v">{c.paese}</div>
                </>
              )}
            </div>
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Responsabilità</h2>
            <div className="kv">
              <div className="k">Commerciale</div>
              <div className="v">{commerciale || "—"}</div>
              <div className="k">Progetto</div>
              <div className="v">{f.contratto ? `${f.contratto.numero} · ${f.contratto.oggetto}` : "—"}</div>
              <div className="k">Competenza</div>
              <div className="v">
                {MESI[f.mese - 1]} {f.anno}
              </div>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Solleciti</h2>
            {f.solleciti.length === 0 ? (
              <p className="text-[13px] text-gray-500">
                Nessun sollecito registrato.
                {scaduta && (
                  <>
                    {" "}
                    <strong>La fattura è scaduta:</strong> il sollecito si registra dalla pagina{" "}
                    <Link href="/finance/scadenze" className="text-brand hover:underline">
                      Scadenze
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : (
              <div className="kv">
                {f.solleciti.map((s) => (
                  <div key={s.id} className="contents">
                    <div className="k">{dataIt(s.data)}</div>
                    <div className="v">
                      <span className="capitalize">{s.canale}</span>
                      {s.nota && <div className="text-xs text-gray-500">{s.nota}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Voci fattura</h2>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Descrizione</th>
                  <th className="text-right">Qtà</th>
                  <th className="text-right">Prezzo</th>
                  <th className="text-right">{imposta}</th>
                  <th className="text-right">Imponibile</th>
                </tr>
              </thead>
              <tbody>
                {voci.map((v, i) => (
                  <tr key={i}>
                    <td className="text-gray-900">{v.descrizione}</td>
                    <td className="text-right">{v.quantita}</td>
                    <td className="text-right whitespace-nowrap">{fmt(v.prezzo)}</td>
                    <td className="text-right">{f.iva}%</td>
                    <td className="text-right whitespace-nowrap">{fmt(v.imponibile)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 ml-auto max-w-[320px] text-[13px] text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Imponibile</span>
                <span>{fmt(tot.imponibile)}</span>
              </div>
              <div className="flex justify-between">
                <span>{f.iva > 0 ? `${imposta} ${f.iva}%` : `${imposta} esente`}</span>
                <span>{fmt(tot.imposta)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-brand pt-2.5 text-base font-bold text-brand">
                <span>Totale</span>
                <span>{fmt(tot.totale)}</span>
              </div>
              {incassato > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Incassato</span>
                    <span className="text-ok">{fmt(incassato)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Residuo</span>
                    <span className={stato === "pagato" ? "text-ok" : "text-bad"}>
                      {fmt(stato === "pagato" ? 0 : residuo(f))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          {!f.annullata && (
            <Incassi
              key={`${f.id}-${f.acconti.length}-${f.pagato}`}
              f={f}
              onRegistra={registraIncasso}
              onElimina={eliminaIncasso}
            />
          )}
        </div>

        {/* Colonna laterale */}
        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Sorgente</h2>
            {f.richiesta ? (
              <Link
                href={`/sales/richieste/${f.richiesta.id}`}
                className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <Receipt className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  Richiesta {f.richiesta.codice}
                  <span className="block text-[11px] text-gray-500 truncate">{f.richiesta.descrizione}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : (
              <p className="text-xs text-gray-400">Nessuna richiesta collegata (fattura manuale).</p>
            )}
            {f.contratto && (
              <Link
                href={`/sales/contratti/${f.contratto.id}`}
                className="mt-2 flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <FileSignature className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  Contratto {f.contratto.numero}
                  <span className="block text-[11px] text-gray-500 truncate">{f.contratto.oggetto}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Venditore</h2>
            <p className="text-[13px] font-semibold text-gray-900">{cfg?.ragioneSociale || "(da configurare)"}</p>
            {cfg?.nif && <p className="text-xs text-gray-500 mt-1.5">NIF {cfg.nif}</p>}
            {cfg?.iban && <p className="text-xs text-gray-500 mt-1">IBAN {cfg.iban}</p>}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <img src="/verifactu-logo.png" alt="VeriFactu" className="h-6 w-auto mb-3" />
            <div className="flex items-center gap-2">
              <Spunta
                on={f.presentata}
                onClick={() => patch({ presentata: !f.presentata })}
                title={
                  f.presentata
                    ? "Presentata: clicca per annullare"
                    : "Non presentata: clicca per segnarla come presentata"
                }
              />
              <span className="text-[13px] text-gray-900">
                {f.presentata
                  ? `Presentata${f.presentataIl ? ` il ${dataIt(f.presentataIl)}` : ""}`
                  : "Non presentata"}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-snug">
              Per ora la spunta si mette a mano: l&apos;invio automatico arriva con il collegamento a
              VeriFactu.
            </p>
          </section>
        </aside>
      </div>

      {form && (
        <FatturaFormModal
          fattura={form === "modifica" ? f : null}
          duplicaDa={form === "duplica" ? f : null}
          annoDefault={form === "modifica" ? f.anno : new Date().getFullYear()}
          onClose={() => setForm(null)}
          onSaved={(salvata) => {
            const era = form;
            setForm(null);
            if (era === "duplica") router.push(`/finance/fatture/${salvata.id}`);
            else load();
          }}
        />
      )}
    </div>
  );
}

function Incassi({
  f,
  onRegistra,
  onElimina,
}: {
  f: FatturaDettaglio;
  onRegistra: (d: { importo: number; data: string; metodoPagamento: string; note: string }) => Promise<void>;
  onElimina: (a: FatturaDettaglio["acconti"][number]) => Promise<void>;
}) {
  const aperta = statoCalcolato(f) !== "pagato";
  const [importo, setImporto] = useState(aperta ? residuo(f).toFixed(2).replace(".", ",") : "");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState(METODI[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = parseFloat(importo.replace(/\./g, "").replace(",", "."));
    if (!n || n <= 0 || busy) return;
    setBusy(true);
    try {
      await onRegistra({ importo: n, data, metodoPagamento: metodo, note: note.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="card-title">Incassi</h2>
      {f.acconti.length > 0 ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Data</th>
              <th>Metodo</th>
              <th>Riferimento</th>
              <th className="text-right">Importo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {f.acconti.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{dataIt(a.data)}</td>
                <td>{a.metodoPagamento || "—"}</td>
                <td className="text-xs text-gray-500">{a.note || "—"}</td>
                <td className="text-right font-semibold text-gray-900 whitespace-nowrap">{fmt(a.importo)}</td>
                <td className="text-right w-10">
                  {incassoDaBanca(a) ? (
                    <Link
                      href="/finance/banca"
                      className="tag tag-neutral"
                      title="Arriva dalla riconciliazione bancaria: si scollega da Banca › Entrate"
                    >
                      banca
                    </Link>
                  ) : (
                    <button
                      onClick={() => onElimina(a)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-bad hover:bg-bad/10"
                      title="Elimina incasso"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[13px] text-gray-400">
          {f.pagato ? "Segnata incassata a mano, senza incassi registrati." : "Nessun incasso registrato."}
        </p>
      )}

      {aperta && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className={labelCls}>Importo (€) *</label>
              <input
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                inputMode="decimal"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Metodo</label>
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={inputCls}>
                {METODI.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-2.5 items-end">
            <div>
              <label className={labelCls}>Riferimento (n. bonifico, nota)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} className={inputCls} />
            </div>
            <button onClick={submit} disabled={busy} className="btn btn-primary w-full">
              <Plus /> Registra incasso
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

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
  Send,
  Trash2,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  type FatturaDettaglio,
  totalePagato,
  residuo,
  statoCalcolato,
  isScaduta,
  incassoDaBanca,
  dataIt,
  gestitaVf,
  correggibileVf,
  TIPI_RETTIFICA,
} from "@/lib/fatture";
import type { ImpostazioniFatture } from "@/lib/impostazioni";
import {
  exportFatturaPDF,
  inviaFatturaMail,
  totaliFattura,
  vociFattura,
} from "@/lib/fattura-pdf";
import FatturaFormModal from "@/components/fatture/FatturaFormModal";
import StatoVf from "@/components/fatture/StatoVf";
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
  const [rettifica, setRettifica] = useState(false);
  const [busy, setBusy] = useState(false);
  // Invio all'AEAT: quanti registri aspettano, fra quanto si può riprovare
  const [coda, setCoda] = useState<{ attesa: number; errore: string | null } | null>(null);

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

  // Registro in coda: si riprova da soli appena l'AEAT lo permette
  const inCoda = f?.vfStato === "in_coda";
  useEffect(() => {
    if (!inCoda) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetch("/api/verifactu/coda")
      .then((r) => r.json())
      .then((c: { attesa: number; errore: string | null }) => {
        if (!vivo) return;
        setCoda({ attesa: c.attesa, errore: c.errore });
        if (c.errore) return;
        timer = setTimeout(
          async () => {
            const r = await fetch("/api/verifactu/coda", { method: "POST" }).then((x) => x.json());
            if (!vivo) return;
            setCoda({ attesa: r.attesa ?? 0, errore: r.errore ?? r.error ?? null });
            const d = await carica();
            if (vivo && d) setF(d);
          },
          Math.max(2, c.attesa + 1) * 1000,
        );
      })
      .catch(() => {});
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [inCoda, carica]);

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

  const bozza = f.stato === "bozza";
  const rett = f.tipoFattura !== "F1";
  const gestita = gestitaVf(f);
  const numero = f.numero ?? (bozza ? "bozza" : "senza numero");
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
  // Chiamata a una delle azioni della fattura (emetti, verifactu, rettifica)
  const azione = async (percorso: string, body: Record<string, unknown> = {}) => {
    if (busy) return null;
    setBusy(true);
    try {
      const res = await fetch(`/api/fatture/${f.id}/${percorso}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((Array.isArray(j.errori) && j.errori.length ? j.errori : [j.error ?? res.status]).join("\n"));
        return null;
      }
      return j;
    } finally {
      setBusy(false);
    }
  };
  const vfAttivo = !!cfg && cfg.vfModo !== "spento";
  const ambienteVf = cfg?.vfModo === "produzione" ? "invio vero" : "ambiente di prova, senza valore fiscale";
  const emetti = async () => {
    let numeroScelto: string | undefined;
    if (vfAttivo) {
      if (
        !confirm(
          `Emettere la fattura?\n\nRiceve il numero e il suo registro parte per l'AEAT (${ambienteVf}). Dopo non si modifica più: si corregge con una rettificativa.`,
        )
      )
        return;
    } else {
      // Senza VeriFactu il numero si conferma a mano (come le fatture registrate finora)
      const anno = f.data ? new Date(f.data).getFullYear() : new Date().getFullYear();
      const proposto = rett
        ? ""
        : await fetch(`/api/impostazioni/fatture/prossimo-numero?anno=${anno}`)
            .then((r) => r.json())
            .then((n) => String(n?.numero ?? ""))
            .catch(() => "");
      const scritto = prompt("Numero della fattura (vuoto = il prossimo della serie)", proposto);
      if (scritto === null) return;
      numeroScelto = scritto.trim();
    }
    if (await azione("emetti", { numero: numeroScelto })) load();
  };
  const eliminaBozza = async () => {
    if (!confirm("Eliminare questa bozza? Non è una fattura: sparisce e basta.")) return;
    const res = await fetch(`/api/fatture/${f.id}`, { method: "DELETE" });
    if (!res.ok) return alert("Eliminazione non riuscita.");
    router.replace("/finance/fatture?tab=bozze");
  };
  const reinvia = async () => {
    if (
      confirm(
        `Rimandare all'AEAT il registro della fattura ${numero} con i dati di adesso? Se c'è un errore nei dati, correggilo prima con Modifica.`,
      ) &&
      (await azione("verifactu", { azione: "reinvia" }))
    )
      load();
  };
  const inviaCoda = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/verifactu/coda", { method: "POST" }).then((x) => x.json());
      setCoda({ attesa: r.attesa ?? 0, errore: r.errore ?? r.error ?? null });
      await load();
    } finally {
      setBusy(false);
    }
  };
  // Una fattura emessa non si elimina: si annulla e resta nel registro
  const annulla = async () => {
    if (f.acconti.length)
      return alert("La fattura ha incassi registrati: eliminali prima di annullarla.");
    if (gestita) {
      // Trasmessa a VeriFactu: l'annullamento è un registro che parte per l'AEAT
      if (
        confirm(
          `Annullare la fattura ${numero}?\n\nParte per l'AEAT il registro di annullamento (${ambienteVf}) e non si torna indietro. Serve per una fattura emessa per errore; se il cliente l'ha già ricevuta, la strada giusta è la rettificativa.`,
        ) &&
        (await azione("verifactu", { azione: "annulla" }))
      )
        load();
      return;
    }
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
          {bozza ? (rett ? "Bozza di rettificativa" : "Bozza di fattura") : rett ? "Rettificativa" : "Fattura"}{" "}
          {!bozza && <em className="italic font-semibold text-gray-400 text-[20px]">{numero}</em>}
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
          {stato === "bozza" ? (
            <span className="pill-off" title="Non è ancora una fattura: non ha numero e si può modificare o eliminare">
              <Pencil /> Bozza
            </span>
          ) : stato === "annullata" ? (
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
          {f.cliente?.paese && <span className="tag tag-neutral">{f.cliente.paese}</span>}
          {f.cliente?.smh && <span className="tag tag-neutral" title="Cliente portato da Social Media House">SMH</span>}
          {gestita && <StatoVf stato={f.vfStato} />}
          {f.rettificaDi && (
            <Link href={`/finance/fatture/${f.rettificaDi.id}`} className="tag tag-brand hover:underline">
              Rettifica di {f.rettificaDi.numero ?? "—"}
            </Link>
          )}
          {!f.richiesta && !f.rettificaDi && <span className="tag tag-soft-warn">Creata manualmente</span>}
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
        {bozza && (
          <button onClick={eliminaBozza} className="btn btn-secondary text-bad hover:text-bad">
            <Trash2 /> Elimina bozza
          </button>
        )}
        {bozza && (
          <button
            onClick={emetti}
            disabled={busy || !cfg}
            className="btn btn-primary"
            title={vfAttivo ? "Assegna il numero e manda il registro all'AEAT" : "Assegna il numero: diventa una fattura"}
          >
            <Send /> {vfAttivo ? "Emetti e invia" : "Emetti"}
          </button>
        )}
        {correggibileVf(f) && (
          <button
            onClick={reinvia}
            disabled={busy}
            className="btn btn-primary"
            title="Rimanda il registro all'AEAT con i dati corretti"
          >
            <Send /> Reinvia all&apos;AEAT
          </button>
        )}
        {inCoda && (
          <button
            onClick={inviaCoda}
            disabled={busy}
            className="btn btn-secondary"
            title="Il registro aspetta di partire: riprova adesso"
          >
            <Send /> Invia all&apos;AEAT
          </button>
        )}
        {(stato === "attesa" || stato === "acconto") && (
          <button onClick={segnaIncassata} className="btn btn-secondary">
            <CircleCheck /> Segna incassata
          </button>
        )}
        {!bozza && !rett && !f.annullata && (
          <button
            onClick={() => setRettifica(true)}
            className="btn btn-secondary"
            title="Prepara la fattura rettificativa che corregge questa"
          >
            <Receipt /> Rettifica
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
        {f.annullata && !gestita && (
          <button onClick={ripristina} className="btn btn-secondary">
            <RotateCcw /> Ripristina
          </button>
        )}
        <button onClick={scaricaPdf} disabled={!cfg} className={bozza ? "btn btn-secondary" : "btn btn-primary"}>
          <FileDown /> {bozza ? "Anteprima PDF" : "Scarica PDF"}
        </button>
        <button
          onClick={() => setForm("duplica")}
          className="btn btn-secondary"
          title="Prepara una nuova fattura copiando questa"
        >
          <Copy /> Duplica
        </button>
        {!f.annullata && !bozza && (
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
            {f.descrizione && <p className="text-[13px] text-gray-600 mb-3">{f.descrizione}</p>}
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
                <span>
                  {f.iva > 0
                    ? `${imposta} ${f.iva}%`
                    : `${imposta} ${f.causaIgic?.startsWith("N") ? "non soggetta" : "esente"}${f.causaIgic ? ` (${f.causaIgic})` : ""}`}
                </span>
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

          {!f.annullata && !bozza && f.importo > 0 && (
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
            {f.rettifiche.map((r) => (
              <Link
                key={r.id}
                href={`/finance/fatture/${r.id}`}
                className="mt-2 flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <Receipt className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  Rettificativa {r.numero ?? "(bozza)"}
                  <span className="block text-[11px] text-gray-500">{fmt(r.importo)}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ))}
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
            {gestita ? (
              <SchedaVf f={f} coda={coda} />
            ) : bozza ? (
              <p className="text-[12px] text-gray-500 leading-snug">
                {vfAttivo
                  ? "All'emissione nasce il registro e parte per l'AEAT."
                  : "VeriFactu è spento: la fattura si registra senza invio."}
              </p>
            ) : (
              <>
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
                  Fattura registrata a mano (emessa con un altro programma): la spunta si mette a mano.
                </p>
              </>
            )}
          </section>
        </aside>
      </div>

      {rettifica && (
        <RettificaModal
          numero={numero}
          busy={busy}
          onClose={() => setRettifica(false)}
          onConferma={async (tipo, totale) => {
            const b = await azione("rettifica", { tipo, totale });
            if (!b) return;
            setRettifica(false);
            router.push(`/finance/fatture/${b.id}`);
          }}
        />
      )}

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

// Stato dell'invio all'AEAT e storia dei registri della fattura
function SchedaVf({
  f,
  coda,
}: {
  f: FatturaDettaglio;
  coda: { attesa: number; errore: string | null } | null;
}) {
  const ultimo = f.registriVerifactu[f.registriVerifactu.length - 1];
  const prova = ultimo?.ambiente === "prova";
  return (
    <div className="space-y-2.5 text-[13px]">
      <div className="flex items-center gap-2 flex-wrap">
        <StatoVf stato={f.vfStato} />
        {prova && (
          <span className="tag tag-soft-info" title="Registro inviato all'ambiente di prova dell'AEAT: non ha valore fiscale">
            Prova
          </span>
        )}
      </div>
      {f.vfStato === "in_coda" && (
        <p className="text-xs text-gray-500 leading-snug">
          {coda?.errore
            ? `Non parte: ${coda.errore}.`
            : ultimo?.ultimoErrore
              ? `Ultimo tentativo: ${ultimo.ultimoErrore}. Si riprova da soli.`
              : coda && coda.attesa > 0
                ? `In attesa del turno d'invio (circa ${coda.attesa} s).`
                : "Invio in corso…"}
        </p>
      )}
      {ultimo?.codiceErrore && (
        <p className="text-xs text-bad leading-snug">
          Errore {ultimo.codiceErrore}: {ultimo.descrizioneErrore}
        </p>
      )}
      {ultimo?.csv && (
        <p className="text-xs text-gray-500 break-all">
          Ricevuta AEAT (CSV): <span className="font-mono">{ultimo.csv}</span>
        </p>
      )}
      {f.vfQr && (
        <a href={f.vfQr} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
          Verifica sul sito dell&apos;AEAT
        </a>
      )}
      <div className="pt-2 border-t border-gray-100 space-y-1">
        {f.registriVerifactu.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
            <span>
              {r.tipo === "anulacion" ? "Annullamento" : r.subsanacion ? "Correzione" : "Emissione"} ·{" "}
              {new Date(r.createdAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
            </span>
            <span
              className={
                r.stato === "accettato"
                  ? "text-ok"
                  : r.stato === "rifiutato"
                    ? "text-bad"
                    : r.stato === "in_coda"
                      ? "text-warn"
                      : "text-warn"
              }
            >
              {r.stato === "accettato"
                ? "accettato"
                : r.stato === "accettato_con_errori"
                  ? "con errori"
                  : r.stato === "rifiutato"
                    ? "rifiutato"
                    : "in coda"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Scelta della rettificativa: storno totale o correzione parziale
function RettificaModal({
  numero,
  busy,
  onClose,
  onConferma,
}: {
  numero: string;
  busy: boolean;
  onClose: () => void;
  onConferma: (tipo: string, totale: boolean) => void;
}) {
  const [totale, setTotale] = useState(true);
  const [tipo, setTipo] = useState("R1");
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Rettifica la fattura {numero}</h2>
        <p className="text-[13px] text-gray-500">
          Si prepara la bozza di una fattura rettificativa (serie a parte). Diventa definitiva quando la
          emetti.
        </p>
        <div className="space-y-2">
          {[
            { v: true, t: "Storno totale", d: "Stesse righe col segno meno: la fattura torna a zero." },
            { v: false, t: "Correzione parziale", d: "Scrivi tu la differenza (in più o in meno)." },
          ].map((o) => (
            <label
              key={String(o.v)}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer",
                totale === o.v ? "border-brand bg-brand/5" : "border-gray-200",
              )}
            >
              <input
                type="radio"
                checked={totale === o.v}
                onChange={() => setTotale(o.v)}
                className="mt-1 accent-pink-600"
              />
              <span className="text-[13px] text-gray-900">
                {o.t}
                <span className="block text-xs text-gray-500">{o.d}</span>
              </span>
            </label>
          ))}
        </div>
        <div>
          <label className={labelCls}>Motivo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            {TIPI_RETTIFICA.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Annulla
          </button>
          <button onClick={() => onConferma(tipo, totale)} disabled={busy} className="btn btn-primary flex-1">
            Prepara la bozza
          </button>
        </div>
      </div>
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

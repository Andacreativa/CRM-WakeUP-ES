"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Copy,
  FileText,
  Mail,
  Pause,
  Pencil,
  Play,
  Trash2,
  User,
  X,
} from "lucide-react";
import { fmt } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { dataIt } from "@/lib/fatture";
import { formattaIban } from "@/lib/sepa";
import { MESI_L } from "@/lib/abbonamenti-testi";
import AbbonamentoFormModal from "@/components/abbonamenti/AbbonamentoFormModal";
import { copia, meseBreve } from "@/components/abbonamenti/AbbonamentiView";
import {
  type Abbonamento,
  LINGUE,
  STATO_ABB_PILL,
  STATO_ADDEBITO_PILL,
  nomeProdotto,
  statoAbbonamentoLabel,
  statoAddebitoLabel,
  tipoIvaLabel,
} from "@/components/abbonamenti/tipi";

// Scheda dell'abbonamento: piano e prezzo, intestatario, conto e mandato,
// griglia degli addebiti anno per anno (come il Club di Molokai), cliente
// CRM e contratto accettato.
export default function AbbonamentoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Abbonamento | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mostraContratto, setMostraContratto] = useState(false);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  const carica = useCallback(
    (): Promise<Abbonamento | null> => fetch(`/api/abbonamenti/${id}`).then((x) => (x.ok ? x.json() : null)),
    [id],
  );
  useEffect(() => {
    carica().then((d) => (d ? setA(d) : router.replace("/sales/abbonamenti")));
  }, [carica, router]);
  const load = async () => {
    const d = await carica();
    if (d) setA(d);
  };
  const notify = (text: string, kind: "ok" | "err" = "ok") => setMsg({ text, kind });

  if (!a) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/sales/abbonamenti");
  };
  const chiama = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
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
  const stato = async (s: "attivo" | "sospeso" | "cancellato") => {
    const testo =
      s === "sospeso"
        ? "Sospendere l'abbonamento? Niente addebiti finché non lo riattivi."
        : s === "cancellato"
          ? "Cancellare l'abbonamento? Vale fino a fine mese: gli addebiti dei mesi dopo si annullano."
          : "Riattivare l'abbonamento?";
    if (!confirm(testo)) return;
    const j = await chiama(`/api/abbonamenti/${a.id}/stato`, "POST", { stato: s });
    if (j) {
      notify(`Abbonamento ${statoAbbonamentoLabel(s).toLowerCase()}`);
      load();
    }
  };
  const inviaLink = async () => {
    const j = await chiama(`/api/abbonamenti/${a.id}/invia-link`, "POST");
    if (j) {
      notify(j.invio?.inviata ? `Link di firma mandato a ${j.invio.a}` : `Link non inviato: ${j.invio?.errore ?? "posta non configurata"}. Copialo qui sotto.`, j.invio?.inviata ? "ok" : "err");
      load();
    }
  };
  const copiaLink = async () => {
    if (!a.linkFirma) return;
    const link = a.linkFirma.startsWith("http") ? a.linkFirma : `${window.location.origin}${a.linkFirma}`;
    notify((await copia(link)) ? `Link copiato: ${link}` : link);
  };
  const reinviaConferma = async () => {
    if (!confirm(`Rimandare contratto e mandato in PDF a ${a.email}?`)) return;
    const j = await chiama(`/api/abbonamenti/${a.id}/invia-conferma`, "POST");
    if (j) notify(j.cliente?.inviata ? `Inviato a ${j.cliente.a}` : `Non inviato: ${j.cliente?.errore ?? "posta non configurata"}`, j.cliente?.inviata ? "ok" : "err");
  };
  const elimina = async () => {
    if (!confirm(`Eliminare l'abbonamento ${a.codice}? Addebiti e fatture già nati restano.`)) return;
    await fetch(`/api/abbonamenti/${a.id}`, { method: "DELETE" });
    router.push("/sales/abbonamenti");
  };

  const anni = Array.from(new Set([new Date().getFullYear(), ...a.addebiti.map((x) => x.anno)])).sort((x, y) => y - x);
  const perMese = (m: number) => a.addebiti.find((x) => x.anno === anno && x.mese === m) ?? null;
  const linguaLabel = LINGUE.find((l) => l.value === a.lingua)?.label ?? a.lingua;

  return (
    <div className="space-y-5">
      {msg && (
        <div className={cn("text-sm rounded-lg px-3 py-2 border flex items-center justify-between gap-3 break-all", msg.kind === "ok" ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad")}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Chiudi">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div>
        <h1 className="page-title">
          {a.intestatario} <em className="italic font-semibold text-gray-400 text-[20px]">{a.codice}</em>
        </h1>
        <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-[13px] text-gray-500">
          <span className={STATO_ABB_PILL[a.stato] ?? "pill-off"}>{statoAbbonamentoLabel(a.stato)}</span>
          <span className="tag tag-neutral">{nomeProdotto(a.prodotto)}</span>
          <span className="tag tag-neutral">{a.pianoNome}</span>
          <span>{fmt(a.totale)} al mese</span>
          {a.devoluciones > 0 && <span className="text-bad">{a.devoluciones} devuelto{a.devoluciones > 1 ? "s" : ""}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={indietro} className="btn btn-secondary">
          <ArrowLeft /> Indietro
        </button>
        <button onClick={() => setEdit(true)} className="btn btn-secondary">
          <Pencil /> Modifica
        </button>
        {a.stato === "in_attesa" && (
          <>
            <button onClick={inviaLink} disabled={busy} className="btn btn-primary disabled:opacity-60">
              <Mail /> Manda il link di firma
            </button>
            {a.linkFirma && (
              <button onClick={copiaLink} className="btn btn-secondary">
                <Copy /> Copia il link
              </button>
            )}
          </>
        )}
        {a.mandatoFirmatoIl && (
          <>
            <a href={`/api/abbonamenti/${a.id}/mandato`} target="_blank" rel="noreferrer" className="btn btn-secondary">
              <FileText /> PDF contratto e mandato
            </a>
            <button onClick={reinviaConferma} disabled={busy} className="btn btn-secondary disabled:opacity-60">
              <Mail /> Rimanda al cliente
            </button>
          </>
        )}
        {a.stato === "attivo" && (
          <button onClick={() => stato("sospeso")} disabled={busy} className="btn btn-secondary">
            <Pause /> Sospendi
          </button>
        )}
        {(a.stato === "sospeso" || a.stato === "cancellato") && a.mandatoFirmatoIl && (
          <button onClick={() => stato("attivo")} disabled={busy} className="btn btn-secondary">
            <Play /> Riattiva
          </button>
        )}
        {(a.stato === "attivo" || a.stato === "sospeso") && (
          <button onClick={() => stato("cancellato")} disabled={busy} className="btn btn-secondary">
            <Ban /> Cancella (fine mese)
          </button>
        )}
        <button onClick={elimina} className="btn btn-secondary text-bad hover:text-bad">
          <Trash2 /> Elimina
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Abbonamento</h2>
            <div className="kv">
              <div className="k">Prodotto</div>
              <div className="v">{nomeProdotto(a.prodotto)}</div>
              <div className="k">Piano</div>
              <div className="v">{a.pianoNome}</div>
              <div className="k">Prezzo</div>
              <div className="v">
                {fmt(a.prezzo)} + {tipoIvaLabel(a.tipoIva)} = <strong>{fmt(a.totale)}</strong> al mese
              </div>
              <div className="k">Primo addebito</div>
              <div className="v">{meseBreve(a.dataInizio)}</div>
              {a.dataFine && (
                <>
                  <div className="k">Fine</div>
                  <div className="v">{meseBreve(a.dataFine)}</div>
                </>
              )}
              <div className="k">Lingua</div>
              <div className="v">{linguaLabel}</div>
              <div className="k">Origine</div>
              <div className="v">{a.origine === "modulo" ? "modulo pubblico" : "creato da Sales"}</div>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="card-title !mb-0">Addebiti</h2>
              <select value={anno} onChange={(e) => setAnno(parseInt(e.target.value))} className="sel sel-sm">
                {anni.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
              {MESI_L.it.map((m, i) => {
                const ad = perMese(i + 1);
                const cls = ad ? (STATO_ADDEBITO_PILL[ad.stato] ?? "pill-off") : "";
                return (
                  <div
                    key={m}
                    className={cn("flex flex-col items-center gap-1 px-1 py-2 rounded-lg border text-center", !ad && "border-gray-100 bg-white")}
                    title={ad ? `${m} ${anno}: ${statoAddebitoLabel(ad.stato)} · ${fmt(ad.importo)}` : `${m} ${anno}: nessun addebito`}
                  >
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">{m.slice(0, 3)}</span>
                    {ad ? <span className={cn(cls, "!text-[10px] !px-1.5")}>{statoAddebitoLabel(ad.stato)}</span> : <span className="text-xs text-gray-300">—</span>}
                  </div>
                );
              })}
            </div>
            {a.addebiti.length > 0 && (
              <table className="tbl mt-4">
                <thead>
                  <tr>
                    <th>Mese</th>
                    <th className="text-right">Importo</th>
                    <th>Stato</th>
                    <th>Remessa</th>
                    <th>Fattura</th>
                  </tr>
                </thead>
                <tbody>
                  {a.addebiti.map((x) => (
                    <tr key={x.id}>
                      <td className="whitespace-nowrap">
                        {MESI_L.it[x.mese - 1]} {x.anno}
                      </td>
                      <td className="text-right whitespace-nowrap">{fmt(x.importo)}</td>
                      <td>
                        <span className={STATO_ADDEBITO_PILL[x.stato] ?? "pill-off"}>{statoAddebitoLabel(x.stato)}</span>
                        {x.stato === "devuelto" && x.motivoDevoluzione && <div className="tbl-muted">{x.motivoDevoluzione}</div>}
                      </td>
                      <td className="whitespace-nowrap">
                        {x.remessa ? (
                          <Link href="/finance/addebiti" className="text-brand hover:underline">
                            {x.remessa.codice}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        {x.remessa && <div className="tbl-muted">addebito {dataIt(x.remessa.dataAddebito)}</div>}
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

          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Contratto accettato</h2>
            {a.contrattoTesto ? (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  {a.mandatoFirmatoIl ? `Accettato il ${dataIt(a.mandatoFirmatoIl)}` : "Anteprima: il testo definitivo si fissa alla firma"} · versione {a.contrattoVersione ?? "—"}
                </p>
                <button onClick={() => setMostraContratto((v) => !v)} className="btn btn-secondary btn-sm">
                  {mostraContratto ? "Nascondi" : "Mostra il testo"}
                </button>
                {mostraContratto && <pre className="mt-3 text-[12px] text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{a.contrattoTesto}</pre>}
              </>
            ) : (
              <p className="text-xs text-gray-400">Nessun testo.</p>
            )}
          </section>

          {a.note && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="card-title">Note</h2>
              <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{a.note}</p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Intestatario</h2>
            <div className="kv" style={{ gridTemplateColumns: "90px minmax(0,1fr)" }}>
              <div className="k">Nome</div>
              <div className="v">{a.intestatario}</div>
              <div className="k">NIF</div>
              <div className="v">{a.nif || "—"}</div>
              <div className="k">Email</div>
              <div className="v break-all">{a.email}</div>
              <div className="k">Telefono</div>
              <div className="v">{a.telefono || "—"}</div>
              <div className="k">Indirizzo</div>
              <div className="v">{[a.via, [a.cap, a.citta].filter(Boolean).join(" "), a.provincia, a.paese].filter(Boolean).join(", ") || "—"}</div>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Conto e mandato SEPA</h2>
            <div className="kv" style={{ gridTemplateColumns: "90px minmax(0,1fr)" }}>
              <div className="k">Titolare</div>
              <div className="v">{a.titolareConto || "—"}</div>
              <div className="k">IBAN</div>
              <div className="v font-mono text-[12px] flex items-center gap-2">
                {a.iban ? formattaIban(a.iban) : "—"}
                {a.iban && (
                  <button className="text-gray-400 hover:text-brand" title="Copia IBAN" onClick={async () => notify((await copia(a.iban)) ? "IBAN copiato" : a.iban)}>
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="k">BIC</div>
              <div className="v font-mono text-[12px]">{a.bic || "—"}</div>
              <div className="k">Mandato</div>
              <div className="v font-mono text-[12px]">{a.mandatoRef}</div>
              <div className="k">Firmato</div>
              <div className="v">
                {a.mandatoFirmatoIl ? (
                  <>
                    {new Date(a.mandatoFirmatoIl).toLocaleString("it-IT", { timeZone: "Europe/Madrid" })}
                    <span className="block text-[11px] text-gray-500">
                      {a.mandatoLuogo || "—"}
                      {a.mandatoIp ? ` · IP ${a.mandatoIp}` : ""}
                      {a.mandatoUserAgent === "firma su carta" ? " · su carta" : ""}
                    </span>
                  </>
                ) : (
                  <span className="pill-wait">da firmare</span>
                )}
              </div>
            </div>
            {a.linkFirma && (
              <p className="mt-3 text-[11px] text-gray-500 break-all">
                Link di firma: <code>{a.linkFirma}</code>
                {a.tokenScadenza && <span> · scade il {dataIt(a.tokenScadenza)}</span>}
              </p>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Cliente CRM</h2>
            {a.cliente ? (
              <Link href={`/crm/clienti/${a.cliente.id}`} className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10">
                <User className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  {a.cliente.nome}
                  <span className="block text-[11px] text-gray-500">{a.cliente.paese}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : (
              <p className="text-xs text-gray-400">Nessun cliente collegato: si aggancia dalla firma o con «Modifica».</p>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Date</h2>
            <div className="kv" style={{ gridTemplateColumns: "90px minmax(0,1fr)" }}>
              <div className="k">Creato</div>
              <div className="v">{dataIt(a.createdAt)}</div>
              {a.sospesoIl && (
                <>
                  <div className="k">Sospeso</div>
                  <div className="v">{dataIt(a.sospesoIl)}</div>
                </>
              )}
              {a.cancellatoIl && (
                <>
                  <div className="k">Cancellato</div>
                  <div className="v">{dataIt(a.cancellatoIl)}</div>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      {edit && (
        <AbbonamentoFormModal
          abbonamento={a}
          onClose={() => setEdit(false)}
          onSaved={(testo) => {
            setEdit(false);
            notify(testo);
            load();
          }}
          onDeleted={() => router.push("/sales/abbonamenti")}
        />
      )}
    </div>
  );
}

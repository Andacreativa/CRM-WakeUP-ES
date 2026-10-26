"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Download, FileDown, RotateCcw, Sparkles, Trash2, Undo2, Upload, X } from "lucide-react";
import { Kpi, KpiGrid } from "@/components/Kpi";
import Pills from "@/components/Pills";
import RowMenu from "@/components/RowMenu";
import { useAnno } from "@/lib/anno-context";
import { ANNI, MESI, fmt } from "@/lib/constants";
import { dataIt } from "@/lib/fatture";
import { exportExcel } from "@/lib/export";
import { cn } from "@/lib/utils";
import { mascheraIban } from "@/lib/sepa";
import {
  type AddebitoRiga,
  type Remessa,
  STATO_ADDEBITO_PILL,
  STATO_REMESSA_PILL,
  inputCls,
  labelCls,
  nomeProdotto,
  statoAddebitoLabel,
  statoRemessaLabel,
} from "@/components/abbonamenti/tipi";

// Finance › Addebiti SEPA: gli addebiti del mese degli abbonamenti, il
// fichero XML (pain.008) da caricare in BBVA e lo storico delle remesse.
// Gli addebiti «previsti» nascono il giorno 1 (cron) o con «Genera».

interface Dati {
  anno: number;
  mese: number;
  addebiti: AddebitoRiga[];
  totali: { tutti: number; previsti: number; inRemessa: number; incassati: number; devueltos: number };
  daGenerare: number;
  dataAddebitoProposta: string;
  giornoAddebito: number;
  fatturaAutomatica: boolean;
  emailFattura: boolean;
}

type Vista = "" | "previsto" | "in_remessa" | "incassato" | "devuelto";
const VISTE: { val: Vista; label: string }[] = [
  { val: "", label: "Tutti" },
  { val: "previsto", label: "Previsti" },
  { val: "in_remessa", label: "In remessa" },
  { val: "incassato", label: "Incassati" },
  { val: "devuelto", label: "Devueltos" },
];

export default function AddebitiView() {
  const { anno: annoGlobale } = useAnno();
  const oggi = new Date();
  const [anno, setAnno] = useState(annoGlobale || oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [dati, setDati] = useState<Dati | null>(null);
  const [remesse, setRemesse] = useState<Remessa[]>([]);
  const [vista, setVista] = useState<Vista>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [modale, setModale] = useState(false);
  const [dataAddebito, setDataAddebito] = useState("");
  const [aperta, setAperta] = useState<Remessa | null>(null);

  useEffect(() => {
    if (annoGlobale) setAnno(annoGlobale);
  }, [annoGlobale]);

  const notify = (text: string, kind: "ok" | "err" = "ok") => {
    setMsg({ text, kind });
    setTimeout(() => setMsg(null), 9000);
  };

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        fetch(`/api/addebiti-sepa?anno=${anno}&mese=${mese}`).then((x) => x.json()),
        fetch(`/api/remesse-sepa?anno=${anno}`).then((x) => x.json()),
      ]);
      setDati(d);
      setRemesse(Array.isArray(r) ? r : []);
      setDataAddebito((d.dataAddebitoProposta ?? "").slice(0, 10));
    } catch (e) {
      console.error("load addebiti", e);
    }
  }, [anno, mese]);
  useEffect(() => {
    load();
  }, [load]);

  const righe = useMemo(
    () => (dati?.addebiti ?? []).filter((a) => !vista || a.stato === vista),
    [dati, vista],
  );
  const previsti = (dati?.addebiti ?? []).filter((a) => a.stato === "previsto");
  const n = (s: string) => (dati?.addebiti ?? []).filter((a) => a.stato === s).length;

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

  const genera = async () => {
    const j = await chiama("/api/addebiti-sepa", "POST", { anno, mese });
    if (j) {
      notify(j.creati ? `${j.creati} addebiti creati per ${MESI[mese - 1].toLowerCase()} ${anno}` : `Niente da fare: i ${j.attivi} abbonamenti attivi hanno già l'addebito del mese`);
      load();
    }
  };
  const creaRemessa = async () => {
    const j = await chiama("/api/addebiti-sepa/remessa", "POST", { anno, mese, dataAddebito: dataAddebito || null });
    if (!j) return;
    setModale(false);
    const parti = [`Remessa ${j.remessa.codice}: ${j.remessa.numero} addebiti, ${fmt(j.remessa.totale)}, addebito il ${dataIt(j.remessa.dataAddebito)}.`];
    if (j.fattureIds?.length) parti.push(`${j.fattureIds.length} fatture emesse.`);
    if (j.verifactuInCoda) parti.push(`${j.verifactuInCoda} registri VeriFactu in coda: mandali all'AEAT da Fatture.`);
    if (j.email) parti.push(`Email inviate: ${j.email.inviate}${j.email.nonInviate?.length ? `, non inviate: ${j.email.nonInviate.length}` : ""}.`);
    if (j.saltati?.length) parti.push(`Saltati ${j.saltati.length} (${j.saltati.map((s: { motivo: string }) => s.motivo).join(", ")}).`);
    notify(parti.join(" "));
    window.location.href = `/api/remesse-sepa/${j.remessa.id}/xml`;
    load();
  };
  const segnaAddebito = async (a: AddebitoRiga, stato: "previsto" | "incassato" | "devuelto" | "annullato") => {
    let motivo: string | null = null;
    if (stato === "devuelto") {
      motivo = prompt(`Motivo della devolución di ${a.abbonamento.intestatario} (facoltativo):`, "") ?? null;
      if (motivo === null) return;
    } else if (stato === "annullato" && !confirm(`Annullare l'addebito di ${a.abbonamento.intestatario} per ${MESI[a.mese - 1].toLowerCase()}?`)) return;
    const j = await chiama(`/api/addebiti-sepa/${a.id}`, "PATCH", { stato, motivo });
    if (j) {
      notify(`${a.abbonamento.intestatario}: ${statoAddebitoLabel(stato).toLowerCase()}`);
      load();
    }
  };
  const segnaRemessa = async (r: Remessa, stato: "generata" | "inviata" | "incassata") => {
    const testo =
      stato === "incassata"
        ? `Segnare incassata la remessa ${r.codice}? Tutti i suoi addebiti ancora in remessa diventano incassati e le fatture pagate.`
        : stato === "inviata"
          ? `Segnare la remessa ${r.codice} come caricata in banca?`
          : `Riportare la remessa ${r.codice} a «generata»?`;
    if (!confirm(testo)) return;
    const j = await chiama(`/api/remesse-sepa/${r.id}`, "PATCH", { stato });
    if (j) {
      notify(`Remessa ${r.codice}: ${statoRemessaLabel(stato).toLowerCase()}`);
      load();
      if (aperta?.id === r.id) setAperta(j);
    }
  };
  const annullaRemessa = async (r: Remessa) => {
    if (!confirm(`Annullare la remessa ${r.codice}? Gli addebiti tornano previsti; le fatture bozza spariscono, quelle emesse restano da annullare a mano.`)) return;
    const j = await chiama(`/api/remesse-sepa/${r.id}`, "DELETE");
    if (j) {
      notify(j.emesse ? `Remessa annullata. Attenzione: ${j.emesse} fatture emesse restano nel registro, annullale da Fatture.` : "Remessa annullata", j.emesse ? "err" : "ok");
      if (aperta?.id === r.id) setAperta(null);
      load();
    }
  };
  const apriRemessa = async (r: Remessa) => {
    if (aperta?.id === r.id) return setAperta(null);
    const j = await fetch(`/api/remesse-sepa/${r.id}`).then((x) => x.json());
    setAperta(j);
  };

  const excel = () =>
    exportExcel(
      righe.map((a) => ({
        Intestatario: a.abbonamento.intestatario,
        "Titolare conto": a.abbonamento.titolareConto,
        IBAN: a.abbonamento.iban,
        Mandato: a.abbonamento.mandatoRef,
        Prodotto: nomeProdotto(a.abbonamento.prodotto),
        Piano: a.abbonamento.pianoNome,
        Mese: `${MESI[a.mese - 1]} ${a.anno}`,
        Importo: a.importo,
        Concepto: a.descrizione,
        Stato: statoAddebitoLabel(a.stato),
        Remessa: a.remessa?.codice ?? "",
        Fattura: a.fattura?.numero ?? "",
      })),
      `addebiti-sepa-${anno}-${String(mese).padStart(2, "0")}`,
    );

  return (
    <div className="space-y-6">
      {msg && (
        <div className={cn("text-sm rounded-lg px-3 py-2 border", msg.kind === "ok" ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad")}>
          {msg.text}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Addebiti SEPA</h1>
          <p className="page-sub">Le quote mensili degli abbonamenti: si genera il fichero e si carica in BBVA (Adeudos SEPA Core, pain.008)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={excel} disabled={!righe.length} className="btn btn-secondary disabled:opacity-60">
            <FileDown className="w-4 h-4" /> Excel
          </button>
          <button onClick={genera} disabled={busy} className="btn btn-secondary disabled:opacity-60" title="Crea gli addebiti del mese per gli abbonamenti attivi che non ce l'hanno (lo fa anche da solo il giorno 1)">
            <Sparkles className="w-4 h-4" /> Genera addebiti
            {!!dati?.daGenerare && <span className="ml-1 rounded-full bg-warn/15 text-warn text-[11px] font-bold px-1.5">{dati.daGenerare}</span>}
          </button>
          <button onClick={() => setModale(true)} disabled={busy || !previsti.length} className="btn btn-primary disabled:opacity-60" title={previsti.length ? "Crea la remessa con gli addebiti previsti e scarica il fichero" : "Nessun addebito previsto"}>
            <Download className="w-4 h-4" /> Fichero BBVA
            {previsti.length > 0 && <span className="ml-1 rounded-full bg-white/25 text-white text-[11px] font-bold px-1.5">{previsti.length}</span>}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={mese} onChange={(e) => setMese(parseInt(e.target.value))} className="sel">
          {MESI.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select value={anno} onChange={(e) => setAnno(parseInt(e.target.value))} className="sel">
          {Array.from(new Set([...ANNI, anno, oggi.getFullYear() + 1])).sort((a, b) => b - a).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <Pills value={vista} onChange={setVista} options={VISTE} />
      </div>

      <KpiGrid cols={4}>
        <Kpi label="Previsti" value={fmt(dati?.totali.previsti ?? 0)} sub={`${n("previsto")} da mandare in banca`} color="#f59e0b" />
        <Kpi label="In remessa" value={fmt(dati?.totali.inRemessa ?? 0)} sub={`${n("in_remessa")} caricati, in attesa`} color="#3b82f6" />
        <Kpi label="Incassati" value={fmt(dati?.totali.incassati ?? 0)} sub={`${n("incassato")} addebiti`} color="#22c55e" />
        <Kpi label="Devueltos" value={fmt(dati?.totali.devueltos ?? 0)} sub={`${n("devuelto")} respinti`} color="#ef4444" />
      </KpiGrid>

      {!!dati?.daGenerare && (
        <div className="text-sm rounded-lg px-3 py-2 border bg-warn/10 border-warn/30 text-warn">
          {dati.daGenerare} abbonament{dati.daGenerare === 1 ? "o attivo non ha" : "i attivi non hanno"} ancora l&apos;addebito di {MESI[mese - 1].toLowerCase()}: «Genera addebiti».
        </div>
      )}

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl min-w-[980px]">
            <thead>
              <tr>
                <th>Intestatario</th>
                <th>Prodotto · piano</th>
                <th>Conto</th>
                <th>Mandato</th>
                <th className="text-right">Importo</th>
                <th>Stato</th>
                <th>Remessa</th>
                <th>Fattura</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {!dati && (
                <tr>
                  <td colSpan={9} className="text-center text-gray-400">
                    Caricamento…
                  </td>
                </tr>
              )}
              {dati && righe.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-gray-400 py-10">
                    Nessun addebito per {MESI[mese - 1].toLowerCase()} {anno}
                    {dati.daGenerare ? ": premi «Genera addebiti»" : ""}
                  </td>
                </tr>
              )}
              {righe.map((a) => (
                <tr key={a.id} className={cn(a.stato === "annullato" && "text-gray-400")}>
                  <td className="max-w-[240px]">
                    <Link href={`/sales/abbonamenti/${a.abbonamento.id}`} className="tbl-primary text-brand hover:underline block truncate">
                      {a.abbonamento.titolareConto || a.abbonamento.intestatario}
                    </Link>
                    <div className="tbl-muted truncate">{a.abbonamento.codice} · {a.descrizione}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="tbl-primary">{nomeProdotto(a.abbonamento.prodotto)}</div>
                    <div className="tbl-muted">{a.abbonamento.pianoNome}</div>
                  </td>
                  <td className="font-mono text-[12px] whitespace-nowrap">{mascheraIban(a.abbonamento.iban)}</td>
                  <td className="whitespace-nowrap">
                    <div className="font-mono text-[12px]">{a.abbonamento.mandatoRef}</div>
                    <div className="tbl-muted">{a.abbonamento.mandatoFirmatoIl ? dataIt(a.abbonamento.mandatoFirmatoIl) : "non firmato"} · {a.seq}</div>
                  </td>
                  <td className="text-right whitespace-nowrap tbl-primary">{fmt(a.importo)}</td>
                  <td>
                    <span className={STATO_ADDEBITO_PILL[a.stato] ?? "pill-off"}>{statoAddebitoLabel(a.stato)}</span>
                    {a.stato === "devuelto" && a.motivoDevoluzione && <div className="tbl-muted">{a.motivoDevoluzione}</div>}
                    {a.stato === "incassato" && a.dataIncasso && <div className="tbl-muted">{dataIt(a.dataIncasso)}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {a.remessa ? (
                      <>
                        <a href={`/api/remesse-sepa/${a.remessa.id}/xml`} className="text-brand hover:underline">
                          {a.remessa.codice}
                        </a>
                        <div className="tbl-muted">addebito {dataIt(a.remessa.dataAddebito)}</div>
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {a.fatturaId ? (
                      <Link href={`/finance/fatture/${a.fatturaId}`} className="text-brand hover:underline">
                        {a.fattura?.numero ?? "bozza"}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                    {a.fattura && <div className="tbl-muted">{a.fattura.pagato ? "pagata" : a.fattura.stato === "bozza" ? "bozza" : "da incassare"}</div>}
                  </td>
                  <td>
                    <RowMenu>
                      {(chiudi) => (
                        <>
                          {a.stato === "in_remessa" && (
                            <>
                              <button className="menu-item" onClick={() => { chiudi(); segnaAddebito(a, "incassato"); }}>
                                <Check /> Segna incassato
                              </button>
                              <button className="menu-item" onClick={() => { chiudi(); segnaAddebito(a, "devuelto"); }}>
                                <Undo2 /> Devuelto (respinto)
                              </button>
                            </>
                          )}
                          {(a.stato === "incassato" || a.stato === "devuelto") && (
                            <button className="menu-item" onClick={() => { chiudi(); segnaAddebito(a, a.stato === "incassato" ? "devuelto" : "incassato"); }}>
                              {a.stato === "incassato" ? <Undo2 /> : <Check />} {a.stato === "incassato" ? "Devuelto (respinto)" : "Segna incassato"}
                            </button>
                          )}
                          {a.stato === "annullato" && (
                            <button className="menu-item" onClick={() => { chiudi(); segnaAddebito(a, "previsto"); }}>
                              <RotateCcw /> Rimetti tra i previsti
                            </button>
                          )}
                          {a.stato === "previsto" && (
                            <button className="menu-item text-bad" onClick={() => { chiudi(); segnaAddebito(a, "annullato"); }}>
                              <X /> Annulla questo mese
                            </button>
                          )}
                        </>
                      )}
                    </RowMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remesse */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Remesse {anno}</h2>
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Remessa</th>
                  <th>Creata</th>
                  <th>Data addebito</th>
                  <th className="text-right">Addebiti</th>
                  <th className="text-right">Totale</th>
                  <th>Stato</th>
                  <th>Fichero</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {remesse.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-8">
                      Nessuna remessa nel {anno}
                    </td>
                  </tr>
                )}
                {remesse.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button className="tbl-primary text-brand hover:underline" onClick={() => apriRemessa(r)}>
                        {r.codice}
                      </button>
                      <div className="tbl-muted">{r.versione}</div>
                    </td>
                    <td className="whitespace-nowrap">{dataIt(r.createdAt)}</td>
                    <td className="whitespace-nowrap">{dataIt(r.dataAddebito)}</td>
                    <td className="text-right">{r.numero}</td>
                    <td className="text-right whitespace-nowrap tbl-primary">{fmt(r.totale)}</td>
                    <td>
                      <span className={STATO_REMESSA_PILL[r.stato] ?? "pill-off"}>{statoRemessaLabel(r.stato)}</span>
                      {r.inviataIl && <div className="tbl-muted">caricata {dataIt(r.inviataIl)}</div>}
                    </td>
                    <td>
                      <a href={`/api/remesse-sepa/${r.id}/xml`} className="pill-info" title={r.nomeFile}>
                        <Download /> XML
                      </a>
                    </td>
                    <td>
                      <RowMenu>
                        {(chiudi) => (
                          <>
                            {r.stato === "generata" && (
                              <button className="menu-item" onClick={() => { chiudi(); segnaRemessa(r, "inviata"); }}>
                                <Upload /> Caricata in banca
                              </button>
                            )}
                            {r.stato !== "incassata" && (
                              <button className="menu-item" onClick={() => { chiudi(); segnaRemessa(r, "incassata"); }}>
                                <Check /> Incassata (tutti gli addebiti)
                              </button>
                            )}
                            {r.stato === "inviata" && (
                              <button className="menu-item" onClick={() => { chiudi(); segnaRemessa(r, "generata"); }}>
                                <RotateCcw /> Di nuovo «generata»
                              </button>
                            )}
                            {r.stato === "generata" && (
                              <>
                                <div className="menu-sep" />
                                <button className="menu-item text-bad" onClick={() => { chiudi(); annullaRemessa(r); }}>
                                  <Trash2 /> Annulla remessa
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {aperta && (
            <div className="border-t border-gray-100 p-4 bg-gray-50/60">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-gray-900">
                  {aperta.codice} · {aperta.numero} addebiti · {fmt(aperta.totale)} · addebito il {dataIt(aperta.dataAddebito)}
                </div>
                <button onClick={() => setAperta(null)} className="text-gray-400 hover:text-gray-700" aria-label="Chiudi">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Intestatario</th>
                    <th>Mandato</th>
                    <th className="text-right">Importo</th>
                    <th>Stato</th>
                    <th>Fattura</th>
                  </tr>
                </thead>
                <tbody>
                  {(aperta.addebiti ?? []).map((a) => (
                    <tr key={a.id}>
                      <td>{a.abbonamento.titolareConto || a.abbonamento.intestatario}</td>
                      <td className="font-mono text-[12px]">{a.abbonamento.mandatoRef}</td>
                      <td className="text-right">{fmt(a.importo)}</td>
                      <td>
                        <span className={STATO_ADDEBITO_PILL[a.stato] ?? "pill-off"}>{statoAddebitoLabel(a.stato)}</span>
                      </td>
                      <td>
                        {a.fatturaId ? (
                          <Link href={`/finance/fatture/${a.fatturaId}`} className="text-brand hover:underline">
                            {a.fattura?.numero ?? "bozza"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {modale && dati && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Fichero BBVA · {MESI[mese - 1]} {anno}</h2>
              <button onClick={() => setModale(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Entrano i <strong>{previsti.length}</strong> addebiti previsti, in tutto <strong>{fmt(previsti.reduce((s, a) => s + a.importo, 0))}</strong>. Il fichero si scarica subito e resta nello storico.
            </p>
            <div>
              <label className={labelCls}>Data di addebito in conto</label>
              <input type="date" value={dataAddebito} onChange={(e) => setDataAddebito(e.target.value)} className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">Giorno {dati.giornoAddebito} del mese dalle impostazioni, spostato al lunedì se cade nel weekend. Caricalo in banca almeno 2 giorni lavorativi prima.</p>
            </div>
            <ul className="text-[12px] text-gray-600 space-y-1">
              <li>• {dati.fatturaAutomatica ? "Nasce una fattura per ogni addebito, con scadenza il giorno dell'addebito." : "Nessuna fattura automatica (Configurazione › Abbonamenti)."}</li>
              <li>• {dati.fatturaAutomatica && dati.emailFattura ? "Ogni fattura parte per email al cliente con il PDF." : "Le fatture non si mandano per email da qui."}</li>
              <li>• Poi: carica il file in BBVA Net Cash (Adeudos SEPA) e segna la remessa «caricata in banca»; quando il conto si accredita, «incassata».</li>
            </ul>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button onClick={() => setModale(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
                Annulla
              </button>
              <button onClick={creaRemessa} disabled={busy} className="btn btn-primary disabled:opacity-60">
                <Download className="w-4 h-4" /> {busy ? "Creazione…" : "Crea remessa e scarica"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

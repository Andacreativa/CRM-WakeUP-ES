"use client";

import { useEffect, useState } from "react";
import { Copy, Plus, Save } from "lucide-react";
import type { ImpostazioniAbbonamenti, Creditore } from "@/lib/abbonamenti-impostazioni";
import { VERSIONI_PAIN, formattaIban } from "@/lib/sepa";
import { fmt } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { type Piano, PRODOTTI, TIPI_IVA_ABB, inputCls, labelCls, nomeProdotto } from "@/components/abbonamenti/tipi";

type Campo = keyof ImpostazioniAbbonamenti;

interface Risposta {
  cfg: ImpostazioniAbbonamenti;
  creditore: Creditore;
  identificadorCalcolato: string;
  identificadorValido: boolean;
  base: string;
}

// Configurazione › Abbonamenti: creditore SEPA, regole degli addebiti e
// delle fatture, piani in vendita, testi del contratto e delle email.
export default function ImpostazioniAbbonamentiPage() {
  const [r, setR] = useState<Risposta | null>(null);
  const [cfg, setCfg] = useState<ImpostazioniAbbonamenti | null>(null);
  const [piani, setPiani] = useState<Piano[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [linguaTesti, setLinguaTesti] = useState<"Es" | "It" | "En">("Es");

  const notify = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), ok ? 4000 : 8000);
  };

  useEffect(() => {
    fetch("/api/impostazioni/abbonamenti")
      .then((x) => x.json())
      .then((d: Risposta) => {
        setR(d);
        setCfg(d.cfg);
      })
      .catch(() => notify("Impossibile caricare le impostazioni", false));
    fetch("/api/abbonamenti/piani")
      .then((x) => x.json())
      .then((p) => setPiani(Array.isArray(p) ? p : []))
      .catch(() => {});
  }, []);

  const set = (k: Campo, v: string | number | boolean) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  const salva = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/impostazioni/abbonamenti", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) }),
        fetch("/api/abbonamenti/piani", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(piani) }),
      ]);
      const ja = await a.json();
      const jb = await b.json();
      if (!a.ok || !b.ok) {
        notify(ja.error ?? jb.error ?? "Salvataggio non riuscito", false);
        return;
      }
      setR(ja);
      setCfg(ja.cfg);
      setPiani(Array.isArray(jb) ? jb : piani);
      notify("Impostazioni salvate");
    } finally {
      setSaving(false);
    }
  };

  const setPiano = (i: number, patch: Partial<Piano>) => setPiani((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const aggiungiPiano = (prodotto: string) =>
    setPiani((p) => [
      ...p,
      { id: 0, prodotto, codice: "", nome: "", descrizione: "", descrizioneIt: "", descrizioneEn: "", prezzo: 0, prezzoLibero: false, tipoIva: "igic7", attivo: true, ordine: p.filter((x) => x.prodotto === prodotto).length + 1 },
    ]);

  const copia = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      notify(`Copiato: ${t}`);
    } catch {
      notify(t);
    }
  };

  if (!cfg || !r) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const base = typeof window !== "undefined" ? window.location.origin : r.base;
  // Funzioni, non componenti: un componente definito qui dentro verrebbe
  // ricreato a ogni render e il campo perderebbe il focus a ogni tasto
  const testo = (campo: Campo, righe = 3) => (
    <textarea value={String(cfg[campo] ?? "")} onChange={(e) => set(campo, e.target.value)} className={cn(inputCls, "font-mono text-[12px]")} rows={righe} />
  );
  const spunta = (campo: Campo, label: string, nota?: string) => (
    <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" checked={Boolean(cfg[campo])} onChange={(e) => set(campo, e.target.checked)} className="mt-1" />
      <span>
        {label}
        {nota && <span className="block text-[11px] text-gray-400">{nota}</span>}
      </span>
    </label>
  );

  return (
    <div className="space-y-6">
      {msg && <div className={cn("text-sm rounded-lg px-3 py-2 border", msg.ok ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad")}>{msg.text}</div>}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Abbonamenti</h1>
          <p className="page-sub">Creditore SEPA, addebiti e fatture automatiche, piani di Boogo e Cobrea, testi del contratto e delle email</p>
        </div>
        <button onClick={salva} disabled={saving} className="btn btn-primary disabled:opacity-60">
          <Save /> {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>

      <section className="glass-card rounded-2xl p-6 space-y-4">
        <h2 className="card-title">Modulo pubblico</h2>
        <p className="text-xs text-gray-500">Gli indirizzi da mettere nei siti. Base e Medium si sottoscrivono da soli; Pro si crea da Sales › Abbonamenti e il cliente firma dal link.</p>
        {PRODOTTI.map((p) => {
          const url = `${base}/suscripcion/${p.value}`;
          return (
            <div key={p.value} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold w-16">{p.label}</span>
              <code className="text-[12px] bg-gray-50 rounded px-2 py-1">{url}</code>
              <button className="btn btn-secondary btn-sm" onClick={() => copia(url)}>
                <Copy className="w-3.5 h-3.5" /> Copia
              </button>
              <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer">
                Apri
              </a>
              <span className="text-[11px] text-gray-400">anche con ?plan=base o ?plan=medium e ?lang=es|it|en</span>
            </div>
          );
        })}
      </section>

      <section className="glass-card rounded-2xl p-6 space-y-4">
        <h2 className="card-title">Creditore SEPA</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Identificador de acreedor</label>
            <input value={cfg.creditorId} onChange={(e) => set("creditorId", e.target.value.toUpperCase())} className={cn(inputCls, "font-mono")} placeholder={r.identificadorCalcolato} />
            <p className={cn("text-[11px] mt-1", r.identificadorValido ? "text-gray-400" : "text-bad")}>
              In uso: <code>{r.creditore.identificador}</code> {r.identificadorValido ? "(cifre di controllo corrette)" : "(cifre di controllo sbagliate)"}. Calcolato dal NIF {r.creditore.nif}: <code>{r.identificadorCalcolato}</code>. Confermalo con BBVA prima della prima remessa; il sufijo di norma è 000.
            </p>
          </div>
          <div>
            <label className={labelCls}>Nome del creditore</label>
            <input value={cfg.creditorNome} onChange={(e) => set("creditorNome", e.target.value)} className={inputCls} placeholder={r.creditore.nome} />
            <p className="text-[11px] text-gray-400 mt-1">Vuoto = ragione sociale delle fatture.</p>
          </div>
          <div>
            <label className={labelCls}>IBAN di accredito</label>
            <input value={cfg.creditorIban} onChange={(e) => set("creditorIban", e.target.value.toUpperCase())} className={cn(inputCls, "font-mono")} placeholder={formattaIban(r.creditore.iban)} />
            <p className="text-[11px] text-gray-400 mt-1">Vuoto = IBAN delle fatture ({formattaIban(r.creditore.iban)}).</p>
          </div>
          <div>
            <label className={labelCls}>BIC della banca</label>
            <input value={cfg.creditorBic} onChange={(e) => set("creditorBic", e.target.value.toUpperCase())} className={cn(inputCls, "font-mono")} placeholder="BBVAESMMXXX" />
          </div>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-6 space-y-4">
        <h2 className="card-title">Addebiti e fatture</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Giorno del mese dell&apos;addebito</label>
            <input type="number" min={1} max={28} value={cfg.giornoAddebito} onChange={(e) => set("giornoAddebito", parseInt(e.target.value) || 1)} className={inputCls} />
            <p className="text-[11px] text-gray-400 mt-1">Nel weekend scivola al lunedì. Gli addebiti nascono il giorno 1 (cron) e la remessa si genera da Finance.</p>
          </div>
          <div>
            <label className={labelCls}>Formato del fichero</label>
            <select value={cfg.versione} onChange={(e) => set("versione", e.target.value)} className={inputCls}>
              {VERSIONI_PAIN.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Concepto sull&apos;estratto del cliente</label>
            <input value={cfg.conceptoAddebito} onChange={(e) => set("conceptoAddebito", e.target.value)} className={cn(inputCls, "font-mono text-[12px]")} />
            <p className="text-[11px] text-gray-400 mt-1">Segnaposto: {"{azienda} {prodotto} {piano} {mese} {anno} {codice}"}</p>
          </div>
          <div>
            <label className={labelCls}>Email degli avvisi (nuove firme, remessa pronta)</label>
            <input value={cfg.notificaEmail} onChange={(e) => set("notificaEmail", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Luogo stampato sul mandato</label>
            <input value={cfg.luogoFirma} onChange={(e) => set("luogoFirma", e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {spunta("inizioMeseSuccessivo", "Il primo addebito è il mese dopo la firma", "Spento: si addebita già il mese della firma (se la remessa non è ancora partita).")}
          {spunta("batchBooking", "Una sola entrata in banca per remessa", "Spento: un movimento per ogni addebito sull'estratto conto.")}
          {spunta("fatturaAutomatica", "La remessa crea una fattura per ogni addebito", "Numerata subito con VeriFactu spento; bozza da emettere con VeriFactu acceso.")}
          {spunta("emailFattura", "…e la manda per email al cliente con il PDF")}
        </div>
      </section>

      <section className="glass-card rounded-2xl p-6 space-y-4">
        <h2 className="card-title">Piani in vendita</h2>
        <p className="text-xs text-gray-500">Prezzo mensile imponibile. «Prezzo concordato» = non si sottoscrive dal modulo (Pro «da 60 €»): si crea da Sales con il prezzo pattuito. La configurazione iniziale resta fuori: preventivo e fattura a mano.</p>
        {PRODOTTI.map((p) => (
          <div key={p.value} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">{nomeProdotto(p.value)}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => aggiungiPiano(p.value)}>
                <Plus className="w-3.5 h-3.5" /> Piano
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl min-w-[860px]">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Nome</th>
                    <th>Descrizione nel modulo (ES / IT / EN)</th>
                    <th className="text-right">€/mese</th>
                    <th>Imposta</th>
                    <th>Concordato</th>
                    <th>In vendita</th>
                  </tr>
                </thead>
                <tbody>
                  {piani.map((x, i) =>
                    x.prodotto !== p.value ? null : (
                      <tr key={x.id || `n${i}`}>
                        <td>
                          <input type="number" value={x.ordine} onChange={(e) => setPiano(i, { ordine: parseInt(e.target.value) || 0 })} className={cn(inputCls, "w-14 text-center")} />
                        </td>
                        <td>
                          <input value={x.nome} onChange={(e) => setPiano(i, { nome: e.target.value })} className={inputCls} placeholder="Base" />
                          {!x.id && <input value={x.codice} onChange={(e) => setPiano(i, { codice: e.target.value })} className={cn(inputCls, "mt-1 font-mono text-[11px]")} placeholder="codice (es. base)" />}
                        </td>
                        <td className="space-y-1">
                          <input value={x.descrizione ?? ""} onChange={(e) => setPiano(i, { descrizione: e.target.value })} className={inputCls} placeholder="ES" title="Spagnolo" />
                          <input value={x.descrizioneIt ?? ""} onChange={(e) => setPiano(i, { descrizioneIt: e.target.value })} className={inputCls} placeholder="IT" title="Italiano" />
                          <input value={x.descrizioneEn ?? ""} onChange={(e) => setPiano(i, { descrizioneEn: e.target.value })} className={inputCls} placeholder="EN" title="Inglese" />
                        </td>
                        <td>
                          <input value={x.prezzo} onChange={(e) => setPiano(i, { prezzo: parseFloat(e.target.value.replace(",", ".")) || 0 })} className={cn(inputCls, "w-24 text-right")} inputMode="decimal" />
                        </td>
                        <td>
                          <select value={x.tipoIva} onChange={(e) => setPiano(i, { tipoIva: e.target.value })} className={inputCls}>
                            {TIPI_IVA_ABB.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="text-center">
                          <input type="checkbox" checked={x.prezzoLibero} onChange={(e) => setPiano(i, { prezzoLibero: e.target.checked })} />
                        </td>
                        <td className="text-center">
                          <input type="checkbox" checked={x.attivo} onChange={(e) => setPiano(i, { attivo: e.target.checked })} />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400">
              {piani
                .filter((x) => x.prodotto === p.value && x.attivo)
                .map((x) => `${x.nome} ${x.prezzoLibero ? "da " : ""}${fmt(x.prezzo)}`)
                .join(" · ")}
            </p>
          </div>
        ))}
      </section>

      <section className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="card-title !mb-0">Testi</h2>
          <div className="pills">
            {(["Es", "It", "En"] as const).map((l) => (
              <button key={l} type="button" className={linguaTesti === l ? "active" : undefined} onClick={() => setLinguaTesti(l)}>
                {l === "Es" ? "Español" : l === "It" ? "Italiano" : "English"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Contratto di abbonamento</label>
          <p className="text-[11px] text-gray-400 mb-1">
            Segnaposto: {"{prodotto} {piano} {prezzo} {imposta} {totale} {giornoAddebito} {azienda} {nif} {indirizzo} {email} {intestatario} {nifCliente} {data}"}. Il testo del mandato SEPA è quello ufficiale e non si cambia.
          </p>
          {testo(`contratto${linguaTesti}` as Campo, 18)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Email di conferma dopo la firma: oggetto</label>
            {testo(`confermaOggetto${linguaTesti}` as Campo, 1)}
            <label className={cn(labelCls, "mt-2")}>Testo</label>
            {testo(`confermaTesto${linguaTesti}` as Campo, 8)}
            <p className="text-[11px] text-gray-400 mt-1">Segnaposto: {"{nombre} {producto} {plan} {importe} {ref} {codigo} {azienda}"}</p>
          </div>
          <div>
            <label className={labelCls}>Email con il link di firma: oggetto</label>
            {testo(`linkOggetto${linguaTesti}` as Campo, 1)}
            <label className={cn(labelCls, "mt-2")}>Testo</label>
            {testo(`linkTesto${linguaTesti}` as Campo, 8)}
            <p className="text-[11px] text-gray-400 mt-1">Segnaposto: {"{nombre} {producto} {plan} {importe} {link} {azienda}"}</p>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={salva} disabled={saving} className="btn btn-primary disabled:opacity-60">
          <Save /> {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>
    </div>
  );
}

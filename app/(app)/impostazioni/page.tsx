"use client";

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { ImpostazioniFatture } from "@/lib/impostazioni";
import { CAUSE_ZERO } from "@/lib/fatture";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

type Campo = keyof ImpostazioniFatture;

export default function ImpostazioniPage() {
  const [cfg, setCfg] = useState<ImpostazioniFatture | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [anteprima, setAnteprima] = useState<string>("");
  // Stato dell'invio all'AEAT: certificato presente, registri in coda
  const [vf, setVf] = useState<{ certificato: boolean; inCoda: number; errore: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/impostazioni/fatture")
      .then((r) => r.json())
      .then((d) => setCfg(d))
      .catch(() => setMsg({ text: "Impossibile caricare le impostazioni", ok: false }));
    fetch("/api/verifactu/coda")
      .then((r) => r.json())
      .then(setVf)
      .catch(() => {});
  }, []);

  const set = (k: Campo, v: string | number | boolean) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  // Anteprima del prossimo numero con i valori correnti (anche non salvati)
  const aggiornaAnteprima = useCallback(async () => {
    if (!cfg) return;
    const p = new URLSearchParams({
      anno: String(new Date().getFullYear()),
      prefisso: cfg.numeroPrefisso,
      formato: cfg.numeroFormato,
      partenza: String(cfg.numeroPartenza),
      reset: cfg.resetAnnuale ? "1" : "0",
    });
    try {
      const r = await fetch(`/api/impostazioni/fatture/prossimo-numero?${p}`);
      const j = await r.json();
      setAnteprima(j.numero ?? "");
    } catch {
      setAnteprima("");
    }
  }, [cfg]);
  useEffect(() => {
    const t = setTimeout(aggiornaAnteprima, 300);
    return () => clearTimeout(t);
  }, [aggiornaAnteprima]);

  const salva = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const r = await fetch("/api/impostazioni/fatture", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ text: j.error ?? "Salvataggio non riuscito", ok: false });
        return;
      }
      setCfg(j);
      setMsg({ text: "Impostazioni salvate", ok: true });
      setTimeout(() => setMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) {
    return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={cn(
            "text-sm rounded-lg px-3 py-2 border",
            msg.ok
              ? "bg-ok/10 border-ok/30 text-ok"
              : "bg-bad/10 border-bad/30 text-bad",
          )}
        >
          {msg.text}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Fatturazione</h1>
          <p className="page-sub">
            Dati emittente, numerazione, valori di default e testi dei solleciti
          </p>
        </div>
        <button
          onClick={salva}
          disabled={saving}
          className="btn btn-primary disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>

      <Sezione titolo="Dati emittente" sotto="Compaiono sui PDF e nel pannello dati aziendali">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Testo cfg={cfg} set={set} k="ragioneSociale" label="Ragione sociale" />
          <Testo cfg={cfg} set={set} k="nif" label="NIF / Partita IVA" />
          <div className="md:col-span-2">
            <Testo cfg={cfg} set={set} k="indirizzo" label="Indirizzo" />
          </div>
          <Testo cfg={cfg} set={set} k="cap" label="CAP" />
          <Testo cfg={cfg} set={set} k="citta" label="Città" />
          <Testo cfg={cfg} set={set} k="provincia" label="Provincia" />
          <Testo cfg={cfg} set={set} k="paese" label="Paese" />
          <Testo cfg={cfg} set={set} k="email" label="Email" />
          <Testo cfg={cfg} set={set} k="telefono" label="Telefono" />
        </div>
      </Sezione>

      <Sezione titolo="Banca" sotto="IBAN usato nei testi dei solleciti e nelle fatture">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Testo cfg={cfg} set={set} k="banca" label="Banca" />
          <Testo cfg={cfg} set={set} k="iban" label="IBAN" />
          <Testo cfg={cfg} set={set} k="bic" label="BIC / SWIFT" />
        </div>
      </Sezione>

      <Sezione titolo="Fiscalità e pagamento" sotto="Valori proposti quando crei una fattura o una richiesta">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Tipo imposta di default</label>
            <div className="flex gap-2">
              {[
                { value: "igic_exenta", label: "IGIC Exenta" },
                { value: "igic7", label: "IGIC 7%" },
              ].map((o) => {
                const active = cfg.tipoIvaDefault === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set("tipoIvaDefault", o.value)}
                    className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                    style={
                      active
                        ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" }
                        : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Testo cfg={cfg} set={set} k="testoEsenzione" label="Testo esenzione (sul PDF)" />
          <Testo cfg={cfg} set={set} k="metodoPagamentoDefault" label="Metodo di pagamento di default" />
          <div>
            <label className={labelCls}>Giorni di scadenza di default</label>
            <input
              type="number"
              min={0}
              value={cfg.giorniScadenza}
              onChange={(e) => set("giorniScadenza", parseInt(e.target.value) || 0)}
              className={inputCls}
            />
          </div>
        </div>
      </Sezione>

      <Sezione titolo="Numerazione" sotto="Il prossimo numero è il massimo già usato più uno, mai inferiore al numero di partenza">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Testo cfg={cfg} set={set} k="numeroPrefisso" label="Prefisso" placeholder="F" />
          <div className="md:col-span-2">
            <Testo cfg={cfg} set={set} k="numeroFormato" label="Formato" placeholder="{prefisso}{AAAA}{N}" />
            <p className="text-[11px] text-gray-400 mt-1">
              Token: {"{prefisso}"} {"{AAAA}"} {"{AA}"} {"{N}"} {"{NN}"} {"{NNN}"} {"{NNNN}"}
            </p>
          </div>
          <div>
            <label className={labelCls}>Numero di partenza</label>
            <input
              type="number"
              min={1}
              value={cfg.numeroPartenza}
              onChange={(e) => set("numeroPartenza", parseInt(e.target.value) || 1)}
              className={inputCls}
            />
          </div>
          <div>
            <Testo cfg={cfg} set={set} k="numeroPrefissoRettifica" label="Prefisso rettificative" placeholder="R" />
            <p className="text-[11px] text-gray-400 mt-1">Serie a parte, stesso formato</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer md:col-span-3">
            <input
              type="checkbox"
              checked={cfg.resetAnnuale}
              onChange={(e) => set("resetAnnuale", e.target.checked)}
            />
            Reset annuale della numerazione
          </label>
          <div className="md:col-span-2 text-sm text-gray-600">
            Prossimo numero:{" "}
            <span className="font-mono font-bold text-gray-900">{anteprima || "…"}</span>
          </div>
        </div>
      </Sezione>

      <Sezione
        titolo="VeriFactu"
        sotto="Emissione delle fatture da questa app con invio del registro all'Agencia Tributaria"
      >
        <div>
          <label className={labelCls}>Invio all&apos;AEAT</label>
          <div className="flex gap-2 max-w-xl">
            {[
              { value: "spento", label: "Spento" },
              { value: "prova", label: "Prova" },
              { value: "produzione", label: "Produzione" },
            ].map((o) => {
              const active = cfg.vfModo === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    if (
                      o.value === "produzione" &&
                      !active &&
                      !confirm(
                        "Produzione = le fatture emesse da qui partono davvero per l'Agencia Tributaria. Da accendere solo quando si lascia l'altro programma. Continuare?",
                      )
                    )
                      return;
                    set("vfModo", o.value);
                  }}
                  className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                  style={
                    active
                      ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" }
                      : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5 leading-snug max-w-2xl">
            {cfg.vfModo === "spento"
              ? "Le fatture si registrano a mano, con il numero dell'altro programma: da qui non parte niente."
              : cfg.vfModo === "prova"
                ? "Le fatture emesse da qui vanno all'ambiente di prova dell'AEAT: nessun valore fiscale, serve a provare tutto il giro."
                : "Le fatture emesse da qui sono trasmesse all'AEAT e valgono a tutti gli effetti."}
          </p>
          {vf && (
            <p className="text-[11px] mt-1.5">
              <span className={vf.certificato ? "text-ok" : "text-warn"}>
                Certificato dell&apos;azienda: {vf.certificato ? "configurato" : "non configurato"}
              </span>
              {vf.inCoda > 0 && <span className="text-warn"> · {vf.inCoda} registri in coda</span>}
              {vf.errore && vf.certificato && <span className="text-bad"> · {vf.errore}</span>}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Testo
              cfg={cfg}
              set={set}
              k="vfDescrizioneDefault"
              label="Descrizione dell'operazione proposta"
              placeholder="Servicios de Publicidad"
            />
          </div>
          {(
            [
              ["vfCausaSpagna", "Fattura a 0 % a un cliente spagnolo"],
              ["vfCausaEstero", "Fattura a 0 % a un cliente estero"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <label className={labelCls}>{label}</label>
              <select value={cfg[k]} onChange={(e) => set(k, e.target.value)} className={inputCls}>
                <option value="">— si sceglie ogni volta —</option>
                {CAUSE_ZERO.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 leading-snug max-w-2xl">
          A 0 % l&apos;AEAT vuole sapere se l&apos;operazione è esente (e per quale articolo) o non
          soggetta: è una scelta fiscale, da confermare con il commercialista.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Testo cfg={cfg} set={set} k="vfNombreSistema" label="Nome del programma" />
          <Testo cfg={cfg} set={set} k="vfIdSistema" label="Codice (2 car.)" />
          <Testo cfg={cfg} set={set} k="vfVersion" label="Versione" />
          <Testo cfg={cfg} set={set} k="vfNumeroInstalacion" label="Installazione" />
          <Testo cfg={cfg} set={set} k="vfClaveRegimen" label="Regime IGIC" placeholder="01" />
        </div>
        <p className="text-[11px] text-gray-400 leading-snug">
          Questi dati viaggiano in ogni registro e identificano il programma: vanno fissati prima della
          partenza e poi non si cambiano senza motivo.
        </p>
      </Sezione>

      <Sezione titolo="PDF" sotto="Aspetto dei documenti">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Testo cfg={cfg} set={set} k="logoUrl" label="Logo (percorso o URL)" />
          <div>
            <label className={labelCls}>Colore primario</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={cfg.colore}
                onChange={(e) => set("colore", e.target.value)}
                className="h-9 w-12 rounded border border-gray-200 bg-white"
              />
              <input value={cfg.colore} onChange={(e) => set("colore", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Lingua di default</label>
            <select
              value={cfg.linguaDefault}
              onChange={(e) => set("linguaDefault", e.target.value)}
              className={inputCls}
            >
              <option value="it">Italiano</option>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>Note di default (su ogni fattura)</label>
            <textarea
              value={cfg.noteDefault}
              onChange={(e) => set("noteDefault", e.target.value)}
              className={cn(inputCls, "min-h-[64px]")}
            />
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>Piè di pagina</label>
            <textarea
              value={cfg.piePagina}
              onChange={(e) => set("piePagina", e.target.value)}
              className={cn(inputCls, "min-h-[48px]")}
            />
          </div>
        </div>
      </Sezione>

      <Sezione
        titolo="Canale Social Media House"
        sotto="Fatture ai clienti di SMH: la ritenuta si toglie da ogni fattura, il netto concorre al compenso mensile e la differenza è la fattura diretta da emettere a SMH (vedi Rapporto SMH in Fatture › Esporta)"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Testo cfg={cfg} set={set} k="smhNome" label="Nome dell'intermediario" />
          <div>
            <label className={labelCls}>Compenso mensile netto (€)</label>
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={cfg.smhCompensoMensile}
              onChange={(e) => set("smhCompensoMensile", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className={labelCls}>Ritenuta SMH (%)</label>
            <input
              type="number"
              step="0.1"
              className={inputCls}
              value={cfg.smhRitenuta}
              onChange={(e) => set("smhRitenuta", parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
      </Sezione>

      <Sezione
        titolo="Solleciti"
        sotto="Testi usati dal bottone Sollecita nelle scadenze. Segnaposto: {cliente} {numero} {importo} {scadenza} {iban} {azienda}"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Italiano</p>
            <Testo cfg={cfg} set={set} k="sollecitoOggettoIt" label="Oggetto" />
            <div>
              <label className={labelCls}>Testo</label>
              <textarea
                value={cfg.sollecitoTestoIt}
                onChange={(e) => set("sollecitoTestoIt", e.target.value)}
                className={cn(inputCls, "min-h-[180px] font-mono text-xs")}
              />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Español</p>
            <Testo cfg={cfg} set={set} k="sollecitoOggettoEs" label="Asunto" />
            <div>
              <label className={labelCls}>Texto</label>
              <textarea
                value={cfg.sollecitoTestoEs}
                onChange={(e) => set("sollecitoTestoEs", e.target.value)}
                className={cn(inputCls, "min-h-[180px] font-mono text-xs")}
              />
            </div>
          </div>
        </div>
      </Sezione>

      <div className="flex justify-end">
        <button
          onClick={salva}
          disabled={saving}
          className="btn btn-primary disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> {saving ? "Salvataggio…" : "Salva impostazioni"}
        </button>
      </div>
    </div>
  );
}

function Testo({
  cfg,
  set,
  k,
  label,
  placeholder,
}: {
  cfg: ImpostazioniFatture;
  set: (k: Campo, v: string) => void;
  k: Campo;
  label: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        value={String(cfg[k] ?? "")}
        onChange={(e) => set(k, e.target.value)}
        className={inputCls}
        placeholder={placeholder}
      />
    </div>
  );
}

function Sezione({
  titolo,
  sotto,
  children,
}: {
  titolo: string;
  sotto?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">{titolo}</h2>
        {sotto && <p className="text-xs text-gray-500 mt-0.5">{sotto}</p>}
      </div>
      {children}
    </section>
  );
}

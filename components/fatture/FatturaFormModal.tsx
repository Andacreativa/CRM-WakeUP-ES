"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import {
  type Fattura,
  CAUSE_ZERO,
  TIPI_RETTIFICA,
  correggibileVf,
  gestitaVf,
  leggiVoci,
} from "@/lib/fatture";
import type { ImpostazioniFatture } from "@/lib/impostazioni";
import ClienteSelect from "@/components/crm/ClienteSelect";

// Form unico della fattura: Nuova, Modifica e Duplica (nuova precompilata
// con i dati di un'altra). Usato dalla lista e dal pannello della fattura.
// Una fattura nuova si salva come bozza oppure si emette: con VeriFactu
// acceso l'emissione assegna il numero e manda il registro all'AEAT.

type TipoIva = "igic_exenta" | "igic7";
const TIPO_IVA_OPTIONS: { value: TipoIva; label: string }[] = [
  { value: "igic_exenta", label: "IGIC 0 %" },
  { value: "igic7", label: "IGIC 7 %" },
];
const MESI_NUMS = Array.from({ length: 12 }, (_, i) => i + 1);

interface ClienteMin {
  id: number;
  nome: string;
  paese?: string;
}
interface Commerciale {
  id: number;
  nome: string;
  cognome: string | null;
  percentualeCommissione: number;
}
interface Riga {
  descrizione: string;
  quantita: string;
  prezzo: string;
}

const oggiISO = () => new Date().toISOString().slice(0, 10);
const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-gray-50 disabled:text-gray-500";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";
const num = (s: string) => parseFloat(String(s).replace(",", ".")) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Le fatture di prima hanno solo l'importo: diventano una riga sola
const righeDa = (f: Fattura | null | undefined): Riga[] => {
  const voci = f ? leggiVoci(f.voci) : [];
  if (voci.length)
    return voci.map((v) => ({
      descrizione: v.descrizione,
      quantita: String(v.quantita),
      prezzo: String(v.prezzo),
    }));
  return [{ descrizione: "", quantita: "1", prezzo: f ? String(f.importo) : "" }];
};

const formDa = (f: Fattura | null | undefined, anno: number) => ({
  numero: f?.numero || "",
  data: f?.data ? f.data.slice(0, 10) : f ? "" : oggiISO(),
  clienteId: f?.clienteId != null ? String(f.clienteId) : "",
  // storico del vecchio canale: le nuove sono sempre dirette, il paese è del cliente
  azienda: f?.azienda ?? "Spagna",
  aziendaNota: f?.aziendaNota || "",
  commerciale: f?.commerciale || "",
  commercialeId: f?.commercialeId ? String(f.commercialeId) : "",
  mese: f?.mese ?? new Date().getMonth() + 1,
  anno: f?.anno ?? anno,
  descrizione: f?.descrizione || "",
  tipoIva: (f?.tipoIva === "igic7" ? "igic7" : "igic_exenta") as TipoIva,
  causaIgic: f?.causaIgic || "",
  tipoFattura: f?.tipoFattura || "F1",
  pagato: f?.pagato ?? false,
  scadenza: f?.scadenza ? f.scadenza.slice(0, 10) : "",
});

export default function FatturaFormModal({
  fattura,
  duplicaDa,
  annoDefault,
  clienti: clientiProp,
  commerciali: commercialiProp,
  onClose,
  onSaved,
}: {
  fattura?: Fattura | null; // modifica
  duplicaDa?: Fattura | null; // nuova, con i dati di questa
  annoDefault: number;
  clienti?: ClienteMin[];
  commerciali?: Commerciale[];
  onClose: () => void;
  onSaved: (f: Fattura) => void;
}) {
  // Una nuova, salvata come bozza e poi non emessa per un errore, resta
  // aperta qui: i salvataggi successivi la aggiornano
  const [salvata, setSalvata] = useState<Fattura | null>(fattura ?? null);
  const editing = salvata;
  const bozza = !editing || editing.stato === "bozza";
  const gestita = !!editing && gestitaVf(editing);
  const correggibile = !!editing && correggibileVf(editing);
  // Trasmessa a VeriFactu: i dati del registro non si toccano (dopo un
  // rifiuto o un'accettazione con errori sì, tranne numero e data)
  const fiscaliBloccati = gestita && !correggibile;
  const rettifica = !!editing?.rettificaDiId;

  const annoNuova = annoDefault > 0 ? annoDefault : new Date().getFullYear();
  const [form, setForm] = useState(() =>
    fattura
      ? formDa(fattura, fattura.anno)
      : {
          ...formDa(duplicaDa, annoNuova),
          // Una copia è una fattura nuova: numero, date e incasso ripartono
          numero: "",
          data: oggiISO(),
          mese: new Date().getMonth() + 1,
          anno: annoNuova,
          scadenza: "",
          pagato: false,
          tipoFattura: "F1",
        },
  );
  const [righe, setRighe] = useState<Riga[]>(() => righeDa(fattura ?? duplicaDa));
  const [clienti, setClienti] = useState<ClienteMin[]>(clientiProp ?? []);
  const [commerciali, setCommerciali] = useState<Commerciale[]>(commercialiProp ?? []);
  const [cfg, setCfg] = useState<ImpostazioniFatture | null>(null);
  const [saving, setSaving] = useState(false);
  const [errori, setErrori] = useState<string[]>([]);
  const vfAttivo = !!cfg && cfg.vfModo !== "spento";

  useEffect(() => {
    if (!clientiProp)
      fetch("/api/clienti?min=1")
        .then((r) => r.json())
        .then((d) => setClienti(Array.isArray(d) ? d : []))
        .catch(() => {});
    if (!commercialiProp)
      fetch("/api/dipendenti?tipo=commerciale")
        .then((r) => r.json())
        .then((d) => setCommerciali(Array.isArray(d) ? d : []))
        .catch(() => {});
  }, [clientiProp, commercialiProp]);

  // Impostazioni fatture; per una nuova anche numero, scadenza e imposta proposti
  useEffect(() => {
    Promise.all([
      fetch("/api/impostazioni/fatture").then((r) => r.json()),
      fattura
        ? null
        : fetch(`/api/impostazioni/fatture/prossimo-numero?anno=${annoNuova}`).then((r) => r.json()),
    ])
      .then(([c, n]) => {
        setCfg(c);
        if (fattura) return;
        let scadenza = "";
        if (c?.giorniScadenza > 0) {
          const d = new Date();
          d.setDate(d.getDate() + Number(c.giorniScadenza));
          scadenza = d.toISOString().slice(0, 10);
        }
        setForm((f) => ({
          ...f,
          numero: f.numero || n?.numero || "",
          scadenza: f.scadenza || scadenza,
          tipoIva: !duplicaDa && c?.tipoIvaDefault === "igic7" ? "igic7" : f.tipoIva,
        }));
      })
      .catch(() => {
        /* restano i valori del form */
      });
  }, [fattura, duplicaDa, annoNuova]);

  // A 0 % la causa proposta dipende dalla sede del cliente (Impostazioni)
  const causaProposta = (clienteId: string) => {
    const paese = clienti.find((c) => String(c.id) === clienteId)?.paese;
    if (!cfg || !paese) return "";
    return paese === "Spagna" ? cfg.vfCausaSpagna : cfg.vfCausaEstero;
  };

  const sub = round2(righe.reduce((s, r) => s + num(r.quantita) * num(r.prezzo), 0));
  const aliquota = form.tipoIva === "igic7" ? 7 : 0;
  const imposta = Math.round(sub * aliquota) / 100;

  const payload = () => ({
    ...form,
    data: form.data || null,
    clienteId: form.clienteId ? parseInt(form.clienteId) : null,
    importo: sub,
    voci: righe.map((r) => ({
      descrizione: r.descrizione.trim(),
      quantita: num(r.quantita) || 1,
      prezzo: num(r.prezzo),
    })),
    iva: aliquota,
    causaIgic: aliquota === 0 ? form.causaIgic || null : null,
    scadenza: form.scadenza || null,
    aziendaNota: form.azienda === "Altro" ? form.aziendaNota : null,
  });

  const chiama = async (url: string, method: string, body: unknown): Promise<Fattura | null> => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({ error: "risposta non leggibile" }));
    if (!res.ok) {
      setErrori(Array.isArray(j.errori) && j.errori.length ? j.errori : [j.error ?? `Errore ${res.status}`]);
      return null;
    }
    return (j.fattura ?? j) as Fattura;
  };

  // Salva i dati: bozza nuova, oppure aggiornamento di quella aperta
  const salva = async (comeBozza: boolean): Promise<Fattura | null> => {
    const f = editing
      ? await chiama(`/api/fatture/${editing.id}`, "PATCH", payload())
      : await chiama("/api/fatture", "POST", { ...payload(), stato: comeBozza ? "bozza" : "emessa" });
    if (f && comeBozza) setSalvata(f);
    return f;
  };

  const esegui = async (azione: "salva" | "bozza" | "emetti") => {
    if (saving) return;
    setErrori([]);
    if (!sub && azione !== "bozza") return setErrori(["Scrivi almeno una riga con il suo prezzo."]);
    setSaving(true);
    try {
      if (azione === "salva" || azione === "bozza") {
        const f = await salva(azione === "bozza" || bozza);
        if (f) onSaved(f);
        return;
      }
      // Emetti. Senza VeriFactu una fattura nuova si registra direttamente,
      // con il numero scritto qui; altrimenti si passa dalla bozza.
      if (!vfAttivo && !editing) {
        const f = await salva(false);
        if (f) onSaved(f);
        return;
      }
      if (
        vfAttivo &&
        !confirm(
          `Emettere la fattura?\n\nRiceve il numero e il suo registro parte per l'AEAT (${cfg?.vfModo === "produzione" ? "invio vero" : "ambiente di prova, senza valore fiscale"}). Dopo non si modifica più: si corregge con una rettificativa.`,
        )
      )
        return;
      const b = await salva(true);
      if (!b) return;
      const f = await chiama(`/api/fatture/${b.id}/emetti`, "POST", { numero: form.numero });
      if (f) onSaved(f);
    } finally {
      setSaving(false);
    }
  };

  const setRiga = (i: number, patch: Partial<Riga>) =>
    setRighe((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const titolo = editing
    ? bozza
      ? rettifica
        ? "Bozza di rettificativa"
        : "Bozza di fattura"
      : "Modifica Fattura"
    : duplicaDa
      ? "Duplica Fattura"
      : "Nuova Fattura";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900">{titolo}</h2>

        {fiscaliBloccati && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Fattura trasmessa a VeriFactu: numero, data, cliente, righe e imposta non si modificano. Per
            correggerla si emette una rettificativa dal suo pannello.
          </p>
        )}
        {correggibile && (
          <p className="text-xs text-warn bg-warn/10 rounded-lg px-3 py-2">
            L&apos;AEAT non ha accettato il registro così com&apos;è: correggi i dati, salva e poi usa
            «Reinvia all&apos;AEAT» dal pannello. Numero e data restano quelli.
          </p>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Numero Fattura</label>
              {bozza && vfAttivo ? (
                <div className={`${inputCls} bg-gray-50 text-gray-400`}>all&apos;emissione</div>
              ) : (
                <input
                  type="text"
                  value={form.numero}
                  onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                  placeholder="Es. F202641"
                  disabled={gestita}
                  className={`${inputCls} font-mono`}
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Data emissione</label>
              <input
                type="date"
                value={form.data}
                max={vfAttivo && bozza ? oggiISO() : undefined}
                onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                disabled={gestita}
                className={inputCls}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Scadenza</label>
              <input
                type="date"
                value={form.scadenza}
                onChange={(e) => setForm((f) => ({ ...f, scadenza: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {rettifica && bozza && (
            <div>
              <label className={labelCls}>Motivo della rettifica</label>
              <select
                value={form.tipoFattura}
                onChange={(e) => setForm((f) => ({ ...f, tipoFattura: e.target.value }))}
                className={`${inputCls} bg-white`}
              >
                {TIPI_RETTIFICA.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Rettifica per differenze: le righe portano la differenza rispetto alla fattura corretta
                (col segno meno per stornare).
              </p>
            </div>
          )}

          <div>
            <label className={labelCls}>Cliente *</label>
            {fiscaliBloccati || rettifica ? (
              <div className={`${inputCls} bg-gray-50 text-gray-500`}>
                {clienti.find((c) => String(c.id) === form.clienteId)?.nome ?? editing?.cliente?.nome ?? "—"}
              </div>
            ) : (
              <ClienteSelect
                value={form.clienteId}
                onChange={(id) =>
                  setForm((f) => ({
                    ...f,
                    clienteId: id,
                    causaIgic: f.causaIgic || causaProposta(id),
                  }))
                }
                clienti={clienti}
                placeholder="Seleziona cliente..."
              />
            )}
          </div>

          <div>
            <label className={labelCls}>Descrizione dell&apos;operazione</label>
            <input
              type="text"
              value={form.descrizione}
              maxLength={500}
              onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
              placeholder={cfg?.vfDescrizioneDefault || "Es. Servicios de Publicidad"}
              disabled={fiscaliBloccati}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Righe *</label>
            <div className="space-y-2">
              {righe.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_64px_104px_28px] gap-2 items-center">
                  <input
                    type="text"
                    value={r.descrizione}
                    onChange={(e) => setRiga(i, { descrizione: e.target.value })}
                    placeholder="Concetto (es. Gestión de Ads — Octubre 2026)"
                    disabled={fiscaliBloccati}
                    className={inputCls}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={r.quantita}
                    onChange={(e) => setRiga(i, { quantita: e.target.value })}
                    title="Quantità"
                    disabled={fiscaliBloccati}
                    className={`${inputCls} text-right px-2`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={r.prezzo}
                    onChange={(e) => setRiga(i, { prezzo: e.target.value })}
                    placeholder="Prezzo €"
                    title="Prezzo unitario"
                    disabled={fiscaliBloccati}
                    className={`${inputCls} text-right px-2`}
                  />
                  <button
                    onClick={() => setRighe((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))}
                    disabled={fiscaliBloccati || righe.length === 1}
                    title="Togli la riga"
                    className="p-1 rounded-md text-gray-400 hover:text-bad hover:bg-bad/10 disabled:opacity-30"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {!fiscaliBloccati && (
              <button
                onClick={() => setRighe((rs) => [...rs, { descrizione: "", quantita: "1", prezzo: "" }])}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Aggiungi riga
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Imposta</label>
              <div className="flex gap-2">
                {TIPO_IVA_OPTIONS.map((o) => {
                  const active = form.tipoIva === o.value;
                  return (
                    <button
                      key={o.value}
                      disabled={fiscaliBloccati}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          tipoIva: o.value,
                          causaIgic: o.value === "igic7" ? "" : f.causaIgic || causaProposta(f.clienteId),
                        }))
                      }
                      className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all disabled:opacity-60"
                      style={
                        active
                          ? { background: "#fce7f3", color: "#be185d", borderColor: "#f9a8d4" }
                          : { background: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" }
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {aliquota === 0 && (
              <div>
                <label className={labelCls}>Perché a 0 %{vfAttivo ? " *" : ""}</label>
                <select
                  value={form.causaIgic}
                  onChange={(e) => setForm((f) => ({ ...f, causaIgic: e.target.value }))}
                  disabled={fiscaliBloccati}
                  className={`${inputCls} bg-white`}
                >
                  <option value="">— da scegliere —</option>
                  {CAUSE_ZERO.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Imponibile</span>
              <span className="font-medium">{fmt(sub)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{aliquota > 0 ? `IGIC ${aliquota} %` : "IGIC 0 %"}</span>
              <span className="font-medium">{fmt(imposta)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
              <span>TOTALE</span>
              <span>{fmt(sub + imposta)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Mese di competenza *</label>
              <select
                value={form.mese}
                onChange={(e) => setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))}
                className={`${inputCls} bg-white`}
              >
                {MESI_NUMS.map((m) => (
                  <option key={m} value={m}>
                    {MESI[m - 1]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Commerciale</label>
              <select
                value={form.commercialeId}
                onChange={(e) => setForm((f) => ({ ...f, commercialeId: e.target.value }))}
                className={`${inputCls} bg-white`}
              >
                <option value="">— nessuno —</option>
                {commerciali.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.cognome ? ` ${c.cognome}` : ""} · {c.percentualeCommissione}%
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">
            Con un commerciale, all&apos;incasso nasce la commissione in automatico (voce Commissioni).
            {form.commerciale && !form.commercialeId ? ` Valore storico: ${form.commerciale}.` : ""}
          </p>
          {!bozza || !vfAttivo ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.pagato}
                onChange={(e) => setForm((f) => ({ ...f, pagato: e.target.checked }))}
                className="w-4 h-4"
                style={{ accentColor: "#e8308a" }}
              />
              <span className="text-sm text-gray-700">Già pagata</span>
            </label>
          ) : null}
        </div>

        {errori.length > 0 && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2 space-y-0.5">
            {errori.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-2 flex-wrap">
          {/* Una bozza già salvata da qui va mostrata a chi ha aperto il form */}
          <button
            onClick={() => (salvata && !fattura ? onSaved(salvata) : onClose())}
            className="btn btn-secondary flex-1"
          >
            {salvata && !fattura ? "Chiudi" : "Annulla"}
          </button>
          {bozza ? (
            <>
              <button onClick={() => esegui("bozza")} disabled={saving} className="btn btn-secondary flex-1">
                Salva bozza
              </button>
              <button
                onClick={() => esegui("emetti")}
                disabled={saving || !cfg}
                className="btn btn-primary flex-1"
                title={
                  vfAttivo
                    ? "Assegna il numero e manda il registro all'AEAT"
                    : "Registra la fattura con il numero indicato"
                }
              >
                {vfAttivo ? "Emetti e invia" : "Emetti"}
              </button>
            </>
          ) : (
            <button onClick={() => esegui("salva")} disabled={saving} className="btn btn-primary flex-1">
              Salva
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

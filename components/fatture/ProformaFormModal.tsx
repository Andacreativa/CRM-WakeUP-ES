"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { CAUSE_ZERO, leggiVoci } from "@/lib/fatture";
import type { Proforma } from "@/lib/proforma";
import type { ImpostazioniFatture } from "@/lib/impostazioni";
import ClienteSelect from "@/components/crm/ClienteSelect";

// Modulo della proforma: Nuova, Modifica e Duplica. Stessi campi della
// fattura (righe, IGIC, causa a 0 %, commerciale), così la fattura che ne
// nasce con «Crea fattura» è già completa. Il numero lo assegna il
// salvataggio, dalla serie delle proforma.

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
const traGiorni = (giorni: number, da = oggiISO()) => {
  const d = new Date(`${da}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
};
const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-gray-50 disabled:text-gray-500";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";
const num = (s: string) => parseFloat(String(s).replace(",", ".")) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

const righeDa = (p: Proforma | null | undefined): Riga[] => {
  const voci = p ? leggiVoci(p.voci) : [];
  if (voci.length)
    return voci.map((v) => ({
      descrizione: v.descrizione,
      quantita: String(v.quantita),
      prezzo: String(v.prezzo),
    }));
  return [{ descrizione: "", quantita: "1", prezzo: "" }];
};

const formDa = (p: Proforma | null | undefined) => ({
  data: p?.data ? p.data.slice(0, 10) : oggiISO(),
  validaFino: p?.validaFino ? p.validaFino.slice(0, 10) : "",
  clienteId: p?.clienteId != null ? String(p.clienteId) : "",
  mese: p?.mese ?? new Date().getMonth() + 1,
  descrizione: p?.descrizione || "",
  tipoIva: (p?.tipoIva === "igic7" ? "igic7" : "igic_exenta") as TipoIva,
  causaIgic: p?.causaIgic || "",
  commercialeId: p?.commercialeId ? String(p.commercialeId) : "",
  note: p?.note || "",
});

export default function ProformaFormModal({
  proforma,
  duplicaDa,
  clienti: clientiProp,
  commerciali: commercialiProp,
  onClose,
  onSaved,
}: {
  proforma?: Proforma | null; // modifica
  duplicaDa?: Proforma | null; // nuova, con i dati di questa
  clienti?: ClienteMin[];
  commerciali?: Commerciale[];
  onClose: () => void;
  onSaved: (p: Proforma) => void;
}) {
  const editing = proforma ?? null;
  const [form, setForm] = useState(() =>
    editing
      ? formDa(editing)
      : // Una copia è una proforma nuova: data e validità ripartono
        { ...formDa(duplicaDa), data: oggiISO(), validaFino: "", mese: new Date().getMonth() + 1 },
  );
  const [righe, setRighe] = useState<Riga[]>(() => righeDa(editing ?? duplicaDa));
  // Le liste della pagina possono arrivare dopo l'apertura del modulo: si
  // seguono quando ci sono, e intanto il modulo carica le sue
  const [clientiPropri, setClientiPropri] = useState<ClienteMin[]>([]);
  const [commercialiPropri, setCommercialiPropri] = useState<Commerciale[]>([]);
  const clienti = clientiProp?.length ? clientiProp : clientiPropri;
  const commerciali = commercialiProp?.length ? commercialiProp : commercialiPropri;
  const senzaClienti = !clientiProp?.length;
  const senzaCommerciali = !commercialiProp?.length;
  const [cfg, setCfg] = useState<ImpostazioniFatture | null>(null);
  const [numero, setNumero] = useState(editing?.numero ?? "");
  const [saving, setSaving] = useState(false);
  const [errori, setErrori] = useState<string[]>([]);

  useEffect(() => {
    if (senzaClienti)
      fetch("/api/clienti?min=1")
        .then((r) => r.json())
        .then((d) => setClientiPropri(Array.isArray(d) ? d : []))
        .catch(() => {});
  }, [senzaClienti]);
  useEffect(() => {
    if (senzaCommerciali)
      fetch("/api/dipendenti?tipo=commerciale")
        .then((r) => r.json())
        .then((d) => setCommercialiPropri(Array.isArray(d) ? d : []))
        .catch(() => {});
  }, [senzaCommerciali]);

  // Impostazioni; per una nuova anche il numero che prenderà, la validità
  // (giorni di scadenza delle Impostazioni) e l'imposta di default
  const annoNuova = new Date().getFullYear();
  useEffect(() => {
    Promise.all([
      fetch("/api/impostazioni/fatture").then((r) => r.json()),
      editing ? null : fetch(`/api/proforma/prossimo-numero?anno=${annoNuova}`).then((r) => r.json()),
    ])
      .then(([c, n]) => {
        setCfg(c);
        if (editing) return;
        if (n?.numero) setNumero(n.numero);
        setForm((f) => ({
          ...f,
          validaFino: f.validaFino || (c?.giorniScadenza > 0 ? traGiorni(Number(c.giorniScadenza), f.data) : ""),
          tipoIva: !duplicaDa && c?.tipoIvaDefault === "igic7" ? "igic7" : f.tipoIva,
        }));
      })
      .catch(() => {
        /* restano i valori del form */
      });
  }, [editing, duplicaDa, annoNuova]);

  // A 0 % la causa proposta dipende dalla sede del cliente (Impostazioni)
  const causaProposta = (clienteId: string) => {
    const paese = clienti.find((c) => String(c.id) === clienteId)?.paese;
    if (!cfg || !paese) return "";
    return paese === "Spagna" ? cfg.vfCausaSpagna : cfg.vfCausaEstero;
  };

  const sub = round2(righe.reduce((s, r) => s + num(r.quantita) * num(r.prezzo), 0));
  const aliquota = form.tipoIva === "igic7" ? 7 : 0;
  const imposta = Math.round(sub * aliquota) / 100;

  const salva = async () => {
    if (saving) return;
    setErrori([]);
    if (!form.clienteId) return setErrori(["Scegli il cliente."]);
    if (!sub) return setErrori(["Scrivi almeno una riga con il suo prezzo."]);
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/proforma/${editing.id}` : "/api/proforma", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          validaFino: form.validaFino || null,
          clienteId: parseInt(form.clienteId, 10),
          commercialeId: form.commercialeId ? parseInt(form.commercialeId, 10) : null,
          causaIgic: aliquota === 0 ? form.causaIgic || null : null,
          voci: righe.map((r) => ({
            descrizione: r.descrizione.trim(),
            quantita: num(r.quantita) || 1,
            prezzo: num(r.prezzo),
          })),
        }),
      });
      const j = await res.json().catch(() => ({ error: "risposta non leggibile" }));
      if (!res.ok) {
        setErrori(Array.isArray(j.errori) && j.errori.length ? j.errori : [j.error ?? `Errore ${res.status}`]);
        return;
      }
      onSaved(j as Proforma);
    } finally {
      setSaving(false);
    }
  };

  const setRiga = (i: number, patch: Partial<Riga>) =>
    setRighe((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? "Modifica proforma" : duplicaDa ? "Duplica proforma" : "Nuova proforma"}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Documento senza valore fiscale: non va a VeriFactu e non entra nel fatturato. Con «Crea fattura»
            diventa una bozza di fattura.
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Numero proforma</label>
              <div
                className={`${inputCls} bg-gray-50 font-mono ${editing ? "text-gray-700" : "text-gray-400"}`}
                title={editing ? undefined : "Il numero si assegna al salvataggio, dalla serie delle proforma"}
              >
                {numero || "al salvataggio"}
              </div>
            </div>
            <div>
              <label className={labelCls}>Data</label>
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Valida fino al</label>
              <input
                type="date"
                value={form.validaFino}
                min={form.data || undefined}
                onChange={(e) => setForm((f) => ({ ...f, validaFino: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Cliente *</label>
            <ClienteSelect
              value={form.clienteId}
              onChange={(id) =>
                setForm((f) => ({ ...f, clienteId: id, causaIgic: f.causaIgic || causaProposta(id) }))
              }
              clienti={clienti}
              placeholder="Seleziona cliente..."
            />
          </div>

          <div>
            <label className={labelCls}>Descrizione dell&apos;operazione</label>
            <input
              type="text"
              value={form.descrizione}
              maxLength={500}
              onChange={(e) => setForm((f) => ({ ...f, descrizione: e.target.value }))}
              placeholder={cfg?.vfDescrizioneDefault || "Es. Servicios de Publicidad"}
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
                    placeholder="Concetto (es. Diseño web — anticipo 50 %)"
                    className={inputCls}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={r.quantita}
                    onChange={(e) => setRiga(i, { quantita: e.target.value })}
                    title="Quantità"
                    className={`${inputCls} text-right px-2`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={r.prezzo}
                    onChange={(e) => setRiga(i, { prezzo: e.target.value })}
                    placeholder="Prezzo €"
                    title="Prezzo unitario"
                    className={`${inputCls} text-right px-2`}
                  />
                  <button
                    onClick={() => setRighe((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))}
                    disabled={righe.length === 1}
                    title="Togli la riga"
                    className="p-1 rounded-md text-gray-400 hover:text-bad hover:bg-bad/10 disabled:opacity-30"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setRighe((rs) => [...rs, { descrizione: "", quantita: "1", prezzo: "" }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Aggiungi riga
            </button>
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
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          tipoIva: o.value,
                          causaIgic: o.value === "igic7" ? "" : f.causaIgic || causaProposta(f.clienteId),
                        }))
                      }
                      className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
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
                <label className={labelCls}>Perché a 0 %</label>
                <select
                  value={form.causaIgic}
                  onChange={(e) => setForm((f) => ({ ...f, causaIgic: e.target.value }))}
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
              <label className={labelCls}>Mese di competenza</label>
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

          <div>
            <label className={labelCls}>Note interne</label>
            <textarea
              value={form.note}
              maxLength={1000}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Solo per noi: non vanno sul PDF"
              className={`${inputCls} min-h-[64px]`}
            />
          </div>
        </div>

        {errori.length > 0 && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2 space-y-0.5">
            {errori.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Annulla
          </button>
          <button onClick={salva} disabled={saving} className="btn btn-primary flex-1">
            {editing ? "Salva" : "Crea proforma"}
          </button>
        </div>
      </div>
    </div>
  );
}

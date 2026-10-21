"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Unlink, X } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import ClienteSelect from "@/components/crm/ClienteSelect";
import { cn } from "@/lib/utils";
import { nomeCompleto } from "@/lib/dipendenti";
import { avanzaMese, STEP_RICORRENZA } from "@/lib/richieste";
import {
  type ClienteMin,
  type ContrattoMin,
  type RegoleRicorrenze,
  type Richiesta,
  ANNI_FORM,
  RICORRENZE,
  inputCls,
  labelCls,
  parseVoci,
  regoleValide,
} from "./tipi";

const formDa = (r: Richiesta | null, anno: number) => {
  const voci = r ? parseVoci(r.voci) : [];
  return {
    clienteId: r?.clienteId ? String(r.clienteId) : "",
    nomeCliente: r?.nomeCliente ?? "",
    contrattoId: r?.contrattoId ? String(r.contrattoId) : "",
    responsabile: r?.responsabile ?? "",
    // il canale non si chiede più: le richieste sono sempre dirette
    azienda: r?.azienda ?? "Spagna",
    aziendaNota: r?.aziendaNota ?? "",
    voci: r
      ? voci.length
        ? voci.map((v) => ({ descrizione: v.descrizione, importo: String(v.importo) }))
        : [{ descrizione: r.descrizione, importo: String(r.imponibile) }]
      : [{ descrizione: "", importo: "" }],
    tipoIva: r?.tipoIva === "igic7" ? "igic7" : "igic_exenta",
    mese: r?.mese ?? new Date().getMonth() + 1,
    anno: r?.anno ?? anno,
    dataInvio: r?.dataInvio ? r.dataInvio.slice(0, 10) : "",
    // Ultima scelta della tendina: «Standard» ci torna dal passo libero
    ricorrenza: r?.ricorrenza && r.ricorrenza !== "personalizzata" ? r.ricorrenza : "una_tantum",
    // «Ogni N mesi»: al posto della tendina, con il numero di mesi
    passoLibero: r?.ricorrenza === "personalizzata",
    passoMesi: r?.passoMesi ? String(r.passoMesi) : "",
    ripetizioni: "1",
    autorizzaTutte: false,
    note: r?.note ?? "",
  };
};

const CADENZA: Record<string, string> = {
  mensile: "una al mese",
  trimestrale: "una ogni 3 mesi",
  semestrale: "una ogni 6 mesi",
  annuale: "una all'anno",
};

// Form della richiesta: Nuova e Modifica (con Elimina e Scollega fattura).
// Usato dalla lista e dalla scheda della richiesta.
export default function RichiestaFormModal({
  richiesta,
  annoDefault,
  clienti: clientiProp,
  contratti: contrattiProp,
  onClose,
  onSaved,
  onDeleted,
  onScollegata,
}: {
  richiesta: Richiesta | null;
  annoDefault: number;
  clienti?: ClienteMin[];
  contratti?: ContrattoMin[];
  onClose: () => void;
  onSaved: (msg: string, periodo: { mese: number; anno: number }) => void;
  onDeleted?: () => void;
  onScollegata?: () => void;
}) {
  const editing = richiesta;
  const [form, setForm] = useState(() =>
    formDa(richiesta, annoDefault > 0 ? annoDefault : new Date().getFullYear()),
  );
  const [clienti, setClienti] = useState<ClienteMin[]>(clientiProp ?? []);
  const [contratti, setContratti] = useState<ContrattoMin[]>(contrattiProp ?? []);
  const [persone, setPersone] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Passo e tetto delle rate li decide il server: senza risposta (server non
  // ancora aggiornato) la tendina resta quella di prima e il tastino non c'è.
  const [regole, setRegole] = useState<RegoleRicorrenze | null>(null);
  useEffect(() => {
    if (editing) return;
    fetch("/api/richieste-fattura/ricorrenze")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRegole(regoleValide(j)))
      .catch(() => setRegole(null));
  }, [editing]);
  // «Solo questa / Da questa in poi»: si chiede solo in modifica e solo se
  // dopo questa rata ce n'è almeno un'altra nella serie (conteggio dal server).
  const successive = richiesta?.successive ?? 0;
  const [chiediSerie, setChiediSerie] = useState(false);
  useEffect(() => {
    if (!chiediSerie) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChiediSerie(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chiediSerie]);

  useEffect(() => {
    if (!clientiProp)
      fetch("/api/clienti?min=1")
        .then((r) => r.json())
        .then((c) =>
          setClienti(
            (Array.isArray(c) ? c : [])
              .map((x: ClienteMin) => ({ id: x.id, nome: x.nome, paese: x.paese }))
              .sort((a: ClienteMin, b: ClienteMin) => a.nome.localeCompare(b.nome)),
          ),
        )
        .catch(() => {});
    if (!contrattiProp)
      fetch("/api/contratti")
        .then((r) => r.json())
        .then((k) => setContratti(Array.isArray(k) ? k : []))
        .catch(() => {});
  }, [clientiProp, contrattiProp]);

  useEffect(() => {
    fetch("/api/dipendenti?attivi=1")
      .then((r) => r.json())
      .then((d) =>
        setPersone(
          Array.isArray(d) ? Array.from(new Set(d.map(nomeCompleto).filter(Boolean))) : [],
        ),
      )
      .catch(() => {});
  }, []);

  // Il responsabile resta un nome: un valore già salvato che non è (più) tra
  // le persone attive si tiene in lista, così modificando non si perde.
  const responsabileSalvato = richiesta?.responsabile ?? "";

  // Serie: quante richieste nascono e fino a che mese (come fa l'API).
  // Con il passo libero il numero di mesi è nel campo «Ogni [N] mesi».
  const libero = form.passoLibero && regole !== null;
  const nMesi = Number(form.passoMesi);
  const passoLiberoOk =
    libero &&
    form.passoMesi.trim() !== "" &&
    Number.isInteger(nMesi) &&
    nMesi >= regole.libera.min &&
    nMesi <= regole.libera.max;
  const passo = libero
    ? passoLiberoOk
      ? nMesi
      : 0
    : (regole?.fisse[form.ricorrenza]?.passo ?? STEP_RICORRENZA[form.ricorrenza] ?? 0);
  const tetto = !regole
    ? undefined
    : libero
      ? passoLiberoOk
        ? regole.libera.tetti[String(nMesi)]
        : undefined
      : regole.fisse[form.ricorrenza]?.tetto;
  const chieste = Math.max(1, parseInt(form.ripetizioni, 10) || 1);
  const nSerie = passo > 0 ? (tetto ? Math.min(tetto, chieste) : chieste) : 1;
  const fineSerie = avanzaMese(form.mese, form.anno, passo * (nSerie - 1));
  const cadenza = libero ? `una ogni ${passo} mesi` : CADENZA[form.ricorrenza];
  const etichettaQuante = libero
    ? "Quante rate"
    : form.ricorrenza === "semestrale"
      ? "Per quanti semestri"
      : "Quante fatture";
  // In tendina solo le ricorrenze che il server conosce
  const opzioniRicorrenza = RICORRENZE.filter((r) =>
    regole ? regole.fisse[r.value] !== undefined : !r.nuova,
  );

  const imponibileForm = form.voci.reduce(
    (s, v) => s + (parseFloat(String(v.importo).replace(",", ".")) || 0),
    0,
  );
  const ivaForm = form.tipoIva === "igic7" ? 7 : 0;
  const totaleForm = Math.round(imponibileForm * (1 + ivaForm / 100) * 100) / 100;

  // `applyTo` arriva dalla finestrella della serie; senza, su una rata che ha
  // altre rate dopo di sé si apre la finestrella invece di salvare.
  const save = async (applyTo?: "questa" | "successive") => {
    const voci = form.voci
      .map((v) => ({
        descrizione: v.descrizione.trim(),
        importo: parseFloat(String(v.importo).replace(",", ".")) || 0,
      }))
      .filter((v) => v.descrizione || v.importo);
    if (!form.clienteId) {
      setErr("Scegli il cliente dall'anagrafica, oppure crealo con «+ Nuovo»");
      return;
    }
    if (!voci.length || imponibileForm <= 0) {
      setErr("Inserisci almeno una voce con importo");
      return;
    }
    if (!editing && libero && !passoLiberoOk) {
      setErr(`Ogni quanti mesi: scegli un numero intero da ${regole.libera.min} a ${regole.libera.max}`);
      return;
    }
    if (editing && successive > 0 && !applyTo) {
      setErr(null);
      setChiediSerie(true);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        clienteId: form.clienteId,
        nomeCliente: null,
        contrattoId: form.contrattoId || null,
        responsabile: form.responsabile,
        azienda: form.azienda,
        aziendaNota: form.aziendaNota,
        descrizione: voci.map((v) => v.descrizione).filter(Boolean).join(", "),
        voci,
        tipoIva: form.tipoIva,
        mese: form.mese,
        anno: form.anno,
        dataInvio: form.dataInvio || null,
        ricorrenza: libero ? regole.libera.valore : form.ricorrenza,
        passoMesi: libero ? nMesi : null,
        ripetizioni: form.ripetizioni,
        autorizzaTutte: form.autorizzaTutte,
        note: form.note,
        applyTo: applyTo ?? "questa",
      };
      const res = await fetch(
        editing ? `/api/richieste-fattura/${editing.id}` : "/api/richieste-fattura",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        serie?: { messaggio: string } | null;
      };
      if (!res.ok) {
        setErr(j.error ?? "Salvataggio non riuscito");
        return;
      }
      // Con «Da questa in poi» il server dice quante rate successive ha
      // aggiornato e quante ha lasciato perché già fatte.
      const esitoSerie = j.serie?.messaggio ? ` ${j.serie.messaggio}` : "";
      onSaved(
        editing ? `Richiesta aggiornata${esitoSerie ? "." + esitoSerie : ""}` : "Richiesta creata",
        { mese: form.mese, anno: form.anno },
      );
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!editing || !confirm(`Eliminare la richiesta ${editing.codice}?`)) return;
    await fetch(`/api/richieste-fattura/${editing.id}`, { method: "DELETE" });
    onDeleted?.();
  };

  const scollega = async () => {
    if (!editing || !confirm("Scollegare la fattura da questa richiesta?")) return;
    await fetch(`/api/richieste-fattura/${editing.id}/collega`, { method: "DELETE" });
    onScollegata?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? `Modifica ${editing.codice}` : "Nuova richiesta di fattura"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {editing?.fatturaId && (
          <div className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2 border bg-ok/10 border-ok/30">
            <span className="text-gray-700">
              Emessa con la fattura{" "}
              <Link
                href={`/finance/fatture/${editing.fatturaId}`}
                className="font-semibold text-brand hover:underline"
              >
                {editing.fattura?.numero ?? "senza numero"}
              </Link>
            </span>
            <button
              onClick={scollega}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-bad"
              title="Stacca la fattura da questa richiesta (la fattura resta)"
            >
              <Unlink className="w-3.5 h-3.5" /> Scollega
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Cliente *</label>
            {!form.clienteId && form.nomeCliente && (
              <p className="text-xs rounded-lg px-3 py-2 mb-2 border bg-warn/10 border-warn/30 text-warn">
                «{form.nomeCliente}» non è in anagrafica: sceglilo dalla lista o crealo con «+ Nuovo».
              </p>
            )}
            <ClienteSelect
              value={form.clienteId}
              onChange={(id) => setForm((f) => ({ ...f, clienteId: id, contrattoId: "" }))}
              clienti={clienti}
              nomeIniziale={form.nomeCliente || undefined}
            />
          </div>
          <div>
            <label className={labelCls}>Contratto (opzionale)</label>
            <select
              value={form.contrattoId}
              onChange={(e) => setForm((f) => ({ ...f, contrattoId: e.target.value }))}
              className={inputCls}
              disabled={!form.clienteId}
            >
              <option value="">— nessuno —</option>
              {contratti
                .filter((c) => String(c.clienteId) === form.clienteId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.oggetto}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Responsabile commerciale</label>
            <select
              value={form.responsabile}
              onChange={(e) => setForm((f) => ({ ...f, responsabile: e.target.value }))}
              className={inputCls}
            >
              <option value="">— da assegnare —</option>
              {responsabileSalvato && !persone.includes(responsabileSalvato) && (
                <option value={responsabileSalvato}>{responsabileSalvato}</option>
              )}
              {persone.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Voci */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>Voci</label>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...f, voci: [...f.voci, { descrizione: "", importo: "" }] }))
              }
              className="text-xs font-semibold text-brand hover:text-brand flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Aggiungi voce
            </button>
          </div>
          <div className="space-y-2">
            {form.voci.map((v, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={v.descrizione}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      voci: f.voci.map((x, j) =>
                        j === i ? { ...x, descrizione: e.target.value } : x,
                      ),
                    }))
                  }
                  className={cn(inputCls, "flex-1")}
                  placeholder="Descrizione (es. Gestione social — Ottobre)"
                />
                <input
                  value={v.importo}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      voci: f.voci.map((x, j) => (j === i ? { ...x, importo: e.target.value } : x)),
                    }))
                  }
                  className={cn(inputCls, "w-32 text-right")}
                  placeholder="Importo"
                  inputMode="decimal"
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      voci: f.voci.length > 1 ? f.voci.filter((_, j) => j !== i) : f.voci,
                    }))
                  }
                  className="p-2 text-gray-400 hover:text-bad"
                  title="Rimuovi voce"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Tipo IVA</label>
            <div className="flex gap-2">
              {[
                { value: "igic_exenta", label: "IGIC Exenta" },
                { value: "igic7", label: "IGIC 7%" },
              ].map((o) => {
                const active = form.tipoIva === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tipoIva: o.value }))}
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
          <div>
            <label className={labelCls}>Mese di competenza</label>
            <select
              value={form.mese}
              onChange={(e) => setForm((f) => ({ ...f, mese: parseInt(e.target.value) }))}
              className={inputCls}
            >
              {MESI.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Anno</label>
            <select
              value={form.anno}
              onChange={(e) => setForm((f) => ({ ...f, anno: parseInt(e.target.value) }))}
              className={inputCls}
            >
              {ANNI_FORM.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Data invio prevista</label>
            <input
              type="date"
              value={form.dataInvio}
              onChange={(e) => setForm((f) => ({ ...f, dataInvio: e.target.value }))}
              className={inputCls}
            />
          </div>
          {!editing && (
            <>
              <div>
                {/* Etichetta e tastino sulla stessa riga: la tendina resta
                    allineata ai campi accanto e larga quanto prima */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="ricorrenza" className={cn(labelCls, "mb-0")}>
                    Ricorrenza
                  </label>
                  {regole && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          passoLibero: !f.passoLibero,
                          passoMesi: f.passoMesi || String(regole.libera.iniziale),
                        }))
                      }
                      className="text-xs font-semibold text-brand hover:text-brand whitespace-nowrap"
                      title={
                        libero
                          ? "Torna alle ricorrenze standard"
                          : "Una rata ogni tot mesi, a scelta"
                      }
                    >
                      {libero ? "Standard" : "Ogni N mesi"}
                    </button>
                  )}
                </div>
                {libero ? (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <span>Ogni</span>
                    <input
                      id="ricorrenza"
                      type="number"
                      required
                      min={regole.libera.min}
                      max={regole.libera.max}
                      step={1}
                      value={form.passoMesi}
                      onChange={(e) => setForm((f) => ({ ...f, passoMesi: e.target.value }))}
                      className={cn(inputCls, "w-20 text-right invalid:border-bad")}
                      aria-label="Ogni quanti mesi"
                    />
                    <span>mesi</span>
                  </div>
                ) : (
                  <select
                    id="ricorrenza"
                    value={form.ricorrenza}
                    onChange={(e) => setForm((f) => ({ ...f, ricorrenza: e.target.value }))}
                    className={inputCls}
                  >
                    {opzioniRicorrenza.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className={labelCls}>{etichettaQuante}</label>
                <input
                  type="number"
                  min={1}
                  max={tetto}
                  value={form.ripetizioni}
                  disabled={!libero && form.ricorrenza === "una_tantum"}
                  onChange={(e) => setForm((f) => ({ ...f, ripetizioni: e.target.value }))}
                  className={cn(inputCls, "disabled:opacity-50")}
                />
              </div>
              {passo > 0 && (
                <p className="md:col-span-3 text-[11px] text-gray-400 -mt-1">
                  {nSerie > 1
                    ? `Si creano ${nSerie} richieste, una per fattura: ${cadenza}, da ${MESI[form.mese - 1]} ${form.anno} a ${MESI[fineSerie.mese - 1]} ${fineSerie.anno}.`
                    : `Si crea una sola richiesta, per ${MESI[form.mese - 1]} ${form.anno}: per ripeterla aumenta il numero.`}
                  {tetto && chieste > tetto ? ` Al massimo ${tetto} in una volta.` : ""}
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <label className={labelCls}>Note</label>
          <textarea
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className={cn(inputCls, "min-h-[64px]")}
          />
        </div>

        {err && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-gray-100">
          <div className="text-sm text-gray-600">
            Imponibile <strong>{fmt(imponibileForm)}</strong>
            {ivaForm > 0 && <> · IGIC {ivaForm}%</>} · Totale{" "}
            <strong className="text-gray-900">{fmt(totaleForm)}</strong>
          </div>
          <div className="flex items-center gap-3">
            {!editing && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autorizzaTutte}
                  onChange={(e) => setForm((f) => ({ ...f, autorizzaTutte: e.target.checked }))}
                />
                Autorizza subito l&apos;invio
              </label>
            )}
            {editing && onDeleted && (
              <button
                onClick={del}
                className="inline-flex items-center gap-1 text-sm text-bad hover:underline px-2 py-2"
              >
                <Trash2 className="w-4 h-4" /> Elimina
              </button>
            )}
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
            >
              Annulla
            </button>
            <button
              onClick={() => save()}
              disabled={saving}
              className="btn btn-primary disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : editing ? "Salva" : "Crea"}
            </button>
          </div>
        </div>
      </div>

      {/* Finestrella della serie: «Solo questa» o «Da questa in poi» */}
      {chiediSerie && editing && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setChiediSerie(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="serie-titolo"
            className="glass-modal rounded-2xl w-full max-w-md p-5 space-y-3"
          >
            <h3 id="serie-titolo" className="text-base font-bold text-gray-900">
              Questa rata fa parte di una serie
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              {editing.serieIndice && editing.serieTotale ? (
                <>
                  È la rata <strong>{editing.serieIndice}</strong> di{" "}
                  <strong>{editing.serieTotale}</strong>
                  {successive === 1
                    ? ", dopo ce n'è ancora una."
                    : `, dopo ce ne sono ancora ${successive}.`}
                </>
              ) : successive === 1 ? (
                <>Dopo questa c&apos;è ancora una rata.</>
              ) : (
                <>Dopo questa ci sono ancora {successive} rate.</>
              )}{" "}
              Vuoi applicare la modifica solo a questa o anche alle rate successive?
            </p>
            <p className="text-xs text-gray-400">
              Mese e data di invio di ogni rata non cambiano. Le rate già fatturate o
              incassate restano com&apos;erano.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setChiediSerie(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => {
                  setChiediSerie(false);
                  save("questa");
                }}
                className="btn btn-secondary"
              >
                Solo questa
              </button>
              <button
                type="button"
                onClick={() => {
                  setChiediSerie(false);
                  save("successive");
                }}
                className="btn btn-primary"
              >
                Da questa in poi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

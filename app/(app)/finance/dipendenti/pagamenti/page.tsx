"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, X, Zap } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import {
  VOCI,
  VOCI_ORDINE,
  type Voce,
  importoDefault,
  nomeCompleto,
  vociDiTipo,
  gruppiPerTipo,
} from "@/lib/dipendenti";
import Avatar from "@/components/Avatar";

interface Persona {
  id: number;
  nome: string;
  cognome: string | null;
  fotoPath: string | null;
  tipo: string;
  attivo: boolean;
  nettoBustaPaga: number;
  seguridadSocial: number;
  irpfImporto: number;
  rimborsiMensili: number;
  benefitMensili: number;
}
interface Pagamento {
  id: number;
  dipendenteId: number;
  anno: number;
  mese: number;
  voce: Voce;
  importo: number;
  data: string | null;
  note: string | null;
  fattura: { id: number; numero: string | null; cliente: { nome: string } | null } | null;
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white";

export default function PagamentiPage() {
  const { anno: annoCtx } = useAnno();
  const annoDefault = annoCtx > 0 ? annoCtx : new Date().getFullYear();
  const [anno, setAnno] = useState(annoDefault);
  const [mese, setMese] = useState(new Date().getMonth() + 1);
  const [persone, setPersone] = useState<Persona[]>([]);
  const [pagamenti, setPagamenti] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    persona: Persona;
    voce: Voce;
    esistente: Pagamento | null;
  } | null>(null);

  // Segue l'anno scelto nella topbar
  useEffect(() => {
    setAnno(annoDefault);
  }, [annoDefault]);

  const load = useCallback(async () => {
    try {
      const [p, pag] = await Promise.all([
        fetch("/api/dipendenti?attivi=1").then((r) => r.json()),
        fetch(`/api/pagamenti-mensili?anno=${anno}&mese=${mese}`).then((r) => r.json()),
      ]);
      setPersone(Array.isArray(p) ? p : []);
      setPagamenti(Array.isArray(pag) ? pag : []);
    } finally {
      setLoading(false);
    }
  }, [anno, mese]);
  useEffect(() => {
    load();
  }, [load]);

  const notify = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 3500);
  };

  const prevMese = () => {
    if (mese === 1) {
      setMese(12);
      setAnno((a) => a - 1);
    } else setMese((m) => m - 1);
  };
  const nextMese = () => {
    if (mese === 12) {
      setMese(1);
      setAnno((a) => a + 1);
    } else setMese((m) => m + 1);
  };

  // Colonne: solo le voci usate da almeno una persona attiva
  const colonne = useMemo(() => {
    const usate = new Set<Voce>();
    for (const p of persone) for (const v of vociDiTipo(p.tipo)) usate.add(v);
    return VOCI_ORDINE.filter((v) => usate.has(v));
  }, [persone]);

  const byKey = useMemo(() => {
    const m = new Map<string, Pagamento[]>();
    for (const p of pagamenti) {
      const k = `${p.dipendenteId}:${p.voce}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [pagamenti]);

  const cella = (p: Persona, v: Voce) => byKey.get(`${p.id}:${v}`) ?? [];
  const totRiga = (p: Persona) =>
    pagamenti.filter((x) => x.dipendenteId === p.id).reduce((s, x) => s + x.importo, 0);
  const totCol = (v: Voce) =>
    pagamenti.filter((x) => x.voce === v).reduce((s, x) => s + x.importo, 0);
  const totale = pagamenti.reduce((s, x) => s + x.importo, 0);

  const registraMese = async () => {
    if (!confirm(`Registrare tutte le voci mancanti di ${MESI[mese - 1]} ${anno} con gli importi di default?`))
      return;
    const res = await fetch("/api/pagamenti-mensili/registra-mese", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anno, mese }),
    });
    const j = await res.json().catch(() => ({}));
    notify(res.ok ? `${j.creati} voci registrate` : (j.error ?? "Errore"));
    load();
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className="text-sm rounded-lg px-3 py-2 border bg-emerald-50 border-emerald-200 text-emerald-700">
          {msg}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagamenti</h1>
          <p className="text-gray-500 text-sm mt-1">
            Registro mensile: ogni voce registrata crea la spesa corrispondente
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1 py-1">
            <button onClick={prevMese} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Mese precedente">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-900 min-w-[150px] text-center">
              {MESI[mese - 1]} {anno}
            </span>
            <button onClick={nextMese} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Mese successivo">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={registraMese}
            className="glass-btn-primary flex items-center gap-1.5 text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            <Zap className="w-4 h-4" /> Registra mese
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3">
                  Persona
                </th>
                {colonne.map((v) => (
                  <th
                    key={v}
                    className="text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3 whitespace-nowrap"
                  >
                    {VOCI[v].label}
                    {VOCI[v].auto && (
                      <span className="ml-1 text-[9px] normal-case font-medium text-pink-600">auto</span>
                    )}
                  </th>
                ))}
                <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3">
                  Totale
                </th>
              </tr>
            </thead>
            <tbody className="zebra">
              {loading && (
                <tr>
                  <td colSpan={colonne.length + 2} className="px-4 py-10 text-center text-sm text-gray-400">
                    Caricamento…
                  </td>
                </tr>
              )}
              {!loading && persone.length === 0 && (
                <tr>
                  <td colSpan={colonne.length + 2} className="px-4 py-12 text-center text-sm text-gray-400">
                    Nessuna persona attiva. Aggiungila nella tab Persone.
                  </td>
                </tr>
              )}
              {gruppiPerTipo(persone).map((g) => (
                <Fragment key={g.tipo}>
                  <tr>
                    <td
                      colSpan={colonne.length + 2}
                      className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-white"
                    >
                      {g.label}
                    </td>
                  </tr>
                  {g.persone.map((p) => {
                const voci = vociDiTipo(p.tipo);
                return (
                  <tr key={p.id} className="border-b border-gray-50 align-middle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar nome={p.nome} cognome={p.cognome} fotoPath={p.fotoPath} size={32} />
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{nomeCompleto(p)}</div>
                          <div className="text-[11px] text-gray-400">
                            {p.tipo === "socio_dipendente"
                              ? "Socio dipendente"
                              : p.tipo === "commerciale"
                                ? "Commerciale"
                                : "Dipendente"}
                          </div>
                        </div>
                      </div>
                    </td>
                    {colonne.map((v) => {
                      if (!voci.includes(v)) {
                        return (
                          <td key={v} className="px-4 py-3 text-right text-gray-300 text-sm">
                            —
                          </td>
                        );
                      }
                      const righe = cella(p, v);
                      const somma = righe.reduce((s, x) => s + x.importo, 0);
                      if (VOCI[v].auto) {
                        return (
                          <td key={v} className="px-4 py-3 text-right">
                            {righe.length ? (
                              <div
                                title={righe
                                  .map(
                                    (r) =>
                                      `${r.fattura?.numero ?? "fattura"} ${r.fattura?.cliente?.nome ?? ""}: ${fmt(r.importo)}`,
                                  )
                                  .join("\n")}
                              >
                                <div className="text-sm font-semibold text-gray-900">{fmt(somma)}</div>
                                <div className="text-[10px] text-gray-400">
                                  {righe.length} fattur{righe.length === 1 ? "a" : "e"}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-400">nessuna</span>
                            )}
                          </td>
                        );
                      }
                      if (VOCI[v].multiplo) {
                        // Rimborsi: più righe nel mese, ognuna con data e descrizione
                        return (
                          <td key={v} className="px-4 py-3 text-right">
                            <div className="inline-flex flex-col items-end gap-1">
                              {righe.map((r) => (
                                <button
                                  key={r.id}
                                  onClick={() => setModal({ persona: p, voce: v, esistente: r })}
                                  className="inline-flex items-center gap-1.5 text-xs text-gray-700 hover:text-pink-600"
                                  title={r.note ?? "Modifica o elimina"}
                                >
                                  <span className="text-[10px] text-gray-400 tabular-nums">
                                    {r.data
                                      ? new Date(r.data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
                                      : ""}
                                  </span>
                                  <span className="max-w-[140px] truncate text-gray-500">{r.note ?? "rimborso"}</span>
                                  <span className="font-semibold">{fmt(r.importo)}</span>
                                </button>
                              ))}
                              {righe.length > 1 && (
                                <div className="text-sm font-semibold text-gray-900 border-t border-gray-200 pt-1">
                                  {fmt(somma)}
                                </div>
                              )}
                              <button
                                onClick={() => setModal({ persona: p, voce: v, esistente: null })}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-pink-400 hover:text-pink-600 whitespace-nowrap"
                              >
                                <Plus className="w-3 h-3" />
                                {righe.length ? "aggiungi" : "rimborso"}
                              </button>
                            </div>
                          </td>
                        );
                      }
                      const esistente = righe[0] ?? null;
                      const def = importoDefault(p, v);
                      return (
                        <td key={v} className="px-4 py-3 text-right">
                          {esistente ? (
                            <button
                              onClick={() => setModal({ persona: p, voce: v, esistente })}
                              className="group inline-flex flex-col items-end"
                              title="Modifica o elimina"
                            >
                              <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                {fmt(esistente.importo)}
                              </span>
                              <span className="text-[10px] text-gray-400 group-hover:text-gray-600">
                                {esistente.data
                                  ? new Date(esistente.data).toLocaleDateString("it-IT")
                                  : "registrato"}
                              </span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setModal({ persona: p, voce: v, esistente: null })}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-pink-400 hover:text-pink-600 whitespace-nowrap"
                            >
                              <Plus className="w-3 h-3" />
                              {def > 0 ? fmt(def) : "registra"}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {fmt(totRiga(p))}
                    </td>
                  </tr>
                );
                  })}
                </Fragment>
              ))}
            </tbody>
            {persone.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-100">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Totale mese
                  </td>
                  {colonne.map((v) => (
                    <td key={v} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      {totCol(v) > 0 ? fmt(totCol(v)) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: "#e8308a" }}>
                    {fmt(totale)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {modal && (
        <PagamentoModal
          anno={anno}
          mese={mese}
          persona={modal.persona}
          voce={modal.voce}
          esistente={modal.esistente}
          onClose={() => setModal(null)}
          onDone={(t) => {
            setModal(null);
            notify(t);
            load();
          }}
        />
      )}
    </div>
  );
}

function PagamentoModal({
  anno,
  mese,
  persona,
  voce,
  esistente,
  onClose,
  onDone,
}: {
  anno: number;
  mese: number;
  persona: Persona;
  voce: Voce;
  esistente: Pagamento | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const def = importoDefault(persona, voce);
  const [importo, setImporto] = useState(
    esistente ? String(esistente.importo) : def > 0 ? String(def) : "",
  );
  const [data, setData] = useState(
    (esistente?.data ?? new Date().toISOString()).slice(0, 10),
  );
  const [note, setNote] = useState(esistente?.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const salva = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = esistente
        ? await fetch(`/api/pagamenti-mensili/${esistente.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ importo, data, note }),
          })
        : await fetch("/api/pagamenti-mensili", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dipendenteId: persona.id, anno, mese, voce, importo, data, note }),
          });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Salvataggio non riuscito");
        return;
      }
      onDone(esistente ? "Pagamento aggiornato" : "Pagamento registrato e spesa creata");
    } finally {
      setBusy(false);
    }
  };

  const elimina = async () => {
    if (!esistente) return;
    if (!confirm("Eliminare il pagamento e la spesa collegata?")) return;
    const res = await fetch(`/api/pagamenti-mensili/${esistente.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Eliminazione non riuscita");
      return;
    }
    onDone("Pagamento eliminato");
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {VOCI[voce].label} · {MESI[mese - 1]} {anno}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600">{nomeCompleto(persona)}</p>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Importo (€)</label>
          <input
            type="number"
            step="0.01"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
            className={inputCls}
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Data pagamento</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            {VOCI[voce].multiplo ? "Descrizione *" : "Note"}
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
            placeholder={VOCI[voce].multiplo ? "Es. rimborso carta, viaggio Milano…" : undefined}
          />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex items-center justify-between gap-2 pt-1">
          {esistente ? (
            <button
              onClick={elimina}
              className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" /> Elimina
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">
              Annulla
            </button>
            <button
              onClick={salva}
              disabled={busy || !importo || (!!VOCI[voce].multiplo && !note.trim())}
              className="glass-btn-primary text-white text-sm font-medium px-5 py-2 rounded-xl disabled:opacity-60"
            >
              {busy ? "Salvataggio…" : esistente ? "Salva" : "Registra"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

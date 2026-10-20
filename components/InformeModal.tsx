"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Send, X } from "lucide-react";
import Pills from "@/components/Pills";
import { ANNI, MESI, fmt } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ImpostazioniFatture } from "@/lib/impostazioni";
import {
  SEZIONI,
  etichettaPeriodo,
  intervallo,
  periodoPredefinito,
  suffissoFile,
  titoloInforme,
  type InformeDati,
  type Periodo,
  type Sezione,
  type TipoPeriodo,
} from "@/lib/informe";
import { informeExcel, informePdf } from "@/lib/informe-export";

// Informe per il commercialista: periodo (mese, trimestre, anno), anteprima
// dei totali, sezioni a spunta, Excel + PDF in spagnolo, invio via email
// dalla casella aziendale all'indirizzo messo in Configurazione.
export default function InformeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPredefinito());
  const [sezioni, setSezioni] = useState<Set<Sezione>>(() => new Set(SEZIONI.map((s) => s.key)));
  const [dati, setDati] = useState<InformeDati | null>(null);
  const [cfg, setCfg] = useState<ImpostazioniFatture | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [lavoro, setLavoro] = useState<"" | "excel" | "pdf" | "email">("");
  const [msg, setMsg] = useState<{ testo: string; ok: boolean } | null>(null);

  const { da, a } = useMemo(() => intervallo(periodo), [periodo]);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setCaricamento(true);
    fetch(`/api/informe?da=${da}&a=${a}`)
      .then((r) => r.json())
      .then((j) => {
        if (vivo) setDati(j?.riepilogo ? (j as InformeDati) : null);
      })
      .catch(() => {
        if (vivo) setDati(null);
      })
      .finally(() => {
        if (vivo) setCaricamento(false);
      });
    return () => {
      vivo = false;
    };
  }, [open, da, a]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/impostazioni/fatture")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const nomeFile = `informe_${suffissoFile(periodo)}`;
  const emittente = {
    ragioneSociale: cfg?.ragioneSociale ?? "Anda Agencia de Publicidad SL",
    nif: cfg?.nif ?? "",
    logoUrl: cfg?.logoUrl,
  };
  const toggleSezione = (k: Sezione) =>
    setSezioni((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const avvisa = (testo: string, ok = true) => {
    setMsg({ testo, ok });
    setTimeout(() => setMsg(null), 8000);
  };
  const pronto = !!dati && sezioni.size > 0 && !caricamento;

  const scaricaExcel = async () => {
    if (!dati) return;
    setLavoro("excel");
    try {
      (await informeExcel(dati, periodo, sezioni)).scarica(nomeFile);
    } finally {
      setLavoro("");
    }
  };
  const scaricaPdf = async () => {
    if (!dati) return;
    setLavoro("pdf");
    try {
      (await informePdf(dati, periodo, sezioni, emittente)).scarica(nomeFile);
    } finally {
      setLavoro("");
    }
  };
  const emailCommercialista = cfg?.commercialistaEmail?.trim() ?? "";
  const invia = async () => {
    if (!dati || !emailCommercialista) return;
    if (!confirm(`Inviare l'informe ${etichettaPeriodo(periodo)} a ${emailCommercialista} con PDF ed Excel allegati?`)) return;
    setLavoro("email");
    try {
      const [pdf, xlsx] = await Promise.all([
        informePdf(dati, periodo, sezioni, emittente),
        informeExcel(dati, periodo, sezioni),
      ]);
      const res = await fetch("/api/informe/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo: etichettaPeriodo(periodo), nomeFile, pdf: pdf.base64(), xlsx: xlsx.base64() }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) avvisa(`Informe inviato a ${j.a}`);
      else avvisa(j.error ?? "Invio non riuscito", false);
    } catch (e) {
      avvisa(e instanceof Error ? e.message : "Invio non riuscito", false);
    } finally {
      setLavoro("");
    }
  };

  const r = dati?.riepilogo;
  const Voce = ({ label, val, cls }: { label: string; val: string; cls?: string }) => (
    <div className="kv">
      <span className="k">{label}</span>
      <span className={cn("v", cls)}>{val}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-3xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Informe per il commercialista</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Registri del periodo in spagnolo, in PDF ed Excel: {titoloInforme(periodo).toLowerCase()} {etichettaPeriodo(periodo)}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Chiudi">
            <X className="w-4 h-4" />
          </button>
        </div>

        {msg && (
          <div className={cn("text-sm rounded-lg px-3 py-2 border", msg.ok ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad")}>
            {msg.testo}
          </div>
        )}

        {/* Periodo */}
        <div className="flex items-center gap-3 flex-wrap">
          <Pills<TipoPeriodo>
            value={periodo.tipo}
            onChange={(tipo) => setPeriodo((p) => ({ ...p, tipo }))}
            options={[
              { val: "mese", label: "Mese" },
              { val: "trimestre", label: "Trimestre" },
              { val: "anno", label: "Anno" },
            ]}
          />
          {periodo.tipo === "mese" && (
            <select value={periodo.mese} onChange={(e) => setPeriodo((p) => ({ ...p, mese: Number(e.target.value) }))} className="sel">
              {MESI.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          )}
          {periodo.tipo === "trimestre" && (
            <select value={periodo.trimestre} onChange={(e) => setPeriodo((p) => ({ ...p, trimestre: Number(e.target.value) }))} className="sel">
              {[1, 2, 3, 4].map((t) => (
                <option key={t} value={t}>{t}º trimestre ({MESI[(t - 1) * 3].slice(0, 3)}–{MESI[(t - 1) * 3 + 2].slice(0, 3)})</option>
              ))}
            </select>
          )}
          <select value={periodo.anno} onChange={(e) => setPeriodo((p) => ({ ...p, anno: Number(e.target.value) }))} className="sel">
            {Array.from(new Set([...ANNI, periodo.anno])).sort((x, y) => y - x).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">
            dal {new Date(`${da}T00:00:00Z`).toLocaleDateString("it-IT", { timeZone: "UTC" })} al {new Date(`${a}T00:00:00Z`).toLocaleDateString("it-IT", { timeZone: "UTC" })}
          </span>
        </div>

        {/* Anteprima */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="glass-card rounded-xl p-4">
            <h3 className="card-title">Facturas emitidas {r ? `(${r.nFatture})` : ""}</h3>
            {r ? (
              <div className="mt-2 space-y-1">
                <Voce label="Base imponible" val={fmt(r.base)} />
                <Voce label="Cuota IGIC" val={fmt(r.cuota)} />
                <Voce label="Total facturado" val={fmt(r.total)} cls="font-semibold text-gray-900" />
                <Voce label="Cobrado" val={fmt(r.cobrado)} cls="text-ok" />
                <Voce label="Pendiente" val={fmt(r.pendiente)} cls="text-warn" />
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-2">{caricamento ? "Carico…" : "Nessun dato"}</p>
            )}
          </section>
          <section className="glass-card rounded-xl p-4">
            <h3 className="card-title">Gastos y otros ingresos</h3>
            {r ? (
              <div className="mt-2 space-y-1">
                <Voce label={`Gastos (${r.nSpese})`} val={fmt(r.gastos)} cls="text-bad" />
                {r.gastosPerCategoria.slice(0, 5).map((c) => (
                  <Voce key={c.categoria} label={`· ${c.categoria}`} val={fmt(c.importo)} cls="text-gray-500" />
                ))}
                {r.gastosPerCategoria.length > 5 && (
                  <p className="text-[11px] text-gray-400">… e altre {r.gastosPerCategoria.length - 5} categorie nel file</p>
                )}
                <Voce label={`Otros ingresos (${r.nAltri})`} val={fmt(r.otros)} />
                <Voce label="Resultado" val={fmt(r.resultado)} cls={cn("font-semibold", r.resultado >= 0 ? "text-ok" : "text-bad")} />
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-2">{caricamento ? "Carico…" : "Nessun dato"}</p>
            )}
          </section>
        </div>

        {/* Sezioni */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cosa includere</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {SEZIONI.map((s) => (
              <label key={s.key} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer", sezioni.has(s.key) ? "border-brand/40 bg-brand/5" : "border-gray-200")}>
                <input type="checkbox" checked={sezioni.has(s.key)} onChange={() => toggleSezione(s.key)} className="mt-0.5" style={{ accentColor: "#e8308a" }} />
                <span>
                  <span className="text-sm font-medium text-gray-800 block">{s.label}</span>
                  <span className="text-[11px] text-gray-500">{s.sotto}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-gray-400">
          Le fatture entrano per data di emissione; spese e altri ingressi per mese di competenza. Le spese hanno solo l&apos;importo pagato, senza base e IGIC separati.
          {cfg && !emailCommercialista && " Per inviare dall'app, metti l'email del commercialista in Configurazione › Fatturazione › Commercialista."}
        </p>

        <div className="flex gap-3 pt-1 flex-wrap">
          <button onClick={onClose} className="btn btn-secondary flex-1">Chiudi</button>
          <button onClick={scaricaExcel} disabled={!pronto || !!lavoro} className="btn btn-secondary flex-1 disabled:opacity-60">
            <FileSpreadsheet className="w-4 h-4 text-ok" /> {lavoro === "excel" ? "Preparo…" : "Excel"}
          </button>
          <button onClick={scaricaPdf} disabled={!pronto || !!lavoro} className="btn btn-secondary flex-1 disabled:opacity-60">
            <Download className="w-4 h-4" /> {lavoro === "pdf" ? "Preparo…" : "PDF"}
          </button>
          <button
            onClick={invia}
            disabled={!pronto || !!lavoro || !emailCommercialista}
            className="btn btn-primary flex-1 disabled:opacity-60"
            title={emailCommercialista ? `Invia PDF ed Excel a ${emailCommercialista}` : "Manca l'email del commercialista in Configurazione"}
          >
            <Send className="w-4 h-4" /> {lavoro === "email" ? "Invio…" : "Invia al commercialista"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  Check,
  Download,
  Send,
  Phone,
} from "lucide-react";
import { fmt, MESI, AZIENDE } from "@/lib/constants";
import { exportPDF } from "@/lib/export";
import { useAnno } from "@/lib/anno-context";
import { compilaTesto, type ImpostazioniFatture } from "@/lib/impostazioni";
import { cn } from "@/lib/utils";

interface Fattura {
  id: number;
  numero: string | null;
  importo: number;
  pagato: boolean;
  mese: number;
  anno: number;
  scadenza: string | null;
  azienda: string;
  cliente: { nome: string; paese: string; email: string | null } | null;
  acconti?: { id: number; importo: number }[];
  solleciti?: { id: number; data: string; canale: string }[];
  _count?: { solleciti: number };
}

type Stato = "scaduta" | "urgente" | "prossima" | "ok";

const giorniA = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

function classifica(f: Fattura): Stato {
  if (!f.scadenza || f.pagato) return "ok";
  const g = giorniA(f.scadenza);
  if (g < 0) return "scaduta";
  if (g <= 7) return "urgente";
  if (g <= 30) return "prossima";
  return "ok";
}

const STATI: Record<Stato, { label: string; pill: string }> = {
  scaduta: { label: "Scaduta", pill: "pill-late" },
  urgente: { label: "Urgente", pill: "pill-wait" },
  prossima: { label: "Prossima", pill: "pill-info" },
  ok: { label: "Lontana", pill: "pill-off" },
};

const sumAcc = (f: Fattura) => (f.acconti ?? []).reduce((s, a) => s + a.importo, 0);
const residuo = (f: Fattura) => Math.max(0, f.importo - sumAcc(f));

export default function ScadenzePage() {
  const { anno } = useAnno();
  const [fatture, setFatture] = useState<Fattura[]>([]);
  const [cfg, setCfg] = useState<ImpostazioniFatture | null>(null);
  const [filtroAzienda, setFiltroAzienda] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroStato, setFiltroStato] = useState<"tutte" | Stato>("tutte");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (anno > 0) params.set("anno", String(anno));
    if (filtroAzienda) params.set("azienda", filtroAzienda);
    const data = await (await fetch(`/api/fatture?${params}`)).json();
    const arr: Fattura[] = Array.isArray(data) ? data : [];
    setFatture(arr.filter((f) => !f?.pagato && f?.scadenza));
  }, [anno, filtroAzienda]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetch("/api/impostazioni/fatture")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => {});
  }, []);

  const notify = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 3500);
  };

  const withStato = useMemo(
    () => fatture.map((f) => ({ ...f, stato: classifica(f) })),
    [fatture],
  );
  const scadute = withStato.filter((f) => f.stato === "scaduta");
  const urgenti = withStato.filter((f) => f.stato === "urgente");
  const prossime = withStato.filter((f) => f.stato === "prossima");
  const maiSollecitate = scadute.filter((f) => !(f._count?.solleciti ?? 0));

  const filtered = withStato
    .filter((f) => {
      if (filtroStato === "tutte" ? f.stato === "ok" : f.stato !== filtroStato) return false;
      if (filtroCliente && f.cliente?.nome !== filtroCliente) return false;
      return true;
    })
    .sort((a, b) => {
      // scadute prima (più vecchie in cima), poi per scadenza più vicina
      const ga = giorniA(a.scadenza!);
      const gb = giorniA(b.scadenza!);
      return ga - gb;
    });

  const clientiUnici = Array.from(
    new Set(fatture.map((f) => f.cliente?.nome).filter((n): n is string => !!n)),
  ).sort((a, b) => a.localeCompare(b, "it"));

  const filteredIds = useMemo(() => filtered.map((f) => f.id), [filtered]);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });

  // ── Azioni ────────────────────────────────────────────────────────────
  const registraSollecito = async (f: Fattura, canale: "email" | "telefono") => {
    const res = await fetch(`/api/fatture/${f.id}/solleciti`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canale }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      notify(
        j.totale === 1
          ? `Primo sollecito registrato per ${f.cliente?.nome ?? "la fattura"}`
          : `Sollecito registrato (è il n° ${j.totale})`,
      );
      load();
    } else notify(j.error ?? "Registrazione non riuscita");
  };

  const mailtoSollecito = (f: Fattura) => {
    if (!cfg || !f.cliente?.email) return null;
    const es = (f.cliente.paese ?? "").toLowerCase() === "spagna";
    const v = {
      cliente: f.cliente.nome,
      numero: f.numero ?? "",
      importo: fmt(residuo(f)),
      scadenza: f.scadenza ? new Date(f.scadenza).toLocaleDateString(es ? "es-ES" : "it-IT") : "",
      iban: cfg.iban,
      azienda: cfg.ragioneSociale,
    };
    const subject = compilaTesto(es ? cfg.sollecitoOggettoEs : cfg.sollecitoOggettoIt, v);
    const body = compilaTesto(es ? cfg.sollecitoTestoEs : cfg.sollecitoTestoIt, v);
    return `mailto:${f.cliente.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const sollecita = (f: Fattura) => {
    const href = mailtoSollecito(f);
    if (!href) return;
    window.location.href = href;
    registraSollecito(f, "email");
  };

  const telefonata = (f: Fattura) => {
    if (!confirm(`Registrare un sollecito telefonico per ${f.cliente?.nome ?? "la fattura"}?`)) return;
    registraSollecito(f, "telefono");
  };

  const segnaPagata = async (f: Fattura) => {
    if (!confirm(`Segnare pagata la fattura ${f.numero ?? ""} di ${f.cliente?.nome ?? ""}?`)) return;
    await fetch(`/api/fatture/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagato: true }),
    });
    load();
  };

  const exportPDFAction = async () => {
    const rows = filtered.filter((f) => selected.has(f.id));
    if (rows.length === 0) return;
    const totaleResiduo = rows.reduce((s, f) => s + residuo(f), 0);
    await exportPDF(
      `Scadenze — ${new Date().toLocaleDateString("it-IT")}`,
      ["Cliente", "N°", "Importo", "Residuo", "Scadenza", "Giorni", "Stato"],
      rows.map((f) => [
        f.cliente?.nome ?? "—",
        f.numero ?? "—",
        fmt(f.importo),
        fmt(residuo(f)),
        f.scadenza ? new Date(f.scadenza).toLocaleDateString("it-IT") : "—",
        String(giorniA(f.scadenza!)),
        STATI[f.stato].label,
      ]),
      `scadenze_${new Date().toISOString().slice(0, 10)}`,
      { footRows: [["TOTALE RESIDUO", "", "", fmt(totaleResiduo), "", "", ""]] },
    );
  };

  const kpi = [
    { label: "Scadute", rows: scadute, color: "#ef4444", icon: AlertTriangle },
    { label: "Urgenti (7 gg)", rows: urgenti, color: "#f59e0b", icon: Clock },
    { label: "Prossime (30 gg)", rows: prossime, color: "#3b82f6", icon: Clock },
  ];

  return (
    <div className="space-y-6">
      {msg && (
        <div className="text-sm rounded-lg px-3 py-2 border bg-ok/10 border-ok/30 text-ok">
          {msg}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scadenze</h1>
          <p className="text-gray-500 text-sm mt-1">Fatture non pagate con data di scadenza</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filtroAzienda}
            onChange={(e) => setFiltroAzienda(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">Tutte le aziende</option>
            {AZIENDE.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 max-w-[220px]"
          >
            <option value="">Tutti i clienti</option>
            {clientiUnici.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {kpi.map((k) => (
          <div key={k.label} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <k.icon className="w-4 h-4" style={{ color: k.color }} />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k.label}</p>
            </div>
            <p className="text-2xl font-bold mt-1" style={{ color: k.color }}>
              {fmt(k.rows.reduce((s, f) => s + residuo(f), 0))}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {k.rows.length} {k.rows.length === 1 ? "fattura" : "fatture"}
            </p>
          </div>
        ))}
      </div>

      {maiSollecitate.length > 0 && (
        <div className="text-sm rounded-xl px-4 py-3 border bg-warn/10 border-warn/30 text-warn flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {maiSollecitate.length} {maiSollecitate.length === 1 ? "fattura scaduta non è mai stata sollecitata" : "fatture scadute non sono mai state sollecitate"}
          {" · "}
          {fmt(maiSollecitate.reduce((s, f) => s + residuo(f), 0))}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { val: "tutte", label: `Tutte le pendenti (${scadute.length + urgenti.length + prossime.length})` },
            { val: "scaduta", label: `Scadute (${scadute.length})` },
            { val: "urgente", label: `Urgenti (${urgenti.length})` },
            { val: "prossima", label: `Prossime (${prossime.length})` },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setFiltroStato(val as typeof filtroStato)}
              className="text-sm px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={filtroStato === val ? { background: "#e8308a", color: "#fff" } : { color: "#6b7280" }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleAll}
            disabled={filteredIds.length === 0}
            className="text-sm border border-gray-200 text-gray-600 font-medium px-3 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            {allSelected ? "Deseleziona tutto" : "Seleziona tutto"}
          </button>
          <button
            onClick={exportPDFAction}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-bad" />
            Esporta PDF{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center">
          <CheckCircle className="w-12 h-12 text-ok mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Nessuna scadenza pendente</p>
          <p className="text-gray-400 text-sm mt-1">Tutte le fatture con scadenza sono in ordine</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: "#e8308a" }} />
                  </th>
                  {["Cliente", "N° fattura", "Residuo", "Scadenza", "Giorni", "Stato", "Ultimo sollecito", ""].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3",
                        h === "Residuo" || h === "Giorni" ? "text-right" : "text-left",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="zebra">
                {filtered.map((f) => {
                  const g = giorniA(f.scadenza!);
                  const n = f._count?.solleciti ?? 0;
                  const ultimo = f.solleciti?.[0];
                  const acc = sumAcc(f);
                  const email = f.cliente?.email;
                  return (
                    <tr key={f.id} className="border-b border-gray-50 align-middle">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(f.id)}
                          onChange={() => toggleOne(f.id)}
                          style={{ accentColor: "#e8308a" }}
                          aria-label={`Seleziona ${f.cliente?.nome ?? ""}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">{f.cliente?.nome ?? "—"}</div>
                        <div className="text-[11px] text-gray-400">
                          {email ?? "nessuna email"} · {MESI[f.mese - 1]} {f.anno}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">{f.numero ?? "—"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">{fmt(residuo(f))}</div>
                        {acc > 0 && <div className="text-[10px] text-warn">acconto {fmt(acc)} su {fmt(f.importo)}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {new Date(f.scadenza!).toLocaleDateString("it-IT")}
                      </td>
                      <td className={cn("px-4 py-3 text-sm text-right font-semibold whitespace-nowrap", g < 0 ? "text-bad" : "text-gray-700")}>
                        {g > 0 ? `+${g}` : g} gg
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-md border", STATI[f.stato].pill)}>
                          {STATI[f.stato].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {ultimo ? (
                          <>
                            {new Date(ultimo.data).toLocaleDateString("it-IT")}{" "}
                            <span className="text-gray-400">({n}{ultimo.canale !== "email" ? ` · ${ultimo.canale}` : ""})</span>
                          </>
                        ) : f.stato === "scaduta" ? (
                          <span className="pill-wait text-[11px] font-semibold px-2 py-0.5 rounded-md">
                            mai sollecitata
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => sollecita(f)}
                            disabled={!email || !cfg}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 disabled:opacity-30 disabled:cursor-not-allowed"
                            title={email ? "Sollecita via email (apre la posta e registra il sollecito)" : "Il cliente non ha un'email"}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => telefonata(f)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            title="Registra sollecito telefonico"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => segnaPagata(f)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-ok hover:bg-ok/10"
                            title="Segna pagata"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {withStato.some((f) => f.stato === "ok") && filtroStato === "tutte" && (
        <p className="text-xs text-gray-400">
          {withStato.filter((f) => f.stato === "ok").length} fatture oltre i 30 giorni non sono mostrate nelle pendenti.
        </p>
      )}
    </div>
  );
}

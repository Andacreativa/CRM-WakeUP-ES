"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  X,
} from "lucide-react";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { BRAND, fmt } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Evento } from "@/lib/calendario";

// Calendario: fatture da emettere (richieste, nel giorno previsto di
// emissione) e scadenze delle fatture, con i domini in più a scelta. Gli
// eventi vengono da /api/calendario, calcolati ogni volta dai dati: nessuna
// tabella da tenere aggiornata. Griglia mensile da tablet in su, lista dei
// prossimi 30 giorni sempre.

const pad = (n: number) => String(n).padStart(2, "0");
const chiave = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const piuGiorni = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
// Settimana da lunedì
const inizioSettimana = (d: Date) => piuGiorni(d, -((d.getDay() + 6) % 7));
const daChiave = (s: string) => {
  const [y, m, g] = s.split("-").map(Number);
  return new Date(y, m - 1, g);
};
const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dataLunga = (s: string) =>
  maiuscola(daChiave(s).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));

type Mostra = { richieste: boolean; scadenze: boolean; pagate: boolean; domini: boolean };
const LEGENDA: { key: keyof Mostra; label: string; cls: string; titolo: string }[] = [
  { key: "richieste", label: "Da emettere", cls: "tag-brand", titolo: "Richieste di fattura nel giorno previsto di emissione" },
  { key: "scadenze", label: "Scadenze", cls: "tag-soft-warn", titolo: "Fatture non pagate alla data di scadenza (rosse se già scadute)" },
  { key: "pagate", label: "Pagate", cls: "tag-soft-off", titolo: "Fatture già incassate, per vedere la storia del mese" },
  { key: "domini", label: "Domini", cls: "tag-soft-info", titolo: "Scadenze dei domini (Sales › Rinnovi siti)" },
];

const stileChip = (e: Evento) => {
  if (e.tipo === "richiesta") return "tag-brand";
  if (e.tipo === "dominio") return "tag-soft-info";
  if (e.stato === "pagata") return "tag-soft-off";
  return e.stato === "scaduta" ? "tag-soft-bad" : "tag-soft-warn";
};
const tipoLabel = (e: Evento) =>
  e.tipo === "richiesta"
    ? e.stato === "in_attesa"
      ? "Da emettere · da validare"
      : "Da emettere"
    : e.tipo === "dominio"
      ? "Dominio"
      : e.stato === "pagata"
        ? "Pagata"
        : e.stato === "scaduta"
          ? "Scaduta"
          : "Scadenza";
const importoEvento = (e: Evento) => (e.tipo === "scadenza" && e.stato !== "pagata" ? (e.residuo ?? e.importo) : e.importo);
const aperto = (e: Evento) => !(e.tipo === "scadenza" && e.stato === "pagata");

export default function CalendarioPage() {
  const oggi = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const oggiK = chiave(oggi);
  const [cursore, setCursore] = useState(() => new Date(oggi.getFullYear(), oggi.getMonth(), 1));
  const [mostra, setMostra] = useState<Mostra>({ richieste: true, scadenze: true, pagate: true, domini: false });
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [senzaData, setSenzaData] = useState<Evento[]>([]);
  const [icalUrl, setIcalUrl] = useState<string | null>(null);
  const [giornoSel, setGiornoSel] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Celle della griglia: dal lunedì della prima settimana alla domenica dell'ultima
  const celle = useMemo(() => {
    const primo = new Date(cursore.getFullYear(), cursore.getMonth(), 1);
    const ultimo = new Date(cursore.getFullYear(), cursore.getMonth() + 1, 0);
    const start = inizioSettimana(primo);
    const end = piuGiorni(inizioSettimana(ultimo), 6);
    const out: Date[] = [];
    for (let d = start; d <= end; d = piuGiorni(d, 1)) out.push(d);
    return out;
  }, [cursore]);

  const load = useCallback(async () => {
    setCaricamento(true);
    const start = celle[0] < oggi ? celle[0] : oggi;
    const fine30 = piuGiorni(oggi, 30);
    const end = celle[celle.length - 1] > fine30 ? celle[celle.length - 1] : fine30;
    const params = new URLSearchParams({ da: chiave(start), a: chiave(end), domini: "1" });
    try {
      const r = await fetch(`/api/calendario?${params}`);
      const j = await r.json();
      setEventi(Array.isArray(j?.eventi) ? j.eventi : []);
      setSenzaData(Array.isArray(j?.senzaData) ? j.senzaData : []);
      setIcalUrl(j?.icalUrl ?? null);
    } finally {
      setCaricamento(false);
    }
  }, [celle, oggi]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setGiornoSel(null);
  }, [cursore]);

  const visibile = useCallback(
    (e: Evento) => {
      if (e.tipo === "richiesta") return mostra.richieste;
      if (e.tipo === "dominio") return mostra.domini;
      return e.stato === "pagata" ? mostra.pagate : mostra.scadenze;
    },
    [mostra],
  );
  const perGiorno = useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const e of eventi) {
      if (!visibile(e)) continue;
      const l = m.get(e.data) ?? [];
      l.push(e);
      m.set(e.data, l);
    }
    return m;
  }, [eventi, visibile]);

  // Contatori del mese mostrato
  const meseK = `${cursore.getFullYear()}-${pad(cursore.getMonth() + 1)}`;
  const delMese = eventi.filter((e) => e.data.startsWith(meseK));
  const daEmettere = delMese.filter((e) => e.tipo === "richiesta");
  const inScadenza = delMese.filter((e) => e.tipo === "scadenza" && e.stato === "aperta");
  const scadute = delMese.filter((e) => e.tipo === "scadenza" && e.stato === "scaduta");
  const somma = (l: Evento[]) => l.reduce((s, e) => s + importoEvento(e), 0);

  const prossimi = useMemo(() => {
    const fine = chiave(piuGiorni(oggi, 30));
    return eventi.filter((e) => e.data >= oggiK && e.data <= fine && aperto(e) && visibile(e));
  }, [eventi, oggi, oggiK, visibile]);

  const vaiMese = (n: number) => setCursore((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const titoloMese = maiuscola(cursore.toLocaleDateString("it-IT", { month: "long", year: "numeric" }));

  const copiaIcal = async () => {
    if (!icalUrl) return;
    try {
      await navigator.clipboard.writeText(icalUrl);
      setMsg(
        "Indirizzo copiato. In Google Calendar: Altri calendari › + › Da URL. In Apple Calendar: File › Nuova sottoscrizione calendario. Il feed si aggiorna da solo.",
      );
    } catch {
      setMsg(`Copia questo indirizzo nel tuo calendario: ${icalUrl}`);
    }
    setTimeout(() => setMsg(null), 12000);
  };

  const Riga = ({ e }: { e: Evento }) => (
    <li className="flex items-center gap-3 py-2">
      <span className={cn("tag shrink-0", stileChip(e))}>{tipoLabel(e)}</span>
      <Link href={e.href} className="min-w-0 flex-1 group">
        <span className="tbl-primary group-hover:text-brand truncate block">{e.titolo}</span>
        <span className="tbl-muted truncate block">
          {e.dettaglio}
          {e.tipo === "scadenza" && e.solleciti ? ` · ${e.solleciti} ${e.solleciti === 1 ? "sollecito" : "solleciti"}` : ""}
        </span>
      </Link>
      <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">{fmt(importoEvento(e))}</span>
      <Link href={e.href} className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10" title="Apri">
        <ArrowRight className="w-4 h-4" />
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      {msg && (
        <div className="text-sm rounded-lg px-3 py-2 border bg-ok/10 border-ok/30 text-ok break-all">{msg}</div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Calendario</h1>
          <p className="page-sub">Fatture da emettere e scadenze, giorno per giorno</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={copiaIcal} disabled={!icalUrl} className="btn btn-secondary" title="Copia l'indirizzo del feed iCal da aggiungere a Google Calendar o Apple Calendar">
            <Link2 className="w-4 h-4" /> Aggiungi al tuo calendario
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => vaiMese(-1)} className="btn btn-secondary btn-sm" title="Mese precedente" aria-label="Mese precedente">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[150px] text-center text-sm font-semibold text-gray-800">{titoloMese}</span>
            <button onClick={() => vaiMese(1)} className="btn btn-secondary btn-sm" title="Mese successivo" aria-label="Mese successivo">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCursore(new Date(oggi.getFullYear(), oggi.getMonth(), 1))}
              className="btn btn-secondary btn-sm"
            >
              Oggi
            </button>
          </div>
        </div>
      </div>

      <KpiGrid cols={3}>
        <Kpi label="Da emettere" value={fmt(somma(daEmettere))} color={BRAND} icon={CalendarDays} sub={`${daEmettere.length} ${daEmettere.length === 1 ? "richiesta" : "richieste"} nel mese`} />
        <Kpi label="In scadenza" value={fmt(somma(inScadenza))} color="#f59e0b" icon={Clock} sub={`${inScadenza.length} ${inScadenza.length === 1 ? "fattura" : "fatture"} nel mese`} />
        <Kpi label="Scadute" value={fmt(somma(scadute))} color="#ef4444" icon={AlertTriangle} sub={`${scadute.length} ${scadute.length === 1 ? "fattura" : "fatture"} nel mese`} />
      </KpiGrid>

      {senzaData.length > 0 && (
        <div className="text-sm rounded-xl px-4 py-3 border bg-warn/10 border-warn/30 text-warn">
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {senzaData.length === 1
              ? "1 richiesta di fattura senza data prevista di emissione: non compare nel calendario"
              : `${senzaData.length} richieste di fattura senza data prevista di emissione: non compaiono nel calendario`}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {senzaData.map((e) => (
              <Link key={e.id} href={e.href} className="tag tag-outline hover:border-brand hover:text-brand" title={`${e.dettaglio} · ${fmt(e.importo)}`}>
                {e.titolo} · {fmt(e.importo)}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {LEGENDA.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setMostra((m) => ({ ...m, [l.key]: !m[l.key] }))}
              className={cn("tag", l.cls, !mostra[l.key] && "opacity-40")}
              title={l.titolo}
              aria-pressed={mostra[l.key]}
            >
              {mostra[l.key] && <Check />} {l.label}
            </button>
          ))}
        </div>
        {caricamento && <span className="text-xs text-gray-400">Carico…</span>}
      </div>

      {/* Griglia mensile (da tablet in su) */}
      <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {GIORNI.map((g) => (
            <div key={g} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 text-center">
              {g}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {celle.map((d, i) => {
            const k = chiave(d);
            const lista = perGiorno.get(k) ?? [];
            const fuoriMese = d.getMonth() !== cursore.getMonth();
            const isOggi = k === oggiK;
            const totale = lista.filter(aperto).reduce((s, e) => s + importoEvento(e), 0);
            const MAX = 3;
            return (
              <div
                key={k}
                className={cn(
                  "min-h-[112px] p-1.5 border-gray-100 flex flex-col gap-1",
                  i % 7 !== 0 && "border-l",
                  i >= 7 && "border-t",
                  fuoriMese && "bg-gray-50/70",
                  giornoSel === k && "ring-1 ring-inset ring-brand",
                )}
              >
                <button
                  type="button"
                  onClick={() => setGiornoSel(giornoSel === k ? null : k)}
                  className={cn(
                    "self-start text-xs font-semibold w-6 h-6 rounded-full inline-flex items-center justify-center",
                    isOggi ? "bg-brand text-white" : fuoriMese ? "text-gray-300" : "text-gray-600 hover:bg-gray-100",
                  )}
                  title="Vedi il giorno"
                >
                  {d.getDate()}
                </button>
                {lista.slice(0, MAX).map((e) => (
                  <Link
                    key={`${e.tipo}-${e.id}`}
                    href={e.href}
                    className={cn("tag max-w-full", stileChip(e), fuoriMese && "opacity-70")}
                    title={`${tipoLabel(e)} · ${e.dettaglio} · ${fmt(importoEvento(e))}`}
                  >
                    <span className="truncate">{e.titolo}</span>
                    <span className="shrink-0 font-normal">{fmt(importoEvento(e)).replace(/,\d\d/, "")}</span>
                  </Link>
                ))}
                {lista.length > MAX && (
                  <button type="button" onClick={() => setGiornoSel(k)} className="self-start text-[11px] text-gray-500 hover:text-brand px-1">
                    +{lista.length - MAX} {lista.length - MAX === 1 ? "altro" : "altri"}
                  </button>
                )}
                {totale > 0 && lista.length > 0 && (
                  <div className="mt-auto text-[10px] text-gray-400 text-right pr-1">{fmt(totale)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {giornoSel && (
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="card-title">{dataLunga(giornoSel)}</h2>
            <button onClick={() => setGiornoSel(null)} className="btn btn-ghost btn-sm" aria-label="Chiudi">
              <X className="w-4 h-4" />
            </button>
          </div>
          {(perGiorno.get(giornoSel) ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 mt-2">Niente in questo giorno.</p>
          ) : (
            <ul className="divide-y divide-gray-100 mt-1">
              {(perGiorno.get(giornoSel) ?? []).map((e) => (
                <Riga key={`${e.tipo}-${e.id}`} e={e} />
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="glass-card rounded-2xl p-4">
        <h2 className="card-title">Prossimi 30 giorni</h2>
        {prossimi.length === 0 ? (
          <p className="text-sm text-gray-400 mt-2">Niente da emettere né in scadenza nei prossimi 30 giorni.</p>
        ) : (
          <ul className="mt-1">
            {prossimi.map((e, i) => {
              const nuovoGiorno = i === 0 || prossimi[i - 1].data !== e.data;
              const gg = Math.round((daChiave(e.data).getTime() - oggi.getTime()) / 86400000);
              return (
                <li key={`${e.tipo}-${e.id}`}>
                  {nuovoGiorno && (
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 pt-3 pb-1 border-b border-gray-100">
                      {dataLunga(e.data)}
                      <span className="font-normal normal-case tracking-normal"> · {gg === 0 ? "oggi" : gg === 1 ? "domani" : `fra ${gg} giorni`}</span>
                    </div>
                  )}
                  <ul>
                    <Riga e={e} />
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

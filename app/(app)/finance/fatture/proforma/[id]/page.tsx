"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Calendar,
  Clock,
  Copy,
  FileDown,
  Mail,
  Pencil,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { dataIt } from "@/lib/fatture";
import { scadutaProforma, type ProformaDettaglio } from "@/lib/proforma";
import type { ImpostazioniFatture } from "@/lib/impostazioni";
import { totaliFattura, vociFattura } from "@/lib/fattura-pdf";
import { inviaProformaMail, scaricaProformaPDF } from "@/lib/proforma-pdf";
import ProformaFormModal from "@/components/fatture/ProformaFormModal";
import { PillProforma } from "@/components/fatture/ProformaLista";

// Scheda della proforma: come quella della fattura, senza incassi né
// VeriFactu. L'azione principale è «Crea fattura», che ne fa una bozza.

export default function ProformaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<ProformaDettaglio | null>(null);
  const [cfg, setCfg] = useState<ImpostazioniFatture | null>(null);
  const [form, setForm] = useState<"modifica" | "duplica" | null>(null);
  const [busy, setBusy] = useState(false);

  const carica = useCallback(
    (): Promise<ProformaDettaglio | null> => fetch(`/api/proforma/${id}`).then((r) => (r.ok ? r.json() : null)),
    [id],
  );
  useEffect(() => {
    carica().then((d) => (d ? setP(d) : router.replace("/finance/fatture?tab=proforma")));
  }, [carica, router]);
  useEffect(() => {
    fetch("/api/impostazioni/fatture")
      .then((r) => (r.ok ? r.json() : null))
      .then(setCfg)
      .catch(() => {});
  }, []);
  const load = async () => {
    const d = await carica();
    if (d) setP(d);
  };

  if (!p) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const aperta = p.stato === "aperta";
  const scaduta = scadutaProforma(p);
  const tot = totaliFattura(p);
  const voci = vociFattura(p);
  const c = p.cliente;
  const indirizzo = [c?.via, [c?.cap, c?.citta, c?.provincia ? `(${c.provincia})` : ""].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const commerciale = p.commercialeRef
    ? [`${p.commercialeRef.nome}${p.commercialeRef.cognome ? ` ${p.commercialeRef.cognome}` : ""}`, p.commercialeRef.email]
        .filter(Boolean)
        .join(" · ")
    : null;

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/finance/fatture?tab=proforma");
  };
  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/proforma/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(`Operazione non riuscita: ${j.error ?? res.status}`);
    setP(j);
  };
  const annulla = () => {
    if (confirm(`Annullare la proforma ${p.numero}? Resta visibile come annullata e si può ripristinare.`))
      patch({ stato: "annullata" });
  };
  const ripristina = () => {
    if (confirm(`Ripristinare la proforma ${p.numero}? Torna aperta.`)) patch({ stato: "aperta" });
  };
  const creaFattura = async () => {
    if (
      busy ||
      !confirm(
        `Creare la fattura dalla proforma ${p.numero}?\n\nNasce una bozza di fattura con gli stessi cliente, righe e imposta: la controlli e la emetti dalla sua scheda. La proforma non si modifica più.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/proforma/${p.id}/converti`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return alert(j.error ?? `Errore ${res.status}`);
      router.push(`/finance/fatture/${j.fattura.id}`);
    } finally {
      setBusy(false);
    }
  };
  const scaricaPdf = async () => {
    if (!cfg) return;
    try {
      await scaricaProformaPDF(p, cfg);
    } catch {
      alert("Non sono riuscito a creare il PDF della proforma.");
    }
  };
  const inviaMail = async () => {
    try {
      if (await inviaProformaMail(p.id)) load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Non sono riuscito a inviare la proforma.");
    }
  };

  return (
    <div className="space-y-5">
      {/* Testata */}
      <div>
        <h1 className="page-title">
          Proforma <em className="italic font-semibold text-gray-400 text-[20px]">{p.numero}</em>
        </h1>
        <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-[13px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Del {dataIt(p.data)}
          </span>
          {p.validaFino && (
            <span className={cn("inline-flex items-center gap-1.5", scaduta && "text-bad font-medium")}>
              <Clock className="w-3.5 h-3.5" /> Valida fino al {dataIt(p.validaFino)}
            </span>
          )}
          <PillProforma p={p} />
          {c?.paese && <span className="tag tag-neutral">{c.paese}</span>}
          {p.inviata && (
            <span className="tag tag-soft-info">Inviata{p.dataInvio ? ` il ${dataIt(p.dataInvio)}` : ""}</span>
          )}
          <span className="tag tag-soft-off" title="Non va a VeriFactu e non entra nel fatturato">
            Senza valore fiscale
          </span>
        </div>
      </div>

      {/* Azioni */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={indietro} className="btn btn-secondary">
          <ArrowLeft /> Indietro
        </button>
        {aperta && (
          <button onClick={() => setForm("modifica")} className="btn btn-secondary">
            <Pencil /> Modifica
          </button>
        )}
        {aperta && (
          <button
            onClick={annulla}
            className="btn btn-secondary text-bad hover:text-bad"
            title="La proforma resta visibile come annullata"
          >
            <Ban /> Annulla
          </button>
        )}
        {p.stato === "annullata" && (
          <button onClick={ripristina} className="btn btn-secondary">
            <RotateCcw /> Ripristina
          </button>
        )}
        <button onClick={scaricaPdf} disabled={!cfg} className="btn btn-secondary">
          <FileDown /> Scarica PDF
        </button>
        {p.stato !== "annullata" && (
          <button
            onClick={inviaMail}
            disabled={!c?.email}
            className="btn btn-secondary"
            title={
              c?.email
                ? `Invia la proforma a ${c.email}${p.inviata && p.dataInvio ? ` (già inviata il ${dataIt(p.dataInvio)})` : ""}`
                : "Il cliente non ha un indirizzo email: completare l'anagrafica"
            }
          >
            <Mail /> {p.inviata ? "Reinvia email" : "Invia email"}
          </button>
        )}
        <button
          onClick={() => setForm("duplica")}
          className="btn btn-secondary"
          title="Prepara una nuova proforma copiando questa"
        >
          <Copy /> Duplica
        </button>
        {aperta && (
          <button
            onClick={creaFattura}
            disabled={busy}
            className="btn btn-primary"
            title="Crea una bozza di fattura con questi dati"
          >
            <Receipt /> Crea fattura
          </button>
        )}
        {p.fattura && (
          <Link href={`/finance/fatture/${p.fattura.id}`} className="btn btn-primary">
            <Receipt /> Vai alla fattura {p.fattura.numero ?? "(bozza)"}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Intestatario</h2>
            <div className="kv">
              <div className="k">Cliente</div>
              <div className="v">
                {c ? (
                  <Link href={`/crm/clienti/${c.id}`} className="hover:text-brand hover:underline">
                    {c.nome}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
              {c?.email && (
                <>
                  <div className="k">Email</div>
                  <div className="v">{c.email}</div>
                </>
              )}
              {indirizzo && (
                <>
                  <div className="k">Indirizzo</div>
                  <div className="v">{indirizzo}</div>
                </>
              )}
              {c?.partitaIva && (
                <>
                  <div className="k">P.IVA</div>
                  <div className="v">{c.partitaIva}</div>
                </>
              )}
              <div className="k">Commerciale</div>
              <div className="v">{commerciale || "—"}</div>
              <div className="k">Competenza</div>
              <div className="v">
                {MESI[p.mese - 1]} {p.anno}
              </div>
            </div>
          </section>

          <section className="glass-card rounded-2xl p-6">
            <h2 className="card-title">Voci</h2>
            {p.descrizione && <p className="text-[13px] text-gray-600 mb-3">{p.descrizione}</p>}
            <table className="tbl">
              <thead>
                <tr>
                  <th>Descrizione</th>
                  <th className="text-right">Qtà</th>
                  <th className="text-right">Prezzo</th>
                  <th className="text-right">IGIC</th>
                  <th className="text-right">Imponibile</th>
                </tr>
              </thead>
              <tbody>
                {voci.map((v, i) => (
                  <tr key={i}>
                    <td className="text-gray-900">{v.descrizione}</td>
                    <td className="text-right">{v.quantita}</td>
                    <td className="text-right whitespace-nowrap">{fmt(v.prezzo)}</td>
                    <td className="text-right">{p.iva}%</td>
                    <td className="text-right whitespace-nowrap">{fmt(v.imponibile)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 ml-auto max-w-[320px] text-[13px] text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Imponibile</span>
                <span>{fmt(tot.imponibile)}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  {p.iva > 0
                    ? `IGIC ${p.iva}%`
                    : `IGIC ${p.causaIgic?.startsWith("N") ? "non soggetta" : "esente"}${p.causaIgic ? ` (${p.causaIgic})` : ""}`}
                </span>
                <span>{fmt(tot.imposta)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-brand pt-2.5 text-base font-bold text-brand">
                <span>Totale</span>
                <span>{fmt(tot.totale)}</span>
              </div>
            </div>
          </section>

          {p.note && (
            <section className="glass-card rounded-2xl p-6">
              <h2 className="card-title">Note interne</h2>
              <p className="text-[13px] text-gray-700 whitespace-pre-line">{p.note}</p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Fattura</h2>
            {p.fattura ? (
              <Link
                href={`/finance/fatture/${p.fattura.id}`}
                className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 hover:bg-brand/10"
              >
                <Receipt className="w-4 h-4 text-brand shrink-0" />
                <span className="flex-1 min-w-0">
                  {p.fattura.stato === "bozza" ? "Bozza di fattura" : `Fattura ${p.fattura.numero ?? ""}`}
                  <span className="block text-[11px] text-gray-500">
                    Creata dalla proforma{p.convertitaIl ? ` il ${dataIt(p.convertitaIl)}` : ""}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
              </Link>
            ) : (
              <p className="text-xs text-gray-400 leading-snug">
                {aperta
                  ? "Ancora nessuna fattura. «Crea fattura» ne prepara la bozza con questi dati."
                  : "Nessuna fattura collegata."}
              </p>
            )}
          </section>

          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Venditore</h2>
            <p className="text-[13px] font-semibold text-gray-900">{cfg?.ragioneSociale || "(da configurare)"}</p>
            {cfg?.nif && <p className="text-xs text-gray-500 mt-1.5">NIF {cfg.nif}</p>}
            {cfg?.iban && <p className="text-xs text-gray-500 mt-1">IBAN {cfg.iban}</p>}
          </section>
        </aside>
      </div>

      {form && (
        <ProformaFormModal
          proforma={form === "modifica" ? p : null}
          duplicaDa={form === "duplica" ? p : null}
          onClose={() => setForm(null)}
          onSaved={(salvata) => {
            const era = form;
            setForm(null);
            if (era === "duplica") router.push(`/finance/fatture/proforma/${salvata.id}`);
            else load();
          }}
        />
      )}
    </div>
  );
}

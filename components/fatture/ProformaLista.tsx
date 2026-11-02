"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, Clock, FileText, Mail, TriangleAlert } from "lucide-react";
import { fmt } from "@/lib/constants";
import { matchQ } from "@/lib/utils";
import { dataIt, lordo } from "@/lib/fatture";
import { scadutaProforma, type Proforma } from "@/lib/proforma";
import Pills from "@/components/Pills";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";

// Linguetta Proforma di Finance › Fatture. I totali qui sono solo delle
// proforma: nessuna somma del fatturato le conta.

type FiltroStato = "tutte" | "aperta" | "convertita" | "annullata";

export function PillProforma({ p }: { p: Proforma }) {
  if (p.stato === "convertita")
    return (
      <span className="pill-ok" title={`Convertita in fattura${p.convertitaIl ? ` il ${dataIt(p.convertitaIl)}` : ""}`}>
        <Check /> Convertita
      </span>
    );
  if (p.stato === "annullata")
    return (
      <span className="pill-off" title={`Annullata${p.annullataIl ? ` il ${dataIt(p.annullataIl)}` : ""}`}>
        <Ban /> Annullata
      </span>
    );
  if (scadutaProforma(p))
    return (
      <span className="pill-late" title={`Validità finita il ${dataIt(p.validaFino)}: si può ancora convertire`}>
        <TriangleAlert /> Scaduta
      </span>
    );
  return (
    <span className="pill-wait" title="Aperta: si può modificare, inviare o convertire in fattura">
      <Clock /> Aperta
    </span>
  );
}

export default function ProformaLista({ proforma }: { proforma: Proforma[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [stato, setStato] = useState<FiltroStato>("tutte");

  const aperte = proforma.filter((p) => p.stato === "aperta");
  const lista = proforma.filter(
    (p) => (stato === "tutte" || p.stato === stato) && matchQ(q, p.numero, p.cliente?.nome, p.descrizione),
  );

  if (proforma.length === 0)
    return (
      <div className="glass-card rounded-2xl p-12 text-center text-sm text-gray-400">
        <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
        Nessuna proforma in quest&apos;anno. Una proforma è il documento con gli importi da mandare al cliente
        prima della fattura: non ha valore fiscale e non entra nel fatturato.
      </div>
    );

  return (
    <>
      <KpiGrid cols={4}>
        <Kpi label="Totale aperte" value={fmt(aperte.reduce((s, p) => s + lordo(p), 0))} valueClass="text-warn" />
        <Kpi label="Aperte" value={aperte.length} valueClass="text-gray-900" />
        <Kpi label="Scadute" value={aperte.filter((p) => scadutaProforma(p)).length} valueClass="text-bad" />
        <Kpi
          label="Convertite in fattura"
          value={proforma.filter((p) => p.stato === "convertita").length}
          valueClass="text-ok"
        />
      </KpiGrid>

      <div className="flex gap-3 flex-wrap items-center">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca numero, cliente…" />
        <Pills
          value={stato}
          onChange={setStato}
          options={[
            { val: "tutte", label: "Tutte" },
            { val: "aperta", label: "Aperte" },
            { val: "convertita", label: "Convertite" },
            { val: "annullata", label: "Annullate" },
          ]}
        />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl min-w-[820px]">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Data</th>
                <th>Cliente</th>
                <th>Valida fino al</th>
                <th className="text-right">Totale</th>
                <th className="text-center">Stato</th>
                <th>Fattura</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-400 py-12 text-sm">
                    Nessuna proforma trovata
                  </td>
                </tr>
              )}
              {lista.map((p) => (
                <tr
                  key={p.id}
                  className={`cursor-pointer ${p.stato === "annullata" ? "text-gray-400" : ""}`}
                  onClick={() => router.push(`/finance/fatture/proforma/${p.id}`)}
                  title="Apri la proforma"
                >
                  <td className="whitespace-nowrap">
                    <Link
                      href={`/finance/fatture/proforma/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`font-mono font-medium text-brand hover:underline ${p.stato === "annullata" ? "line-through" : ""}`}
                    >
                      {p.numero}
                    </Link>
                    {p.inviata && (
                      <span title={`Inviata${p.dataInvio ? ` il ${dataIt(p.dataInvio)}` : ""}`}>
                        <Mail className="inline w-3.5 h-3.5 ml-1.5 text-gray-400" />
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{dataIt(p.data)}</td>
                  <td className="font-medium text-gray-900">
                    {p.cliente?.nome ?? "—"}
                    {p.descrizione && <div className="text-xs font-normal text-gray-500">{p.descrizione}</div>}
                  </td>
                  <td className={`whitespace-nowrap ${scadutaProforma(p) ? "text-bad font-medium" : "text-gray-500"}`}>
                    {dataIt(p.validaFino)}
                  </td>
                  <td className="font-semibold text-right whitespace-nowrap text-gray-900">{fmt(lordo(p))}</td>
                  <td className="text-center">
                    <PillProforma p={p} />
                  </td>
                  <td className="whitespace-nowrap">
                    {p.fattura ? (
                      <Link
                        href={`/finance/fatture/${p.fattura.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-brand hover:underline"
                      >
                        {p.fattura.numero ?? "bozza"}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

"use client";

import Pills from "@/components/Pills";
import { Kpi, KpiGrid } from "@/components/Kpi";
import SearchBox from "@/components/SearchBox";
import { matchQ } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X, Check } from "lucide-react";
import { fmt } from "@/lib/constants";
import { ricordaLista, riprendiLista } from "@/lib/lista-memo";
import PreventivoFormModal from "@/components/preventivi/PreventivoFormModal";
import {
  type Preventivo,
  STATUS_OPTIONS,
  isPreventivoScaduto,
  pillPreventivo,
  prossimoStato,
  statusStyle,
} from "@/components/preventivi/tipi";

const CHIAVE_LISTA = "preventivi:lista";

export default function PreventiviPage() {
  const [preventivi, setPreventivi] = useState<Preventivo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("tutti");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const p = await fetch("/api/preventivi").then((r) => r.json());
    setPreventivi(Array.isArray(p) ? p : []);
  }, []);
  useEffect(() => {
    // Tornando da una scheda, la lista si ritrova con gli stessi filtri
    const s = riprendiLista<{ q: string; filtroStatus: string }>(CHIAVE_LISTA);
    load().then(() => {
      if (!s) return;
      setQ(s.q ?? "");
      setFiltroStatus(s.filtroStatus ?? "tutti");
    });
  }, [load]);
  const ricorda = () => ricordaLista(CHIAVE_LISTA, { q, filtroStatus });

  const quickStatus = async (p: Preventivo, status: string) => {
    await fetch(`/api/preventivi/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const filtered = (preventivi ?? []).filter(
    (p) =>
      (filtroStatus === "tutti" || p.status === filtroStatus) &&
      matchQ(q, p.numero, p.nomeCliente, p.aziendaCliente, p.oggetto),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pl-10 md:pl-0">
        <div>
          <h1 className="page-title">Preventivi</h1>
          <p className="page-sub">
            {preventivi.length} preventivi totali
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" /> Crea preventivo
        </button>
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Cerca numero, cliente, oggetto…" />
        <Pills
          value={filtroStatus}
          onChange={setFiltroStatus}
          options={[{ value: "tutti", label: "Tutti" }, ...STATUS_OPTIONS].map((o) => ({ val: o.value, label: o.label }))}
        />
      </div>

      {/* KPI cards */}
      <KpiGrid cols={3}>
        {[
          {
            label: "Totale valore",
            val: fmt(
              (preventivi ?? []).reduce((s, p) => s + (p?.totale ?? 0), 0),
            ),
            color: "text-gray-900",
          },
          {
            label: "Accettati",
            val: fmt(
              (preventivi ?? [])
                .filter((p) => p?.status === "accettato")
                .reduce((s, p) => s + (p?.totale ?? 0), 0),
            ),
            color: "text-ok",
          },
          {
            label: "In Attesa",
            val: fmt(
              (preventivi ?? [])
                .filter((p) => p?.status === "attesa")
                .reduce((s, p) => s + (p?.totale ?? 0), 0),
            ),
            color: "text-warn",
          },
        ].map((k) => (
          <Kpi key={k.label} label={k.label} value={k.val} valueClass={k.color} />
        ))}
      </KpiGrid>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden overflow-x-auto">
        <table className="tbl min-w-[700px]">
          <thead>
            <tr>
              {[
                "Numero",
                "Cliente",
                "Oggetto",
                "Data",
                "Scadenza",
                "Totale",
                "Status",
              ].map((h) => (
                <th
                  key={h}
                  className={`${h ==="Totale" ? "text-right" : h === "Status" ? "text-center" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessun preventivo trovato
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const st = statusStyle(p.status);
              const isScaduto = isPreventivoScaduto(p);
              return (
                <tr
                  key={p.id}
                  className={isScaduto ? "bg-bad/10" : undefined}
                >
                  <td className="whitespace-nowrap">
                    {/* Il numero apre la scheda del preventivo (come le fatture) */}
                    <Link
                      href={`/sales/preventivi/${p.id}`}
                      onClick={ricorda}
                      className="font-mono font-medium text-brand hover:underline"
                      title="Apri il preventivo"
                    >
                      {p.numero ?? "—"}
                    </Link>
                  </td>
                  <td>
                    <p className="text-sm font-medium text-gray-900">
                      {p.nomeCliente ?? "—"}
                    </p>
                    {p.aziendaCliente && (
                      <p className="text-xs text-gray-400">
                        {p.aziendaCliente}
                      </p>
                    )}
                  </td>
                  <td className="max-w-[180px] truncate">
                    {p.oggetto ?? ""}
                  </td>
                  <td className="text-gray-500">
                    {new Date(p.createdAt).toLocaleDateString("it-IT")}
                  </td>
                  <td>
                    {p.dataScadenza ? (
                      <span
                        className={`text-xs font-medium ${isScaduto ? "text-bad" : "text-gray-500"}`}
                      >
                        {new Date(p.dataScadenza).toLocaleDateString("it-IT")}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="font-semibold text-gray-900 text-right">
                    {fmt(p.totale ?? 0)}
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => quickStatus(p, prossimoStato(p.status))}
                      className={pillPreventivo(p.status)}
                      title="Clicca per cambiare stato"
                    >
                      {p.status === "accettato" && (
                        <Check className="w-3 h-3" />
                      )}
                      {p.status === "rifiutato" && <X className="w-3 h-3" />}
                      {st.label}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <PreventivoFormModal
          preventivo={null}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

"use client";

import Pills from "@/components/Pills";
import SearchBox from "@/components/SearchBox";
import { matchQ } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { Plus, FileText } from "lucide-react";
import Link from "next/link";
import { fmt } from "@/lib/constants";
import { ricordaLista, riprendiLista } from "@/lib/lista-memo";
import ContrattoFormModal from "@/components/contratti/ContrattoFormModal";
import {
  type Contratto,
  STATI_CONTRATTO,
  STATO_CONTRATTO_COLORI,
  nomeClienteContratto,
  statoContrattoLabel,
} from "@/components/contratti/tipi";

const CHIAVE_LISTA = "contratti:lista";

export default function ContrattiPage() {
  const [contratti, setContratti] = useState<Contratto[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string>("tutti");
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    const data = await (await fetch("/api/contratti")).json();
    setContratti(Array.isArray(data) ? data : []);
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

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/contratti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const filtered = (contratti ?? []).filter(
    (c) =>
      (filtroStatus === "tutti" || c.status === filtroStatus) &&
      matchQ(q, c.numero, c.cliente?.nome, c.nomeClienteFallback, c.preventivo?.numero),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Contratti</h1>
          <p className="page-sub">
            {filtered.length} contratti
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SearchBox value={q} onChange={setQ} placeholder="Cerca numero, cliente…" className="w-60" />
          <Pills
            value={filtroStatus}
            onChange={setFiltroStatus}
            options={(["tutti", ...STATI_CONTRATTO] as string[]).map((s) => ({ val: s, label: statoContrattoLabel(s) }))}
          />
          <button
            onClick={() => setShowNew(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> Nuovo Contratto
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              {[
                "N. Contratto",
                "Cliente",
                "Data",
                "Durata",
                "Importo Mensile",
                "Totale",
                "Lingua",
                "Stato",
              ].map((h) => (
                <th
                  key={h}
                  className={`${["Importo Mensile", "Totale", "Durata"].includes(h) ? "text-right" : "text-left"}`}
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
                  colSpan={8}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessun contratto. Crea il primo o accetta un preventivo.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const stato = STATO_CONTRATTO_COLORI[c.status] ?? STATO_CONTRATTO_COLORI.bozza;
              return (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">
                    {/* Il numero apre la scheda del contratto (come le fatture) */}
                    <Link
                      href={`/sales/contratti/${c.id}`}
                      onClick={ricorda}
                      className="font-mono font-medium text-brand hover:underline"
                      title="Apri il contratto"
                    >
                      {c.numero}
                    </Link>
                  </td>
                  <td className="text-gray-900">
                    {nomeClienteContratto(c)}
                    {!c.cliente && (
                      <span className="pill-wait ml-2">
                        non collegato
                      </span>
                    )}
                    {c.preventivo && (
                      <span className="text-xs text-gray-400 ml-2">
                        ← {c.preventivo.numero}
                      </span>
                    )}
                  </td>
                  <td>
                    {new Date(c.dataDecorrenza).toLocaleDateString("it-IT")}
                  </td>
                  <td className="text-right">
                    {c.durataMesi} mesi
                  </td>
                  <td className="text-gray-900 text-right tabular-nums">
                    {fmt(c.importoMensile)}
                  </td>
                  <td className="font-semibold text-gray-900 text-right tabular-nums">
                    {fmt(c.totaleContratto)}
                  </td>
                  <td className="text-xs uppercase text-gray-500">
                    {c.lingua === "es" ? "ES" : "IT"}
                  </td>
                  <td>
                    <select
                      value={c.status}
                      onChange={(e) => updateStatus(c.id, e.target.value)}
                      className="tag cursor-pointer capitalize"
                      style={{ background: stato.bg, color: stato.text }}
                    >
                      {STATI_CONTRATTO.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && contratti.length === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center text-gray-500">
          <FileText className="w-10 h-10 mx-auto mb-2 text-gray-400" />
          <p className="text-sm">
            Nessun contratto. Crea il primo o accetta un preventivo per
            generarne uno automaticamente.
          </p>
        </div>
      )}

      {showNew && (
        <ContrattoFormModal
          contratto={null}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      )}
    </div>
  );
}

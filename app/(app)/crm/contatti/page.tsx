"use client";

import Pills from "@/components/Pills";
import SearchBox from "@/components/SearchBox";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageSizeSelect, PageNav } from "@/components/Pagination";
import ContattoFormModal, { type ContattoBase } from "@/components/crm/ContattoFormModal";

// Contatti = referenti di clienti e lead. La riga apre la scheda del
// contatto: modifica ed elimina stanno lì, non nella lista.

interface Contatto extends ContattoBase {
  cliente: { id: number; nome: string } | null;
  lead: { id: number; codice: string | null; nome: string; azienda: string | null } | null;
}

export default function ContattiPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Contatto[]>([]);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [nuovo, setNuovo] = useState(false);

  const load = useCallback(async () => {
    const c = await fetch("/api/contatti").then((r) => r.json());
    setRows(Array.isArray(c) ? c : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const conReset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (c) =>
        (tipo === "" || (tipo === "cliente" ? !!c.clienteId : tipo === "lead" ? !!c.leadId && !c.clienteId : !c.clienteId && !c.leadId)) &&
        (!s ||
          [c.nome, c.cognome, c.email, c.telefono, c.ruolo, c.cliente?.nome, c.lead?.azienda, c.lead?.nome].some((v) =>
            (v ?? "").toLowerCase().includes(s),
          )),
    );
  }, [rows, q, tipo]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Contatti</h1>
          <p className="page-sub">Persone di riferimento dei clienti e dei lead</p>
        </div>
        <button onClick={() => setNuovo(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Nuovo contatto
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox value={q} onChange={conReset(setQ)} placeholder="Cerca nome, email, cliente…" />
        <Pills
          value={tipo}
          onChange={conReset(setTipo)}
          options={[
            { val: "", label: "Tutti" },
            { val: "cliente", label: "Di clienti" },
            { val: "lead", label: "Di lead" },
            { val: "nessuno", label: "Non collegati" },
          ]}
        />
        <PageSizeSelect pageSize={pageSize} onChange={conReset(setPageSize)} />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              {["Contatto", "Di", "Email", "Telefono"].map((h) => (
                <th key={h} className="text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-gray-400 py-12">Nessun contatto</td>
              </tr>
            )}
            {paged.map((c) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/crm/contatti/${c.id}`)}>
                <td>
                  <Link
                    href={`/crm/contatti/${c.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-brand hover:underline"
                  >
                    {c.nome}{c.cognome ? ` ${c.cognome}` : ""}
                  </Link>
                  {c.principale && <span className="pill-wait ml-2">principale</span>}
                  {c.ruolo && <div className="text-xs text-gray-500">{c.ruolo}</div>}
                </td>
                <td>
                  {c.cliente ? (
                    <Link href={`/crm/clienti/${c.cliente.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 hover:text-brand">
                      <span className="tag tag-soft-ok">cliente</span>
                      {c.cliente.nome}
                    </Link>
                  ) : c.lead ? (
                    <Link href={`/crm/lead/${c.lead.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 hover:text-brand">
                      <span className="tag tag-soft-info">lead</span>
                      {c.lead.azienda ?? c.lead.nome}
                    </Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td>{c.email ?? "—"}</td>
                <td>{c.telefono ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <PageNav total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} labelSuffix="contatti" />
      )}

      {nuovo && (
        <ContattoFormModal
          contatto={null}
          onClose={() => setNuovo(false)}
          onSaved={(c) => {
            setNuovo(false);
            router.push(`/crm/contatti/${c.id}`);
          }}
        />
      )}
    </div>
  );
}

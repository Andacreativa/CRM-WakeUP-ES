"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import ClienteFormModal, { type ClienteMinimo } from "@/components/crm/ClienteFormModal";
import { cn } from "@/lib/utils";

// Tendina del cliente dall'anagrafica con "+ Nuovo" accanto (come le
// richieste di Northstar): il nuovo cliente si crea sopra il form, con il
// controllo doppioni, e resta già scelto.
export default function ClienteSelect({
  value,
  onChange,
  clienti,
  placeholder = "— seleziona dall'anagrafica —",
  nomeIniziale,
  className,
}: {
  value: string;
  onChange: (id: string, c?: ClienteMinimo) => void;
  clienti: { id: number; nome: string }[];
  placeholder?: string;
  // nome già scritto (es. richiesta con cliente fuori anagrafica)
  nomeIniziale?: string;
  className?: string;
}) {
  const [nuovo, setNuovo] = useState(false);
  const [aggiunti, setAggiunti] = useState<{ id: number; nome: string }[]>([]);
  const opzioni = useMemo(() => {
    const visti = new Set(clienti.map((c) => c.id));
    return [...clienti, ...aggiunti.filter((c) => !visti.has(c.id))].sort((a, b) =>
      a.nome.localeCompare(b.nome, "it"),
    );
  }, [clienti, aggiunti]);

  const scegli = (c: ClienteMinimo) => {
    if (!opzioni.some((x) => x.id === c.id)) setAggiunti((a) => [...a, { id: c.id, nome: c.nome }]);
    onChange(String(c.id), c);
    setNuovo(false);
  };

  return (
    <div className="flex gap-2 items-start">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white",
          className,
        )}
      >
        <option value="">{placeholder}</option>
        {opzioni.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setNuovo(true)}
        className="btn btn-secondary whitespace-nowrap"
        title="Il cliente non c'è in anagrafica: crealo qui"
      >
        <Plus className="w-4 h-4" /> Nuovo
      </button>
      {nuovo && (
        <ClienteFormModal
          cliente={null}
          nomeIniziale={nomeIniziale}
          onClose={() => setNuovo(false)}
          onSaved={scegli}
          onUsaEsistente={scegli}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  type ContrattoMin,
  type FatturaCandidata,
  type Richiesta,
  inputCls,
  labelCls,
  nomeCliente,
  toISODate,
} from "./tipi";

// ── Modal: crea fattura dalla richiesta ──────────────────────────────────
export function CreaFatturaModal({
  richiesta,
  onClose,
  onCollega,
  onDone,
}: {
  richiesta: Richiesta;
  onClose: () => void;
  onCollega: () => void;
  onDone: (fattura: { id: number; numero: string }) => void;
}) {
  const oggi = new Date();
  const scad = new Date(oggi);
  scad.setDate(scad.getDate() + 30);
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(toISODate(oggi));
  const [scadenza, setScadenza] = useState(toISODate(scad));
  const [metodo, setMetodo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/richieste-fattura/${richiesta.id}/crea-fattura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, data, scadenza, metodo }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Creazione non riuscita");
        return;
      }
      onDone({ id: j.fattura?.id ?? 0, numero: j.fattura?.numero ?? "" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Crea fattura</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          <div className="font-semibold text-gray-900">{nomeCliente(richiesta)}</div>
          <div className="truncate">{richiesta.descrizione}</div>
          <div className="mt-1">
            {MESI[richiesta.mese - 1]} {richiesta.anno} · imponibile{" "}
            <strong>{fmt(richiesta.imponibile)}</strong>
            {richiesta.iva > 0 && <> · IGIC {richiesta.iva}%</>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Numero fattura</label>
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className={inputCls}
              placeholder="automatico (F2026…)"
            />
          </div>
          <div>
            <label className={labelCls}>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Scadenza</label>
            <input
              type="date"
              value={scadenza}
              onChange={(e) => setScadenza(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Metodo di pagamento</label>
            <input
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className={inputCls}
              placeholder="Es. Bonifico"
            />
          </div>
        </div>
        {err && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <p className="text-xs text-gray-400">
          La fattura viene creata nel registro Fatture con origine finance e collegata a questa
          richiesta. Potrai completarla da lì.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCollega}
            className="mr-auto inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-brand"
            title="La fattura esiste già nel registro: collegala invece di crearne una nuova"
          >
            <Link2 className="w-3.5 h-3.5" /> Collega a una esistente
          </button>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="btn btn-primary disabled:opacity-60"
          >
            {busy ? "Creazione…" : "Crea fattura"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: collega a fattura esistente ───────────────────────────────────
export function CollegaModal({
  richiesta,
  onClose,
  onDone,
}: {
  richiesta: Richiesta;
  onClose: () => void;
  onDone: () => void;
}) {
  const [candidate, setCandidate] = useState<FatturaCandidata[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/richieste-fattura/${richiesta.id}/fatture-candidate`)
      .then((r) => r.json())
      .then((d) => setCandidate(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [richiesta.id]);

  const submit = async () => {
    if (!sel) return;
    const res = await fetch(`/api/richieste-fattura/${richiesta.id}/collega`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fatturaId: sel }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Collegamento non riuscito");
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Collega a una fattura</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Fatture non ancora collegate
          {richiesta.cliente ? ` di ${richiesta.cliente.nome}` : ` del ${richiesta.anno}`}.
        </p>
        <div className="flex-1 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
          {loading && <div className="p-4 text-sm text-gray-400">Caricamento…</div>}
          {!loading && candidate.length === 0 && (
            <div className="p-4 text-sm text-gray-400">Nessuna fattura disponibile.</div>
          )}
          {candidate.map((f) => (
            <label
              key={f.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50",
                sel === f.id && "bg-brand/10",
              )}
            >
              <input type="radio" name="fat" checked={sel === f.id} onChange={() => setSel(f.id)} />
              <span className="font-mono text-xs text-gray-500 w-20">{f.numero ?? "—"}</span>
              <span className="flex-1 truncate">{f.cliente?.nome ?? "(senza cliente)"}</span>
              <span className="text-xs text-gray-500">
                {MESI[f.mese - 1]?.slice(0, 3)} {f.anno}
              </span>
              <span className="font-semibold">{fmt(f.importo)}</span>
            </label>
          ))}
        </div>
        {err && <div className="text-sm text-bad">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={!sel}
            className="btn btn-primary disabled:opacity-60"
          >
            Collega
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: genera richieste da un contratto ──────────────────────────────
export function DaContrattoModal({
  contratti,
  onClose,
  onDone,
}: {
  contratti: ContrattoMin[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [autorizza, setAutorizza] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const genera = async (c: ContrattoMin) => {
    setBusy(c.id);
    setErr(null);
    try {
      const res = await fetch("/api/richieste-fattura/da-contratto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrattoId: c.id, autorizzaTutte: autorizza }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Generazione non riuscita");
        return;
      }
      onDone(Array.isArray(j) ? j.length : 0);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Genera richieste da un contratto</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Crea una richiesta per ogni rata, a partire dal mese di decorrenza, più una per le voci
          una tantum. Non crea fatture.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={autorizza} onChange={(e) => setAutorizza(e.target.checked)} />
          Autorizza subito l&apos;invio di tutte le richieste
        </label>
        <div className="flex-1 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
          {contratti.length === 0 && (
            <div className="p-4 text-sm text-gray-400">Nessun contratto.</div>
          )}
          {contratti.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-gray-500 w-28">{c.numero}</span>
              <span className="flex-1 min-w-0">
                <span className="font-semibold text-gray-900">
                  {c.cliente?.nome ?? c.nomeClienteFallback ?? "(cliente da assegnare)"}
                </span>
                <span className="block text-xs text-gray-500 truncate">{c.oggetto}</span>
              </span>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {c.numeroRate} × {fmt(c.importoMensile)}
              </span>
              <button
                onClick={() => genera(c)}
                disabled={busy !== null}
                className="btn btn-primary text-xs disabled:opacity-60"
              >
                {busy === c.id ? "…" : "Genera"}
              </button>
            </div>
          ))}
        </div>
        {err && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Pencil, Trash2, Upload } from "lucide-react";
import { fmt, MESI, CATEGORIE_COLORI, CATEGORIA_TEXT } from "@/lib/constants";
import { formatAddress } from "@/components/AddressFields";
import FornitoreFormModal, { type FornitoreBase } from "@/components/crm/FornitoreFormModal";
import {
  PreviewFatturaModal,
  UploadFatturaModal,
  type FatturaFornitore,
} from "@/components/crm/FattureFornitori";
import { cn } from "@/lib/utils";

// Scheda del fornitore: dati copiabili, spese registrate e fatture
// ricevute. Modifica, elimina e carica fattura stanno qui.

interface Fornitore extends FornitoreBase {
  createdAt: string;
  spese: {
    id: number;
    categoria: string;
    descrizione: string | null;
    mese: number;
    anno: number;
    importo: number;
  }[];
  fatture: FatturaFornitore[];
}

export default function FornitorePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [f, setF] = useState<Fornitore | null>(null);
  const [edit, setEdit] = useState(false);
  const [carica, setCarica] = useState(false);
  const [anteprima, setAnteprima] = useState<FatturaFornitore | null>(null);
  const [copiato, setCopiato] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/fornitori/${id}`);
    if (!r.ok) {
      router.replace("/crm/fornitori");
      return;
    }
    setF(await r.json());
  }, [id, router]);
  useEffect(() => {
    load();
  }, [load]);

  if (!f) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/crm/fornitori");
  };
  const elimina = async () => {
    const avviso = f.spese.length ? `\nLe ${f.spese.length} spese restano in Spese.` : "";
    if (!confirm(`Eliminare il fornitore ${f.nome}?${avviso}`)) return;
    const r = await fetch(`/api/fornitori/${f.id}`, { method: "DELETE" });
    if (!r.ok) return alert("Eliminazione non riuscita.");
    router.push("/crm/fornitori");
  };
  const copia = async (k: string, v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopiato(k);
      setTimeout(() => setCopiato(null), 1500);
    } catch {
      /* clipboard non disponibile */
    }
  };

  const indirizzo = formatAddress({
    via: f.via ?? "",
    cap: f.cap ?? "",
    citta: f.citta ?? "",
    provincia: f.provincia ?? "",
  });
  const campi = [
    { k: "nome", l: "Ragione sociale", v: f.nome },
    { k: "piva", l: "P.IVA / NIF", v: f.partitaIva },
    { k: "indirizzo", l: "Indirizzo", v: indirizzo },
    { k: "paese", l: "Paese", v: f.paese },
    { k: "email", l: "Email", v: f.email },
    { k: "telefono", l: "Telefono", v: f.telefono },
  ];
  const annoCorrente = new Date().getFullYear();
  const totale = f.spese.reduce((t, s) => t + s.importo, 0);
  const totAnno = f.spese.filter((s) => s.anno === annoCorrente).reduce((t, s) => t + s.importo, 0);

  return (
    <div className="space-y-5">
      {/* Testata */}
      <div>
        <h1 className="page-title">{f.nome}</h1>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[13px] text-gray-500">
          <span className="tag tag-neutral">{f.paese}</span>
          <span>{f.partitaIva ? `NIF ${f.partitaIva}` : "NIF non indicato"}</span>
          <span>· in anagrafica dal {new Date(f.createdAt).toLocaleDateString("it-IT")}</span>
        </div>
      </div>

      {/* Azioni */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={indietro} className="btn btn-secondary">
          <ArrowLeft /> Indietro
        </button>
        <button onClick={() => setEdit(true)} className="btn btn-secondary">
          <Pencil /> Modifica
        </button>
        <button onClick={elimina} className="btn btn-secondary text-bad hover:text-bad">
          <Trash2 /> Elimina
        </button>
        <button onClick={() => setCarica(true)} className="btn btn-primary">
          <Upload /> Carica fattura
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Dati</h2>
            <div className="kv" style={{ gridTemplateColumns: "130px minmax(0,1fr) 28px" }}>
              {campi.map((c) => (
                <div key={c.k} className="contents">
                  <div className="k">{c.l}</div>
                  <div className={cn("v", !c.v && "text-gray-400")}>{c.v || "non indicato"}</div>
                  {c.v ? (
                    <button
                      onClick={() => copia(c.k, c.v!)}
                      className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      title={`Copia ${c.l}`}
                    >
                      {copiato === c.k ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            {f.note && <p className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">{f.note}</p>}
          </section>

          <section className="glass-card rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Spese</h2>
              <span className="text-xs text-gray-500">
                {f.spese.length} · {fmt(totale)}
              </span>
            </div>
            {f.spese.length === 0 ? (
              <p className="text-sm text-gray-400 px-5 py-4">Nessuna spesa registrata con questo fornitore.</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="text-left">Mese</th>
                    <th className="text-left">Categoria</th>
                    <th className="text-left">Descrizione</th>
                    <th className="text-right">Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {f.spese.map((s) => (
                    <tr key={s.id} className="cursor-pointer" onClick={() => router.push(`/finance/spese/${s.id}`)}>
                      <td className="whitespace-nowrap">
                        {MESI[s.mese - 1]} {s.anno}
                      </td>
                      <td>
                        <span className="tag" style={{ background: CATEGORIE_COLORI[s.categoria] || "#EDEDED", color: CATEGORIA_TEXT }}>
                          {s.categoria}
                        </span>
                      </td>
                      <td className="max-w-[260px] truncate text-gray-500">{s.descrizione || "—"}</td>
                      <td className="text-right font-semibold text-gray-900 tabular-nums">{fmt(s.importo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5 space-y-3">
            {[
              { label: `Spese ${annoCorrente}`, value: fmt(totAnno) },
              { label: "Spese totali", value: fmt(totale) },
              { label: "Fatture ricevute", value: String(f.fatture.length) },
            ].map((k) => (
              <div key={k.label}>
                <p className="kpi-label">{k.label}</p>
                <p className="kpi-value">{k.value}</p>
              </div>
            ))}
          </section>
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Fatture ricevute</h2>
            {f.fatture.length === 0 ? (
              <p className="text-xs text-gray-400">Nessuna fattura caricata: usa «Carica fattura».</p>
            ) : (
              <div className="divide-y divide-gray-50 -mx-2">
                {f.fatture.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => setAnteprima(x)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-2 text-[13px] hover:bg-brand/10 rounded-lg text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-brand">{x.fileName}</span>
                      <span className="text-[11px] text-gray-400">
                        {MESI[x.mese - 1]} {x.anno}
                      </span>
                    </span>
                    <span className="font-semibold text-gray-900 tabular-nums shrink-0">{fmt(x.importo)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {edit && (
        <FornitoreFormModal
          fornitore={f}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            load();
          }}
        />
      )}
      {carica && (
        <UploadFatturaModal
          fornitori={[{ id: f.id, nome: f.nome, partitaIva: f.partitaIva }]}
          fornitoreIniziale={f.id}
          onClose={() => setCarica(false)}
          onUploaded={() => {
            setCarica(false);
            load();
          }}
          onFornitoreCreato={load}
        />
      )}
      {anteprima && (
        <PreviewFatturaModal
          fattura={anteprima}
          onClose={() => setAnteprima(null)}
          onDeleted={() => {
            setAnteprima(null);
            load();
          }}
        />
      )}
    </div>
  );
}

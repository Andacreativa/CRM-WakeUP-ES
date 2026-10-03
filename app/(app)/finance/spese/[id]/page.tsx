"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Paperclip, Pencil, Trash2 } from "lucide-react";
import { fmt, MESI, CATEGORIE_COLORI, CATEGORIA_TEXT } from "@/lib/constants";
import SpesaFormModal, { type SpesaBase } from "@/components/spese/SpesaFormModal";

// Scheda della spesa: dati, fornitore in anagrafica e da dove nasce
// (registro pagamenti, fattura incassata, movimento bancario). Modifica ed
// elimina stanno qui, non nella lista.

const VOCE_LABEL: Record<string, string> = {
  stipendio: "Stipendio",
  seguridad: "Seguridad Social",
  irpf: "IRPF",
  rimborsi: "Rimborsi",
  benefit: "Benefit",
  commissioni: "Commissioni",
};

interface Spesa extends SpesaBase {
  createdAt: string;
  fatturaId: number | null;
  fattura: { id: number; numero: string | null; cliente: { nome: string } | null } | null;
  pagamentoMensile: {
    voce: string;
    anno: number;
    mese: number;
    dipendente: { id: number; nome: string; cognome: string | null };
  } | null;
  abbinamentiBancari: {
    importo: number;
    movimento: {
      id: number;
      dataContabile: string;
      concetto: string;
      beneficiario: string | null;
      osservazioni: string | null;
      importo: number;
    };
  }[];
  fornitoreAnagrafica: { id: number; nome: string; paese: string } | null;
}

const dataIt = (d: string) => new Date(d).toLocaleDateString("it-IT");

export default function SpesaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<Spesa | null>(null);
  const [edit, setEdit] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/spese/${id}`);
    if (!r.ok) {
      router.replace("/finance/spese");
      return;
    }
    setS(await r.json());
  }, [id, router]);
  useEffect(() => {
    load();
  }, [load]);

  if (!s) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/finance/spese");
  };
  const elimina = async () => {
    const avvisi = [
      s.pagamentoMensile && "la riga resta nel registro pagamenti, senza spesa",
      s.abbinamentiBancari.length && "il movimento bancario torna da rivedere",
    ].filter(Boolean);
    if (!confirm(`Eliminare la spesa ${s.fornitore} di ${fmt(s.importo)}?${avvisi.length ? `\n\nAttenzione: ${avvisi.join("; ")}.` : ""}`)) return;
    const r = await fetch(`/api/spese/${s.id}`, { method: "DELETE" });
    if (!r.ok) return alert("Eliminazione non riuscita.");
    router.push("/finance/spese");
  };
  const pm = s.pagamentoMensile;
  const persona = pm ? `${pm.dipendente.nome}${pm.dipendente.cognome ? ` ${pm.dipendente.cognome}` : ""}` : null;

  return (
    <div className="space-y-5">
      {/* Testata */}
      <div>
        <h1 className="page-title">
          {s.fornitore} <em className="italic font-semibold text-gray-400 text-[20px]">{fmt(s.importo)}</em>
        </h1>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[13px] text-gray-500">
          <span className="tag" style={{ background: CATEGORIE_COLORI[s.categoria] || "#EDEDED", color: CATEGORIA_TEXT }}>
            {s.categoria}
          </span>
          <span>
            {MESI[s.mese - 1]} {s.anno}
          </span>
          {pm && <span className="tag tag-soft-info">registro pagamenti</span>}
          {s.abbinamentiBancari.length > 0 && <span className="tag tag-soft-ok">in banca</span>}
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
        {s.ricevutaPath && (
          <a href={s.ricevutaPath} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <Paperclip /> Ricevuta
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <section className="glass-card rounded-2xl p-5">
          <h2 className="card-title">Dati</h2>
          <div className="kv">
            <div className="k">Fornitore</div>
            <div className="v">
              {s.fornitoreAnagrafica ? (
                <Link href={`/crm/fornitori/${s.fornitoreAnagrafica.id}`} className="text-brand hover:underline">
                  {s.fornitore}
                </Link>
              ) : (
                <>
                  {s.fornitore} <span className="text-xs text-gray-400">· non in anagrafica fornitori</span>
                </>
              )}
            </div>
            <div className="k">Categoria</div>
            <div className="v">{s.categoria}</div>
            <div className="k">Competenza</div>
            <div className="v">
              {MESI[s.mese - 1]} {s.anno}
            </div>
            <div className="k">Importo</div>
            <div className="v font-semibold">{fmt(s.importo)}</div>
            <div className="k">Descrizione</div>
            <div className="v">{s.descrizione || "—"}</div>
            <div className="k">Note</div>
            <div className="v whitespace-pre-wrap">{s.note || "—"}</div>
            <div className="k">Registrata il</div>
            <div className="v">{dataIt(s.createdAt)}</div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Da dove nasce</h2>
            {!pm && !s.fattura ? (
              <p className="text-xs text-gray-400">Spesa registrata a mano o dalla banca.</p>
            ) : (
              <div className="kv" style={{ gridTemplateColumns: "100px minmax(0,1fr)" }}>
                {pm && (
                  <>
                    <div className="k">Registro</div>
                    <div className="v">
                      {VOCE_LABEL[pm.voce] ?? pm.voce} · {persona}
                      <div className="text-xs text-gray-400">
                        {MESI[pm.mese - 1]} {pm.anno} ·{" "}
                        <Link href="/finance/dipendenti/pagamenti" className="text-brand hover:underline">
                          registro pagamenti
                        </Link>
                      </div>
                    </div>
                  </>
                )}
                {s.fattura && (
                  <>
                    <div className="k">Fattura</div>
                    <div className="v">
                      <Link href={`/finance/fatture/${s.fattura.id}`} className="text-brand hover:underline">
                        {s.fattura.numero ?? "senza numero"}
                      </Link>
                      {s.fattura.cliente && <span className="text-gray-500"> · {s.fattura.cliente.nome}</span>}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Banca</h2>
            {s.abbinamentiBancari.length === 0 ? (
              <p className="text-xs text-gray-400">Nessun movimento dell&apos;estratto collegato.</p>
            ) : (
              <div className="space-y-3">
                {s.abbinamentiBancari.map((a) => (
                  <Link
                    key={a.movimento.id}
                    href="/finance/banca"
                    className="block text-[13px] rounded-lg -mx-2 px-2 py-1.5 hover:bg-brand/10"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-900">{dataIt(a.movimento.dataContabile)}</span>
                      <span className="font-semibold tabular-nums">{fmt(a.movimento.importo)}</span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {[a.movimento.beneficiario, a.movimento.osservazioni || a.movimento.concetto].filter(Boolean).join(" · ")}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {edit && (
        <SpesaFormModal
          spesa={s}
          annoDefault={s.anno}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            load();
          }}
        />
      )}
    </div>
  );
}

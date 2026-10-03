"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Pencil, Trash2, X } from "lucide-react";
import { fmt, MESI, CATEGORIA_INGRESSO_LABEL } from "@/lib/constants";
import { isFinnRitenuta } from "@/lib/finn-split";
import AltroIngressoFormModal, { type AltroIngressoBase } from "@/components/ingressi/AltroIngressoFormModal";
import { cn } from "@/lib/utils";

// Scheda dell'altro ingresso: dati, fattura e movimento bancario collegati.
// Modifica, elimina e incassato stanno qui.

interface Ingresso extends AltroIngressoBase {
  createdAt: string;
  fattura: { id: number; numero: string | null; cliente: { nome: string } | null } | null;
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
}

const dataIt = (d: string) => new Date(d).toLocaleDateString("it-IT");

export default function AltroIngressoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Ingresso | null>(null);
  const [edit, setEdit] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/altri-ingressi/${id}`);
    if (!res.ok) {
      router.replace("/finance/altri-ingressi");
      return;
    }
    setR(await res.json());
  }, [id, router]);
  useEffect(() => {
    load();
  }, [load]);

  if (!r) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const categoria = r.categoria ?? (isFinnRitenuta(r) ? "ritenuta_commerciale" : "altro");
  const contabile = isFinnRitenuta(r) || !!r.fatturaId;
  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/finance/altri-ingressi");
  };
  const elimina = async () => {
    const avviso = r.abbinamentiBancari.length ? "\n\nIl movimento bancario collegato torna da abbinare." : "";
    if (!confirm(`Eliminare l'ingresso ${r.fonte} di ${fmt(r.importo)}?${avviso}`)) return;
    const res = await fetch(`/api/altri-ingressi/${r.id}`, { method: "DELETE" });
    if (!res.ok) return alert("Eliminazione non riuscita.");
    router.push("/finance/altri-ingressi");
  };
  const toggleIncassato = async () => {
    await fetch(`/api/altri-ingressi/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incassato: !r.incassato }),
    });
    load();
  };

  return (
    <div className="space-y-5">
      {/* Testata */}
      <div>
        <h1 className="page-title">
          {r.fonte} <em className="italic font-semibold text-gray-400 text-[20px]">{fmt(r.importo)}</em>
        </h1>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[13px] text-gray-500">
          <span className="tag tag-neutral">{CATEGORIA_INGRESSO_LABEL[categoria] ?? categoria}</span>
          {contabile && <span className="tag tag-neutral">solo contabile</span>}
          <span>
            {MESI[r.mese - 1]} {r.anno}
          </span>
          <button
            onClick={toggleIncassato}
            className={cn("tag cursor-pointer", r.incassato ? "pill-ok" : "pill-wait")}
            title="Clicca per cambiare"
          >
            {r.incassato ? <Check /> : <X />}
            {r.incassato ? "Incassato" : "In attesa"}
          </button>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <section className="glass-card rounded-2xl p-5">
          <h2 className="card-title">Dati</h2>
          <div className="kv">
            <div className="k">Fonte</div>
            <div className="v">{r.fonte}</div>
            <div className="k">Categoria</div>
            <div className="v">{CATEGORIA_INGRESSO_LABEL[categoria] ?? categoria}</div>
            <div className="k">Competenza</div>
            <div className="v">
              {MESI[r.mese - 1]} {r.anno}
            </div>
            <div className="k">Importo</div>
            <div className="v font-semibold">{fmt(r.importo)}</div>
            <div className="k">Incasso</div>
            <div className="v">
              {r.incassato ? `Incassato${r.dataIncasso ? ` il ${dataIt(r.dataIncasso)}` : ""}` : "In attesa"}
            </div>
            <div className="k">Descrizione</div>
            <div className="v">{r.descrizione || "—"}</div>
            <div className="k">Registrato il</div>
            <div className="v">{dataIt(r.createdAt)}</div>
          </div>
          {contabile && (
            <p className="mt-4 text-xs text-gray-500">
              Solo contabile: si vede ma non si somma, l&apos;incasso è già nella fattura.
            </p>
          )}
        </section>

        <aside className="space-y-4">
          {r.fattura && (
            <section className="glass-card rounded-2xl p-5">
              <h2 className="card-title">Fattura</h2>
              <Link href={`/finance/fatture/${r.fattura.id}`} className="text-sm text-brand hover:underline">
                {r.fattura.numero ?? "senza numero"}
              </Link>
              {r.fattura.cliente && <span className="text-sm text-gray-500"> · {r.fattura.cliente.nome}</span>}
            </section>
          )}
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Banca</h2>
            {r.abbinamentiBancari.length === 0 ? (
              <p className="text-xs text-gray-400">Nessun movimento dell&apos;estratto collegato.</p>
            ) : (
              <div className="space-y-3">
                {r.abbinamentiBancari.map((a) => (
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
        <AltroIngressoFormModal
          ingresso={r}
          categoria={categoria}
          annoDefault={r.anno}
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

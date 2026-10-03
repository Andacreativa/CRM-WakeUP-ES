"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Mail, Pencil, Phone, Star, Trash2 } from "lucide-react";
import { STATO_LEAD } from "@/lib/lead";
import ContattoFormModal, { type ContattoBase } from "@/components/crm/ContattoFormModal";

// Scheda del contatto: dati della persona, a chi è collegato; le azioni
// (modifica, elimina, referente principale) stanno qui e non nella lista.

interface Contatto extends ContattoBase {
  createdAt: string;
  cliente: { id: number; nome: string; paese: string; citta: string | null; email: string | null; telefono: string | null } | null;
  lead: { id: number; codice: string | null; nome: string; azienda: string | null; stato: string } | null;
}

export default function ContattoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Contatto | null>(null);
  const [edit, setEdit] = useState(false);
  const [copiato, setCopiato] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/contatti/${id}`);
    if (!r.ok) {
      router.replace("/crm/contatti");
      return;
    }
    setC(await r.json());
  }, [id, router]);
  useEffect(() => {
    load();
  }, [load]);

  if (!c) return <div className="text-sm text-gray-400 py-10 text-center">Caricamento…</div>;

  const nome = `${c.nome}${c.cognome ? ` ${c.cognome}` : ""}`;
  const indietro = () => {
    if (window.history.length > 1) router.back();
    else router.push("/crm/contatti");
  };
  const elimina = async () => {
    if (!confirm(`Eliminare il contatto ${nome}?`)) return;
    const r = await fetch(`/api/contatti/${c.id}`, { method: "DELETE" });
    if (!r.ok) return alert("Eliminazione non riuscita.");
    router.push("/crm/contatti");
  };
  const principale = async () => {
    await fetch(`/api/contatti/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principale: true }),
    });
    load();
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
  const copiaBtn = (k: string, v: string) => (
    <button onClick={() => copia(k, v)} className="ml-1.5 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 align-middle" title="Copia">
      {copiato === k ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
  const st = c.lead ? (STATO_LEAD[c.lead.stato] ?? STATO_LEAD.nuovo) : null;

  return (
    <div className="space-y-5">
      {/* Testata */}
      <div>
        <h1 className="page-title">{nome}</h1>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[13px] text-gray-500">
          {c.ruolo && <span>{c.ruolo}</span>}
          {c.cliente && <span className="tag tag-soft-ok">cliente</span>}
          {!c.cliente && c.lead && <span className="tag tag-soft-info">lead</span>}
          {c.principale && <span className="pill-wait">principale</span>}
          <span>· in anagrafica dal {new Date(c.createdAt).toLocaleDateString("it-IT")}</span>
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
        {c.clienteId && !c.principale && (
          <button onClick={principale} className="btn btn-secondary" title="Diventa il referente principale del cliente">
            <Star /> Imposta principale
          </button>
        )}
        <button onClick={elimina} className="btn btn-secondary text-bad hover:text-bad">
          <Trash2 /> Elimina
        </button>
        {c.email && (
          <a href={`mailto:${c.email}`} className="btn btn-primary">
            <Mail /> Scrivi
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <section className="glass-card rounded-2xl p-5">
          <h2 className="card-title">Dati</h2>
          <div className="kv">
            <div className="k">Nome</div>
            <div className="v">{c.nome}</div>
            <div className="k">Cognome</div>
            <div className="v">{c.cognome || "—"}</div>
            <div className="k">Ruolo</div>
            <div className="v">{c.ruolo || "—"}</div>
            <div className="k">Email</div>
            <div className="v">
              {c.email ? (
                <>
                  <a href={`mailto:${c.email}`} className="hover:text-brand hover:underline">{c.email}</a>
                  {copiaBtn("email", c.email)}
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="k">Telefono</div>
            <div className="v">
              {c.telefono ? (
                <>
                  <a href={`tel:${c.telefono.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 hover:text-brand hover:underline">
                    <Phone className="w-3.5 h-3.5" /> {c.telefono}
                  </a>
                  {copiaBtn("tel", c.telefono)}
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="k">Note</div>
            <div className="v whitespace-pre-wrap">{c.note || "—"}</div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="card-title">Collegato a</h2>
            {c.cliente ? (
              <div className="kv" style={{ gridTemplateColumns: "90px minmax(0,1fr)" }}>
                <div className="k">Cliente</div>
                <div className="v">
                  <Link href={`/crm/clienti/${c.cliente.id}`} className="font-medium text-brand hover:underline">
                    {c.cliente.nome}
                  </Link>
                </div>
                <div className="k">Paese</div>
                <div className="v">
                  {c.cliente.paese}
                  {c.cliente.citta ? ` · ${c.cliente.citta}` : ""}
                </div>
                {c.cliente.email && (
                  <>
                    <div className="k">Email</div>
                    <div className="v">{c.cliente.email}</div>
                  </>
                )}
              </div>
            ) : c.lead ? (
              <div className="kv" style={{ gridTemplateColumns: "90px minmax(0,1fr)" }}>
                <div className="k">Lead</div>
                <div className="v">
                  <Link href={`/crm/lead/${c.lead.id}`} className="font-medium text-brand hover:underline">
                    {c.lead.azienda ?? c.lead.nome}
                  </Link>
                  {c.lead.codice && <span className="text-xs text-gray-400 ml-1.5">{c.lead.codice}</span>}
                </div>
                {st && (
                  <>
                    <div className="k">Stato</div>
                    <div className="v">
                      <span className="tag" style={{ background: st.color, color: "#fff" }}>{st.label}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Non collegato: con «Modifica» lo colleghi a un cliente o a un lead.
              </p>
            )}
          </section>
        </aside>
      </div>

      {edit && (
        <ContattoFormModal
          contatto={c}
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

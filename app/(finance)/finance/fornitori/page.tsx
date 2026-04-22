"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Copy, Check } from "lucide-react";
import { fmt } from "@/lib/constants";
import AddressFields, { formatAddress } from "@/components/AddressFields";
import FiltriBar from "@/components/FiltriBar";
import { PageSizeSelect, PageNav } from "@/components/Pagination";

interface Fornitore {
  id: number;
  nome: string;
  paese: string;
  email: string | null;
  telefono: string | null;
  partitaIva: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  note: string | null;
}

interface Spesa {
  fornitore: string;
  importo: number;
}

const emptyForm = {
  nome: "",
  paese: "Italia",
  email: "",
  telefono: "",
  partitaIva: "",
  via: "",
  cap: "",
  citta: "",
  provincia: "",
  note: "",
};

const PAESE_FLAG: Record<string, string> = {
  Italia: "🇮🇹",
  Spagna: "🇪🇸",
  Francia: "🇫🇷",
  Germania: "🇩🇪",
  Portogallo: "🇵🇹",
  "Regno Unito": "🇬🇧",
  Irlanda: "🇮🇪",
  Lussemburgo: "🇱🇺",
  "Stati Uniti": "🇺🇸",
};

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,'`"()\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function FornitoriPage() {
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [spese, setSpese] = useState<Spesa[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fornitore | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [paeseFiltro, setPaeseFiltro] = useState("");
  const [detail, setDetail] = useState<Fornitore | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const load = async () => {
    const annoCorrente = new Date().getFullYear();
    const [forn, spe]: any[] = await Promise.all([
      fetch("/api/fornitori").then((r) => r.json()),
      fetch(`/api/spese?anno=${annoCorrente}`).then((r) => r.json()),
    ]);
    setFornitori(Array.isArray(forn) ? forn : []);
    setSpese(Array.isArray(spe) ? spe : []);
  };
  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };
  const openEdit = (c: Fornitore) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      paese: c.paese,
      email: c.email || "",
      telefono: c.telefono || "",
      partitaIva: c.partitaIva || "",
      via: c.via || "",
      cap: c.cap || "",
      citta: c.citta || "",
      provincia: c.provincia || "",
      note: c.note || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.nome) return;
    if (editing) {
      await fetch(`/api/fornitori/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/fornitori", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setShowForm(false);
    load();
  };

  const del = async (id: number) => {
    if (!confirm("Eliminare questo fornitore?")) return;
    await fetch(`/api/fornitori/${id}`, { method: "DELETE" });
    if (detail?.id === id) setDetail(null);
    load();
  };

  const q = (search ?? "").toLowerCase();
  const filtered = (fornitori ?? []).filter((c) => {
    if (paeseFiltro === "Spagna" && c.paese !== "Spagna") return false;
    if (paeseFiltro === "Italia" && c.paese !== "Italia") return false;
    if (
      paeseFiltro === "Altro" &&
      (c.paese === "Spagna" || c.paese === "Italia")
    )
      return false;
    return (
      (c.nome ?? "").toLowerCase().includes(q) ||
      (c.paese ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.partitaIva ?? "").toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setPage(1);
  }, [search, paeseFiltro, pageSize]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Totale spese per fornitore — match per nome normalizzato (case-insensitive,
  // punteggiatura ignorata) sul campo testuale `fornitore` di ogni Spesa.
  const totaleSpese = (nome: string): number => {
    const n = normalize(nome);
    if (!n) return 0;
    return spese.reduce((s, sp) => {
      const sn = normalize(sp.fornitore);
      if (sn === n || sn.includes(n) || n.includes(sn)) {
        return s + (sp.importo ?? 0);
      }
      return s;
    }, 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fornitori</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} fornitori in anagrafica
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar
            anno={0}
            azienda={paeseFiltro}
            onAnno={() => {}}
            onAzienda={setPaeseFiltro}
            showAnno={false}
            hideOptions={["Altro"]}
          />
          <PageSizeSelect pageSize={pageSize} onChange={setPageSize} />
          <button
            onClick={openNew}
            className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-xl"
          >
            <Plus className="w-4 h-4" /> Nuovo Fornitore
          </button>
        </div>
      </div>

      {/* Ricerca */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cerca per nome, NIF, paese, email..."
        className="w-full max-w-sm border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
      />

      {/* Tabella */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {["Paese", "Fornitore", "Totale Spese", ""].map((h) => (
                <th
                  key={h}
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 ${h === "Totale Spese" ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="zebra">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessun fornitore trovato
                </td>
              </tr>
            )}
            {paged.map((c) => {
              const totale = totaleSpese(c.nome);
              return (
                <tr
                  key={c.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-xl">
                    {PAESE_FLAG[c.paese] || "🌍"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDetail(c)}
                      className="text-sm font-medium text-gray-900 hover:text-pink-600 hover:underline text-left"
                    >
                      {c.nome}
                    </button>
                    {c.partitaIva && (
                      <p className="text-xs text-gray-400 font-mono">
                        {c.partitaIva}
                      </p>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-sm font-semibold text-right"
                    style={{ color: totale > 0 ? "#ef4444" : "#94a3b8" }}
                  >
                    {totale > 0 ? fmt(totale) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(c.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <PageNav
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          labelSuffix="fornitori"
        />
      )}

      {/* Detail modal */}
      {detail && (
        <FornitoreDetailModal
          fornitore={detail}
          totale={totaleSpese(detail.nome)}
          onClose={() => setDetail(null)}
          onEdit={() => {
            const c = detail;
            setDetail(null);
            openEdit(c);
          }}
        />
      )}

      {/* Edit/Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? "Modifica Fornitore" : "Nuovo Fornitore"}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nome: e.target.value }))
                    }
                    placeholder="Es. Acme Srl"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    P.IVA / NIF
                  </label>
                  <input
                    type="text"
                    value={form.partitaIva}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, partitaIva: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Telefono
                  </label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, telefono: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Indirizzo
                  </p>
                  <AddressFields
                    value={{
                      via: form.via,
                      cap: form.cap,
                      citta: form.citta,
                      provincia: form.provincia,
                      paese: form.paese,
                    }}
                    onChange={(a) =>
                      setForm((f) => ({
                        ...f,
                        via: a.via,
                        cap: a.cap,
                        citta: a.citta,
                        provincia: a.provincia,
                        paese: a.paese,
                      }))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Note
                  </label>
                  <textarea
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={save}
                className="glass-btn-primary flex-1 text-white text-sm font-medium py-2.5 rounded-xl"
              >
                {editing ? "Salva Modifiche" : "Aggiungi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FornitoreDetailModal({
  fornitore,
  totale,
  onClose,
  onEdit,
}: {
  fornitore: Fornitore;
  totale: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const indirizzo = formatAddress({
    via: fornitore.via ?? "",
    cap: fornitore.cap ?? "",
    citta: fornitore.citta ?? "",
    provincia: fornitore.provincia ?? "",
    paese: fornitore.paese,
  });
  const copy = (label: string, val: string | null | undefined) => {
    if (!val) return;
    navigator.clipboard.writeText(val);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };
  const Field = ({
    label,
    value,
  }: {
    label: string;
    value: string | null | undefined;
  }) => (
    <div className="grid grid-cols-[140px_1fr_28px] gap-2 items-start py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-0.5">
        {label}
      </span>
      <span
        className="text-sm text-gray-800 break-words"
        style={{ textAlign: "left" }}
      >
        {value || <span className="text-gray-300">—</span>}
      </span>
      {value ? (
        <button
          onClick={() => copy(label, value)}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
          title={`Copia ${label}`}
        >
          {copied === label ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="glass-modal rounded-2xl w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ textAlign: "left" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                {PAESE_FLAG[fornitore.paese] || "🌍"}
              </span>
              <h2 className="text-lg font-bold text-gray-900">
                {fornitore.nome}
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{fornitore.paese}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">
            Totale Spese (anno corrente)
          </p>
          <p
            className="text-lg font-bold"
            style={{ color: totale > 0 ? "#ef4444" : "#94a3b8" }}
          >
            {totale > 0 ? fmt(totale) : "—"}
          </p>
        </div>

        <div className="bg-white/60 rounded-xl px-3">
          <Field label="Ragione sociale" value={fornitore.nome} />
          <Field label="P.IVA / NIF" value={fornitore.partitaIva} />
          <Field label="Indirizzo" value={indirizzo || ""} />
          <Field label="Email" value={fornitore.email} />
          <Field label="Telefono" value={fornitore.telefono} />
          {fornitore.note && <Field label="Note" value={fornitore.note} />}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
          >
            Chiudi
          </button>
          <button
            onClick={onEdit}
            className="glass-btn-primary flex-1 text-white text-sm font-medium py-2.5 rounded-xl"
          >
            Modifica
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Upload } from "lucide-react";
import { fmt } from "@/lib/constants";
import { TIPI_DIPENDENTE, TIPO_LABEL } from "@/lib/dipendenti";
import CopyFieldsModal, { CopyField } from "@/components/CopyFieldsModal";
import AddressFields, { formatAddress } from "@/components/AddressFields";
import Avatar from "@/components/Avatar";

interface Dipendente {
  id: number;
  nome: string;
  cognome: string | null;
  ruolo: string | null;
  dataNascita: string | null;
  dni: string | null;
  nie: string | null;
  numSS: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  paese: string | null;
  telefono: string | null;
  email: string | null;
  iban: string | null;
  fotoPath: string | null;
  nettoBustaPaga: number;
  irpf: number;
  irpfImporto: number;
  seguridadSocial: number;
  tipo: string;
  percentualeCommissione: number;
  rimborsiMensili: number;
  benefitMensili: number;
  attivo: boolean;
}

const emptyForm = {
  nome: "",
  cognome: "",
  ruolo: "",
  dataNascita: "",
  dni: "",
  nie: "",
  numSS: "",
  via: "",
  cap: "",
  citta: "",
  provincia: "",
  paese: "Spagna",
  telefono: "",
  email: "",
  iban: "",
  fotoPath: "",
  nettoBustaPaga: "",
  irpf: "",
  irpfImporto: "",
  seguridadSocial: "",
  tipo: "dipendente",
  percentualeCommissione: "",
  rimborsiMensili: "",
  benefitMensili: "",
  attivo: true,
};

export default function DipendentiPage() {
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Dipendente | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [infoDip, setInfoDip] = useState<Dipendente | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  const onFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("subdir", "avatars");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = (await res.json()) as { path?: string; error?: string };
      if (j.path) setForm((f) => ({ ...f, fotoPath: j.path! }));
    } finally {
      setUploadingFoto(false);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  };

  const load = async () => {
    const data = (await (await fetch("/api/dipendenti")).json()) as any;
    setDipendenti(Array.isArray(data) ? data : []);
  };
  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };
  const openEdit = (d: Dipendente) => {
    setEditing(d);
    setForm({
      nome: d.nome,
      cognome: d.cognome ?? "",
      ruolo: d.ruolo ?? "",
      dataNascita: d.dataNascita ? d.dataNascita.slice(0, 10) : "",
      dni: d.dni ?? "",
      nie: d.nie ?? "",
      numSS: d.numSS ?? "",
      via: d.via ?? "",
      cap: d.cap ?? "",
      citta: d.citta ?? "",
      provincia: d.provincia ?? "",
      paese: d.paese ?? "Spagna",
      telefono: d.telefono ?? "",
      email: d.email ?? "",
      iban: d.iban ?? "",
      fotoPath: d.fotoPath ?? "",
      nettoBustaPaga: String(d.nettoBustaPaga ?? ""),
      irpf: String(d.irpf ?? ""),
      irpfImporto: String(d.irpfImporto ?? ""),
      seguridadSocial: String(d.seguridadSocial ?? ""),
      tipo: d.tipo ?? "dipendente",
      percentualeCommissione: String(d.percentualeCommissione ?? ""),
      rimborsiMensili: String(d.rimborsiMensili ?? ""),
      benefitMensili: String(d.benefitMensili ?? ""),
      attivo: d.attivo ?? true,
    });
    setShowForm(true);
  };

  const dipendenteFields = (d: Dipendente): CopyField[] => {
    const indirizzo = formatAddress({
      via: d.via ?? "",
      cap: d.cap ?? "",
      citta: d.citta ?? "",
      provincia: d.provincia ?? "",
      paese: d.paese ?? "",
    });
    return [
      { label: "Nome", value: d.nome },
      { label: "Cognome", value: d.cognome },
      { label: "Ruolo", value: d.ruolo },
      {
        label: "Data di nascita",
        value: d.dataNascita
          ? new Date(d.dataNascita).toLocaleDateString("it-IT")
          : null,
      },
      { label: "DNI", value: d.dni },
      { label: "NIE", value: d.nie },
      { label: "N° Seguridad Social", value: d.numSS },
      { label: "Via", value: d.via },
      { label: "CAP", value: d.cap },
      { label: "Città", value: d.citta },
      { label: "Provincia", value: d.provincia },
      { label: "Stato", value: d.paese },
      { label: "Indirizzo completo", value: indirizzo },
      { label: "Telefono", value: d.telefono },
      { label: "Email", value: d.email },
      { label: "IBAN", value: d.iban },
    ];
  };

  const save = async () => {
    if (!form.nome) return;
    if (editing) {
      await fetch(`/api/dipendenti/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/dipendenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setShowForm(false);
    load();
  };

  const del = async (id: number) => {
    if (
      !confirm(
        "Eliminare questo dipendente? Verranno cancellate anche le spese collegate.",
      )
    )
      return;
    await fetch(`/api/dipendenti/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dipendenti</h1>
          <p className="text-gray-500 text-sm mt-1">
            {dipendenti.length} persone in anagrafica
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openNew}
            className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-xl"
          >
            <Plus className="w-4 h-4" /> Nuova persona
          </button>
        </div>
      </div>

      {/* Tabella anagrafica */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {[
                ["Persona", "text-left"],
                ["Tipo", "text-left"],
                ["Stipendio netto", "text-right"],
                ["Seg. Social", "text-right"],
                ["IRPF", "text-right"],
                ["Benefit", "text-right"],
                ["Commissione", "text-right"],
                ["", ""],
              ].map(([h, al], i) => (
                <th
                  key={i}
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 ${al}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="zebra">
            {dipendenti.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessuna persona. Aggiungi la prima con il pulsante in alto.
                </td>
              </tr>
            )}
            {dipendenti.map((d) => (
              <tr
                key={d.id}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-3">
                    <Avatar
                      nome={d.nome}
                      cognome={d.cognome}
                      fotoPath={d.fotoPath}
                      size={36}
                    />
                    <button
                      onClick={() => setInfoDip(d)}
                      className="text-left hover:text-pink-600 hover:underline transition-colors cursor-pointer"
                    >
                      {d.nome}
                      {d.cognome ? ` ${d.cognome}` : ""}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                      d.tipo === "commerciale"
                        ? "bg-pink-50 text-pink-700"
                        : d.tipo === "socio_dipendente"
                          ? "bg-violet-50 text-violet-700"
                          : "bg-sky-50 text-sky-700"
                    }`}
                  >
                    {TIPO_LABEL[d.tipo] ?? d.tipo}
                  </span>
                  {!d.attivo && (
                    <span className="ml-2 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      non attivo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                  {fmt(d.nettoBustaPaga)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 text-right">
                  {d.tipo === "commerciale" ? "—" : fmt(d.seguridadSocial)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 text-right">
                  {d.tipo === "commerciale" ? (
                    "—"
                  ) : (
                    <>
                      {fmt(d.irpfImporto)}
                      <span className="text-[11px] text-gray-400 ml-1">
                        ({(d.irpf ?? 0).toFixed(2).replace(".", ",")}%)
                      </span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 text-right">
                  {d.tipo === "dipendente"
                    ? "—"
                    : fmt(d.benefitMensili)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 text-right">
                  {d.tipo === "commerciale"
                    ? `${(d.percentualeCommissione ?? 0).toFixed(1).replace(".", ",")}%`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => openEdit(d)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => del(d.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal crea/modifica dipendente */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? "Modifica persona" : "Nuova persona"}
            </h2>

            {/* Foto profilo */}
            <div className="flex items-center gap-4">
              <Avatar
                nome={form.nome || "?"}
                cognome={form.cognome}
                fotoPath={form.fotoPath || null}
                size={64}
              />
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fotoRef}
                  type="file"
                  accept="image/*"
                  onChange={onFotoChange}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fotoRef.current?.click()}
                    disabled={uploadingFoto}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingFoto
                      ? "Caricamento..."
                      : form.fotoPath
                        ? "Cambia foto"
                        : "Carica foto"}
                  </button>
                  {form.fotoPath && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, fotoPath: "" }))}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-red-600 hover:bg-red-50"
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  PNG/JPG. In assenza di foto verranno mostrate le iniziali.
                </p>
              </div>
            </div>

            {/* Tipologia */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Tipologia
              </p>
              <div className="flex gap-2">
                {TIPI_DIPENDENTE.map((t) => {
                  const active = form.tipo === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                      className="flex-1 text-sm py-2 rounded-lg border font-semibold transition-all"
                      style={
                        active
                          ? { background: "#e8308a", color: "#fff", borderColor: "#e8308a" }
                          : { background: "#fff", borderColor: "#e2e8f0", color: "#94a3b8" }
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={form.attivo}
                  onChange={(e) => setForm((f) => ({ ...f, attivo: e.target.checked }))}
                />
                Attivo (compare nel registro pagamenti)
              </label>
            </div>

            {/* Anagrafica */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Anagrafica
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nome: e.target.value }))
                    }
                    placeholder="Es. Mario"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Cognome
                  </label>
                  <input
                    type="text"
                    value={form.cognome}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cognome: e.target.value }))
                    }
                    placeholder="Es. Rossi"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Ruolo
                  </label>
                  <input
                    type="text"
                    value={form.ruolo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ruolo: e.target.value }))
                    }
                    placeholder="Es. Account Manager"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Data di nascita
                  </label>
                  <input
                    type="date"
                    value={form.dataNascita}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dataNascita: e.target.value }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    DNI
                  </label>
                  <input
                    type="text"
                    value={form.dni}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dni: e.target.value }))
                    }
                    placeholder="12345678X"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    NIE
                  </label>
                  <input
                    type="text"
                    value={form.nie}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nie: e.target.value }))
                    }
                    placeholder="X1234567L"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    N° Seguridad Social
                  </label>
                  <input
                    type="text"
                    value={form.numSS}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, numSS: e.target.value }))
                    }
                    placeholder="Es. 281234567890"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-2">
                    Residenza
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
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Telefono
                  </label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, telefono: e.target.value }))
                    }
                    placeholder="+34..."
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
                    placeholder="mario@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    IBAN
                  </label>
                  <input
                    type="text"
                    value={form.iban}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, iban: e.target.value }))
                    }
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>
            </div>

            {/* Compensi */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Compensi mensili
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Netto busta paga (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.nettoBustaPaga}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nettoBustaPaga: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    IRPF (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.irpf}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, irpf: e.target.value }))
                    }
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    IRPF (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.irpfImporto}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, irpfImporto: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Seguridad Social (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.seguridadSocial}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        seguridadSocial: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                  />
                </div>
              </div>
            </div>

            {form.tipo !== "dipendente" && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {form.tipo === "commerciale" ? "Commissioni e benefit" : "Rimborsi e benefit"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {form.tipo === "commerciale" && (
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">
                        Commissione (% sulle fatture incassate)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={form.percentualeCommissione}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, percentualeCommissione: e.target.value }))
                        }
                        placeholder="Es. 85"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      Benefit mensili di default (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.benefitMensili}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, benefitMensili: e.target.value }))
                      }
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Gli importi di default vengono proposti ogni mese nel registro pagamenti e
                  restano modificabili voce per voce. I rimborsi non hanno un default: si
                  inseriscono a mano nel registro quando capitano, anche più volte al mese.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={save}
                className="glass-btn-primary flex-1 text-white text-sm font-medium py-2.5 rounded-xl"
              >
                {editing ? "Salva" : "Aggiungi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup anagrafica dipendente (cliccando sul nome) */}
      <CopyFieldsModal
        open={!!infoDip}
        onClose={() => setInfoDip(null)}
        title={
          infoDip
            ? `${infoDip.nome}${infoDip.cognome ? ` ${infoDip.cognome}` : ""}`
            : ""
        }
        fields={infoDip ? dipendenteFields(infoDip) : []}
      />
    </div>
  );
}

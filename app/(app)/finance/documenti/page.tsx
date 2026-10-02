"use client";

import { useEffect, useState } from "react";
import { Upload, Download, Trash2, X, Folder } from "lucide-react";

type Tab = "azienda" | "soci";

const SOCI = ["Leonardo Mestre", "Lorenzo Vanghetti"] as const;

interface Documento {
  id: number;
  nome: string;
  categoria: string;
  socio: string | null;
  fileName: string;
  fileMimeType: string;
  dataCaricamento: string;
}

export default function DocumentiPage() {
  const [tab, setTab] = useState<Tab>("azienda");
  const [docs, setDocs] = useState<Documento[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<Documento | null>(null);

  const load = async () => {
    const data = await (
      await fetch(`/api/documenti?tab=${tab}`)
    ).json();
    setDocs(Array.isArray(data) ? data : []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const del = async (id: number) => {
    if (!confirm("Eliminare questo documento?")) return;
    await fetch(`/api/documenti/${id}`, { method: "DELETE" });
    load();
  };

  const downloadDoc = async (d: Documento) => {
    const res = await fetch(`/api/documenti/${d.id}/file`);
    if (!res.ok) {
      alert("Errore download file");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = d.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documenti</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Archivio documenti aziendali e personali dei soci
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            { v: "azienda", l: "Azienda" },
            { v: "soci", l: "Soci" },
          ] as const
        ).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className="text-sm px-4 py-2 font-medium transition-colors"
            style={
              tab === v
                ? {
                    color: "#e8308a",
                    borderBottom: "2px solid #e8308a",
                    marginBottom: "-1px",
                  }
                : { color: "#6b7280" }
            }
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{docs.length} documenti</p>
        <button
          onClick={() => setShowUpload(true)}
          className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-xl"
        >
          <Upload className="w-4 h-4" /> Carica Documento
        </button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {[
                "Nome",
                "Categoria",
                ...(tab === "soci" ? ["Socio"] : []),
                "File",
                "Data caricamento",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 text-left"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td
                  colSpan={tab === "soci" ? 6 : 5}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  <Folder className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  Nessun documento
                </td>
              </tr>
            )}
            {docs.map((d, i) => (
              <tr
                key={d.id}
                className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 1 ? "bg-[#F9F9F9]" : "bg-white"}`}
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-800">
                  {d.nome}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-pink-50 text-pink-700">
                    {d.categoria}
                  </span>
                </td>
                {tab === "soci" && (
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {d.socio ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                  <button
                    onClick={() => setPreview(d)}
                    className="hover:text-pink-600 hover:underline text-left"
                  >
                    {d.fileName}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(d.dataCaricamento).toLocaleDateString("it-IT")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => downloadDoc(d)}
                      title="Scarica"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => del(d.id)}
                      title="Elimina"
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

      {showUpload && (
        <UploadDocumentoModal
          tab={tab}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            load();
          }}
        />
      )}

      {preview && (
        <PreviewDocumentoModal
          documento={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function UploadDocumentoModal({
  tab,
  onClose,
  onUploaded,
}: {
  tab: Tab;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [socio, setSocio] = useState<string>(SOCI[0]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File) => {
    setFile(f);
    if (!nome) {
      // Auto-fill nome con il nome file (senza estensione)
      const noExt = f.name.replace(/\.[^.]+$/, "");
      setNome(noExt);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const submit = async () => {
    setError(null);
    if (!file) return setError("Seleziona un file");
    if (!nome.trim()) return setError("Inserisci un nome");
    if (!categoria.trim()) return setError("Inserisci una categoria");
    if (tab === "soci" && !socio) return setError("Seleziona un socio");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("nome", nome);
      fd.append("categoria", categoria);
      if (tab === "soci") fd.append("socio", socio);
      const res = await fetch("/api/documenti", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Errore (${res.status})`);
        return;
      }
      onUploaded();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            Carica Documento — {tab === "azienda" ? "Azienda" : "Soci"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("doc-file-input")?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-pink-400 bg-pink-50"
              : "border-gray-300 hover:border-pink-300 hover:bg-gray-50"
          }`}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700">
            {file ? file.name : "Trascina file qui o clicca per selezionare"}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">PDF, JPG, PNG</p>
          <input
            id="doc-file-input"
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Nome / Descrizione *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Es. Visura camerale 2025"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Categoria *
            </label>
            <input
              type="text"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Es. Visura, Contratto, Certificato..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            />
          </div>
          {tab === "soci" && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Socio *
              </label>
              <select
                value={socio}
                onChange={(e) => setSocio(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              >
                {SOCI.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={uploading || !file}
            className="glass-btn-primary flex-1 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-60"
          >
            {uploading ? "Caricamento..." : "Carica"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Documento Modal ────────────────────────────────────────────────
function PreviewDocumentoModal({
  documento,
  onClose,
}: {
  documento: Documento;
  onClose: () => void;
}) {
  const fileUrl = `/api/documenti/${documento.id}/file`;
  const mime = documento.fileMimeType ?? "";
  const isPdf =
    mime === "application/pdf" || /\.pdf$/i.test(documento.fileName);
  const isImage =
    /^image\//.test(mime) ||
    /\.(jpe?g|png|webp|gif)$/i.test(documento.fileName);

  const downloadFile = async () => {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      alert("Errore download file");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = documento.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {documento.nome}
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {documento.categoria}
              {documento.socio ? ` · ${documento.socio}` : ""}
              {" · "}
              {documento.fileName}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={downloadFile}
              className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-white"
            >
              <Download className="w-4 h-4" /> Scarica
            </button>
            <button
              onClick={onClose}
              aria-label="Chiudi"
              className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-gray-100 overflow-auto">
          {isPdf && (
            <iframe
              src={fileUrl}
              title={documento.fileName}
              className="w-full h-full border-0"
            />
          )}
          {isImage && (
            <div className="w-full h-full flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl}
                alt={documento.fileName}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}
          {!isPdf && !isImage && (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm gap-3">
              <p>Anteprima non disponibile per questo formato.</p>
              <button
                onClick={downloadFile}
                className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-white"
              >
                <Download className="w-4 h-4" /> Scarica file
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

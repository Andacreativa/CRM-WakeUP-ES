"use client";

import { useEffect, useState } from "react";
import { Download, Trash2, Upload, X } from "lucide-react";
import { fmt, MESI, ANNI } from "@/lib/constants";

// Fatture dei fornitori (file caricati): elenco con filtro anno/mese,
// caricamento con estrazione AI e anteprima. La riga apre l'anteprima;
// scarica ed elimina stanno lì dentro. Usato dalla linguetta "Fatture" di
// Fornitori e dalla scheda del fornitore.

export interface FatturaFornitore {
  id: number;
  fileName: string;
  filePath: string | null;
  fileMimeType: string | null;
  fornitoreId: number | null;
  fornitore: { nome: string } | null;
  mese: number;
  anno: number;
  importo: number;
  dataFattura: string | null;
  createdAt: string;
}

export function FattureFornitoriTab({
  fornitori,
  onFornitoreCreato,
}: {
  fornitori: { id: number; nome: string; partitaIva: string | null }[];
  onFornitoreCreato: () => void;
}) {
  const [fatture, setFatture] = useState<FatturaFornitore[]>([]);
  const [filtroMese, setFiltroMese] = useState(0);
  const [filtroAnno, setFiltroAnno] = useState(new Date().getFullYear());
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<FatturaFornitore | null>(null);

  const load = async () => {
    const params = new URLSearchParams();
    params.set("anno", String(filtroAnno));
    if (filtroMese > 0) params.set("mese", String(filtroMese));
    const data = await (
      await fetch(`/api/fatture-fornitori?${params}`)
    ).json();
    setFatture(Array.isArray(data) ? data : []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroMese, filtroAnno]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select
            value={filtroAnno}
            onChange={(e) => setFiltroAnno(parseInt(e.target.value))}
            className="sel"
          >
            {ANNI.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={filtroMese}
            onChange={(e) => setFiltroMese(parseInt(e.target.value))}
            className="sel"
          >
            <option value={0}>Tutti i mesi</option>
            {MESI.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            {fatture.length} fatture
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (fatture.length === 0) return;
              const params = new URLSearchParams();
              params.set("anno", String(filtroAnno));
              if (filtroMese > 0) params.set("mese", String(filtroMese));
              const res = await fetch(`/api/fatture-fornitori/zip?${params}`);
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`Errore download: ${err.error ?? res.statusText}`);
                return;
              }
              const blob = await res.blob();
              const dispo = res.headers.get("content-disposition") ?? "";
              const m = dispo.match(/filename="?([^"]+)"?/);
              const fname = m ? decodeURIComponent(m[1]) : "fatture.zip";
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = fname;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            disabled={fatture.length === 0}
            title={fatture.length === 0 ? "Nessuna fattura nel filtro" : "Scarica ZIP"}
            className="btn btn-secondary disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Scarica ZIP
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="btn btn-primary"
          >
            <Upload className="w-4 h-4" /> Carica Fattura
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              {[
                "Fornitore",
                "Nome file",
                "Mese",
                "Importo",
                "Data fattura",
              ].map((h) => (
                <th
                  key={h}
                  className={`${h ==="Importo" ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fatture.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center text-gray-400 py-12 text-sm"
                >
                  Nessuna fattura caricata
                </td>
              </tr>
            )}
            {fatture.map((f) => (
              <tr key={f.id} className="cursor-pointer" onClick={() => setPreview(f)}>
                <td className="font-medium text-gray-900">
                  {f.fornitore?.nome ?? "—"}
                </td>
                <td>
                  <span className="text-brand hover:underline">{f.fileName}</span>
                </td>
                <td>
                  {MESI[f.mese - 1]} {f.anno}
                </td>
                <td className="font-semibold text-gray-900 text-right tabular-nums">
                  {fmt(f.importo)}
                </td>
                <td className="text-gray-500">
                  {f.dataFattura
                    ? new Date(f.dataFattura).toLocaleDateString("it-IT")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showUpload && (
        <UploadFatturaModal
          fornitori={fornitori}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            load();
          }}
          onFornitoreCreato={onFornitoreCreato}
        />
      )}

      {preview && (
        <PreviewFatturaModal
          fattura={preview}
          onClose={() => setPreview(null)}
          onDeleted={() => {
            setPreview(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─── Upload Fattura Modal con drag&drop + AI extract ──────────────────────
export function UploadFatturaModal({
  fornitori,
  fornitoreIniziale,
  onClose,
  onUploaded,
  onFornitoreCreato,
}: {
  fornitori: { id: number; nome: string; partitaIva: string | null }[];
  fornitoreIniziale?: number;
  onClose: () => void;
  onUploaded: () => void;
  onFornitoreCreato: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fornitoreId, setFornitoreId] = useState<number | null>(fornitoreIniziale ?? null);
  const [mese, setMese] = useState(new Date().getMonth() + 1);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [importo, setImporto] = useState<number | "">("");
  const [dataFattura, setDataFattura] = useState("");
  const [extractedNome, setExtractedNome] = useState("");
  const [extractedPiva, setExtractedPiva] = useState("");
  const [matchFound, setMatchFound] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [creatingFornitore, setCreatingFornitore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Match fornitore per partitaIva o nome quando estraiamo o quando i fornitori cambiano
  useEffect(() => {
    if (!extractedNome && !extractedPiva) return;
    const norm = (s: string) =>
      (s || "").toLowerCase().replace(/\s+/g, "").trim();
    const pivaNorm = norm(extractedPiva);
    const nomeNorm = norm(extractedNome);
    let m = pivaNorm
      ? fornitori.find((f) => norm(f.partitaIva ?? "") === pivaNorm)
      : null;
    if (!m && nomeNorm) {
      m = fornitori.find((f) => norm(f.nome) === nomeNorm) ?? null;
    }
    if (m) {
      setFornitoreId(m.id);
      setMatchFound(true);
    } else {
      setMatchFound(false);
    }
  }, [extractedNome, extractedPiva, fornitori]);

  const handleFile = async (f: File) => {
    setFile(f);
    setError(null);
    setInfo(null);
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/extract-fattura-fornitore", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setInfo(`Estrazione AI fallita: ${data.error ?? "errore"}. Compila a mano.`);
        return;
      }
      if (data.fornitore) setExtractedNome(data.fornitore);
      if (data.partitaIva) setExtractedPiva(data.partitaIva);
      if (typeof data.importo === "number") setImporto(data.importo);
      if (typeof data.mese === "number" && data.mese >= 1 && data.mese <= 12)
        setMese(data.mese);
      if (typeof data.data === "string") {
        const m = data.data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
          const dd = m[1].padStart(2, "0");
          const mm = m[2].padStart(2, "0");
          const yyyy = m[3];
          setMese(parseInt(m[2], 10));
          setAnno(parseInt(yyyy, 10));
          setDataFattura(`${yyyy}-${mm}-${dd}`);
        }
      }
    } catch (e) {
      setInfo(`Errore estrazione: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExtracting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const creaFornitore = async () => {
    if (!extractedNome.trim()) return setError("Nome fornitore mancante");
    setCreatingFornitore(true);
    try {
      const res = await fetch("/api/fornitori", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: extractedNome,
          partitaIva: extractedPiva || null,
        }),
      });
      if (!res.ok) {
        setError("Errore creazione fornitore");
        return;
      }
      const created = await res.json();
      setFornitoreId(created.id);
      setMatchFound(true);
      setInfo(`Fornitore "${created.nome}" creato in anagrafica`);
      onFornitoreCreato();
    } finally {
      setCreatingFornitore(false);
    }
  };

  const submit = async () => {
    setError(null);
    console.log("[upload-fattura] submit() start", {
      file,
      fornitoreId,
      mese,
      anno,
      importo,
    });
    if (!file) return setError("Seleziona un file");
    if (!fornitoreId) return setError("Seleziona o crea un fornitore");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("fornitoreId", String(fornitoreId));
      fd.append("mese", String(mese));
      fd.append("anno", String(anno));
      fd.append("importo", String(importo === "" ? 0 : importo));
      if (dataFattura) fd.append("dataFattura", dataFattura);

      // Verifica contenuto FormData prima del send
      const fdEntries: Record<string, string> = {};
      for (const [k, v] of fd.entries()) {
        if (v instanceof File) {
          fdEntries[k] = `File("${v.name}", ${v.size} bytes, "${v.type}")`;
        } else {
          fdEntries[k] = String(v);
        }
      }
      console.log("[upload-fattura] FormData pronto:", fdEntries);
      console.log(
        "[upload-fattura] POST /api/fatture-fornitori (no Content-Type → browser imposta multipart/form-data con boundary)",
      );

      let res: Response;
      try {
        res = await fetch("/api/fatture-fornitori", {
          method: "POST",
          body: fd,
        });
      } catch (fetchErr) {
        const msg =
          fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error("[upload-fattura] fetch THREW:", fetchErr);
        setError(`Errore rete: ${msg}`);
        return;
      }

      console.log(
        `[upload-fattura] response status=${res.status} ok=${res.ok}`,
      );
      const body = await res.json().catch((e) => {
        console.error("[upload-fattura] response.json() fallita:", e);
        return {};
      });
      console.log("[upload-fattura] response body:", body);

      if (!res.ok) {
        const dbg =
          body.stage || body.code
            ? ` [stage=${body.stage ?? "?"} code=${body.code ?? "?"}]`
            : "";
        setError(
          `${body.error || `Errore salvataggio (${res.status})`}${dbg}`,
        );
        return;
      }
      console.log("[upload-fattura] ✓ salvato, chiudo modal");
      onUploaded();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Carica Fattura</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drag & drop area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("file-input-fornitore")?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-brand/40 bg-brand/10"
              : "border-gray-300 hover:border-brand/40 hover:bg-gray-50"
          }`}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700">
            {file ? file.name : "Trascina qui o clicca per selezionare"}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">PDF, JPG, PNG</p>
          <input
            id="file-input-fornitore"
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
        </div>

        {extracting && (
          <p className="text-xs text-gray-500 text-center">
            Estrazione dati AI in corso...
          </p>
        )}
        {info && (
          <div className="text-xs text-warn bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
            {info}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Fornitore *
            </label>
            <select
              value={fornitoreId ?? ""}
              onChange={(e) =>
                setFornitoreId(parseInt(e.target.value) || null)
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">Seleziona fornitore...</option>
              {fornitori.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            {extractedNome && !matchFound && (
              <div className="mt-2 flex items-center gap-2 bg-warn/10 border border-warn/30 rounded-lg px-3 py-2">
                <span className="text-xs text-warn flex-1">
                  Fornitore estratto:{" "}
                  <strong>{extractedNome}</strong>
                  {extractedPiva ? ` (P.IVA ${extractedPiva})` : ""} — non
                  presente in anagrafica
                </span>
                <button
                  onClick={creaFornitore}
                  disabled={creatingFornitore}
                  className="btn btn-primary btn-sm"
                >
                  {creatingFornitore ? "Creo..." : "Crea fornitore"}
                </button>
              </div>
            )}
            {matchFound && extractedNome && (
              <p className="text-[11px] text-ok mt-1">
                ✓ Fornitore matchato in anagrafica
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Mese *
              </label>
              <select
                value={mese}
                onChange={(e) => setMese(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {MESI.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Anno *
              </label>
              <select
                value={anno}
                onChange={(e) => setAnno(parseInt(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {ANNI.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Importo (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={importo}
                onChange={(e) =>
                  setImporto(
                    e.target.value === "" ? "" : parseFloat(e.target.value),
                  )
                }
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Data fattura
              </label>
              <input
                type="date"
                value={dataFattura}
                onChange={(e) => setDataFattura(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={uploading || !file || !fornitoreId}
            className="btn btn-primary flex-1 disabled:opacity-60"
          >
            {uploading ? "Caricamento..." : "Carica"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Fattura Modal ─────────────────────────────────────────────────
export function PreviewFatturaModal({
  fattura,
  onClose,
  onDeleted,
}: {
  fattura: FatturaFornitore;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const elimina = async () => {
    if (!confirm(`Eliminare la fattura «${fattura.fileName}»?`)) return;
    const res = await fetch(`/api/fatture-fornitori/${fattura.id}`, { method: "DELETE" });
    if (!res.ok) return alert("Eliminazione non riuscita.");
    onDeleted?.();
  };
  const fileUrl = `/api/fatture-fornitori/${fattura.id}/file`;
  const mime = fattura.fileMimeType ?? "";
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(fattura.fileName);
  const isImage = /^image\//.test(mime) || /\.(jpe?g|png|webp|gif)$/i.test(fattura.fileName);

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
    a.download = fattura.fileName;
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
              {fattura.fileName}
            </p>
            <p className="text-[11px] text-gray-500">
              {fattura.fornitore?.nome ?? "—"}
              {" · "}
              {fattura.fileMimeType ?? "tipo sconosciuto"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={downloadFile} className="btn btn-secondary btn-sm">
              <Download className="w-4 h-4" /> Scarica
            </button>
            {onDeleted && (
              <button onClick={elimina} className="btn btn-secondary btn-sm text-bad hover:text-bad">
                <Trash2 className="w-4 h-4" /> Elimina
              </button>
            )}
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
              title={fattura.fileName}
              className="w-full h-full border-0"
            />
          )}
          {isImage && (
            <div className="w-full h-full flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl}
                alt={fattura.fileName}
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Download, FileSpreadsheet } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import { exportExcel } from "@/lib/export";

interface Row {
  id: string;
  label: string;
  totale: number;
  pagate?: number;
  nonPagate?: number;
  removable: boolean;
}

interface MeseEntry {
  mese: number;
  entrate: number;
  uscite: number;
}

interface ReportData {
  mesi: MeseEntry[];
  entrate: Row[];
  uscite: Row[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialAnno: number;
}

const uid = () => Math.random().toString(36).slice(2, 9);
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const fetchJson = async <T,>(url: string): Promise<T[]> => {
  const r = await fetch(url);
  const data = await r.json();
  return Array.isArray(data) ? (data as T[]) : [];
};

interface FatturaRow {
  azienda: string;
  importo: number;
  pagato: boolean;
  mese: number;
  anno: number;
}
interface SpesaRow {
  categoria: string;
  importo: number;
  mese: number;
  anno: number;
}
interface DipendenteRow {
  irpfImporto: number;
  pagamenti: { tipo: string; mese: number; anno: number }[];
}

const CATEGORIE_DIPENDENTI = ["Stipendio", "Seguridad Social"];

export default function ReportModal({ open, onClose, initialAnno }: Props) {
  const [anno, setAnno] = useState(initialAnno);
  const [report, setReport] = useState<ReportData>({
    mesi: [],
    entrate: [],
    uscite: [],
  });
  const [loading, setLoading] = useState(false);

  const computePrefill = async () => {
    setLoading(true);
    try {
      const params = `?anno=${anno}`;
      const [fatture, spese, dipendenti] = await Promise.all([
        fetchJson<FatturaRow>(`/api/fatture${params}`),
        fetchJson<SpesaRow>(`/api/spese${params}`),
        fetchJson<DipendenteRow>(`/api/dipendenti${params}`),
      ]);

      // Mesi
      const mesi: MeseEntry[] = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const entrate = r2(
          fatture
            .filter((f) => f.anno === anno && f.mese === m)
            .reduce((s, f) => s + f.importo, 0),
        );
        const uscite = r2(
          spese
            .filter((s) => s.anno === anno && s.mese === m)
            .reduce((s, e) => s + e.importo, 0),
        );
        return { mese: m, entrate, uscite };
      });

      // Entrate detail
      const fattItalia = fatture.filter((f) => f.azienda === "Italia");
      const fattSpagna = fatture.filter((f) => f.azienda === "Spagna");
      const sumF = (arr: FatturaRow[]) => ({
        totale: r2(arr.reduce((s, f) => s + f.importo, 0)),
        pagate: r2(
          arr.filter((f) => f.pagato).reduce((s, f) => s + f.importo, 0),
        ),
        nonPagate: r2(
          arr.filter((f) => !f.pagato).reduce((s, f) => s + f.importo, 0),
        ),
      });
      const it = sumF(fattItalia);
      const sp = sumF(fattSpagna);

      // Dipendenti: stipendi + seguridad social spese + IRPF€ × mesi pagati
      const totDipSpese = spese
        .filter((s) => CATEGORIE_DIPENDENTI.includes(s.categoria))
        .reduce((s, e) => s + e.importo, 0);
      const totIrpf = dipendenti.reduce((acc, d) => {
        const monthsPaid = (d.pagamenti ?? []).filter(
          (p) => p.tipo === "stipendio" && p.anno === anno,
        ).length;
        return acc + (d.irpfImporto ?? 0) * monthsPaid;
      }, 0);
      const totaleDipendenti = r2(totDipSpese + totIrpf);

      // Categorie fisse (label visibile → categoria spesa)
      const CATEGORIE_FISSE: { label: string; key: string }[] = [
        { label: "UFFICIO", key: "Ufficio" },
        { label: "TASSE", key: "Tasse" },
        { label: "COSTI AZIENDALI", key: "Costi Aziendali" },
        { label: "CARTA AZIENDALE", key: "Carta Aziendale" },
        { label: "COSTI BANCARI", key: "Costi Bancari" },
        { label: "SOFTWARE", key: "Software" },
        { label: "COMMERCIALISTA", key: "Commercialista" },
        { label: "FORNITORI", key: "Fornitori" },
      ];
      const sumCat = (key: string) =>
        r2(
          spese
            .filter((s) => s.categoria === key)
            .reduce((s, e) => s + e.importo, 0),
        );
      const categorieRows: Row[] = CATEGORIE_FISSE.map(({ label, key }) => ({
        id: uid(),
        label,
        totale: sumCat(key),
        removable: true,
      }));

      setReport({
        mesi,
        entrate: [
          {
            id: uid(),
            label: "Fatture Italia",
            totale: it.totale,
            pagate: it.pagate,
            nonPagate: it.nonPagate,
            removable: false,
          },
          {
            id: uid(),
            label: "Fatture Spagna",
            totale: sp.totale,
            pagate: sp.pagate,
            nonPagate: sp.nonPagate,
            removable: false,
          },
        ],
        uscite: [
          {
            id: uid(),
            label: "DIPENDENTI",
            totale: totaleDipendenti,
            removable: true,
          },
          ...categorieRows,
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) computePrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anno]);

  const updateRow = (
    section: "entrate" | "uscite",
    id: string,
    patch: Partial<Row>,
  ) => {
    const rounded: Partial<Row> = { ...patch };
    if (rounded.totale != null) rounded.totale = r2(rounded.totale);
    if (rounded.pagate != null) rounded.pagate = r2(rounded.pagate);
    if (rounded.nonPagate != null) rounded.nonPagate = r2(rounded.nonPagate);
    setReport((r) => ({
      ...r,
      [section]: r[section].map((row) =>
        row.id === id ? { ...row, ...rounded } : row,
      ),
    }));
  };
  const addRow = (section: "entrate" | "uscite") =>
    setReport((r) => ({
      ...r,
      [section]: [
        ...r[section],
        { id: uid(), label: "Nuova voce", totale: 0, removable: true },
      ],
    }));
  const removeRow = (section: "entrate" | "uscite", id: string) =>
    setReport((r) => ({
      ...r,
      [section]: r[section].filter((row) => row.id !== id),
    }));
  const updateMese = (
    mese: number,
    field: "entrate" | "uscite",
    val: number,
  ) =>
    setReport((r) => ({
      ...r,
      mesi: r.mesi.map((m) =>
        m.mese === mese ? { ...m, [field]: r2(val) } : m,
      ),
    }));

  const totaleEntrate = useMemo(
    () => r2(report.entrate.reduce((s, r) => s + r.totale, 0)),
    [report.entrate],
  );
  const totaleUscite = useMemo(
    () => r2(report.uscite.reduce((s, r) => s + r.totale, 0)),
    [report.uscite],
  );
  const bilancio = r2(totaleEntrate - totaleUscite);

  const totEntrateMesi = useMemo(
    () => r2(report.mesi.reduce((s, m) => s + m.entrate, 0)),
    [report.mesi],
  );
  const totUsciteMesi = useMemo(
    () => r2(report.mesi.reduce((s, m) => s + m.uscite, 0)),
    [report.mesi],
  );
  const bilancioMesi = r2(totEntrateMesi - totUsciteMesi);

  // ── Export Excel ───────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const data: Record<string, unknown>[] = [];
    data.push({
      Sezione: "RIEPILOGO ANNUALE",
      Voce: "",
      Totale: "",
      Pagate: "",
      "Non Pagate": "",
    });
    data.push({
      Sezione: "",
      Voce: "Totale Entrate",
      Totale: totaleEntrate,
      Pagate: "",
      "Non Pagate": "",
    });
    data.push({
      Sezione: "",
      Voce: "Totale Uscite",
      Totale: totaleUscite,
      Pagate: "",
      "Non Pagate": "",
    });
    data.push({
      Sezione: "",
      Voce: "Bilancio Netto",
      Totale: bilancio,
      Pagate: "",
      "Non Pagate": "",
    });
    data.push({});

    data.push({
      Sezione: "BILANCIO MESE PER MESE",
      Voce: "",
      Totale: "",
      Pagate: "",
      "Non Pagate": "",
    });
    for (const m of report.mesi) {
      data.push({
        Sezione: "",
        Voce: MESI[m.mese - 1],
        Totale: "",
        Entrate: m.entrate,
        Uscite: m.uscite,
        Bilancio: m.entrate - m.uscite,
      });
    }
    data.push({
      Sezione: "",
      Voce: "TOTALE",
      Entrate: totEntrateMesi,
      Uscite: totUsciteMesi,
      Bilancio: bilancioMesi,
    });
    data.push({});

    data.push({
      Sezione: "DETTAGLIO ENTRATE",
      Voce: "",
      Totale: "",
      Pagate: "",
      "Non Pagate": "",
    });
    for (const r of report.entrate) {
      data.push({
        Sezione: "",
        Voce: r.label,
        Totale: r.totale,
        Pagate: r.pagate ?? "",
        "Non Pagate": r.nonPagate ?? "",
      });
    }
    data.push({
      Sezione: "",
      Voce: "TOTALE ENTRATE",
      Totale: totaleEntrate,
      Pagate: "",
      "Non Pagate": "",
    });
    data.push({});

    data.push({
      Sezione: "DETTAGLIO USCITE",
      Voce: "",
      Totale: "",
      Pagate: "",
      "Non Pagate": "",
    });
    for (const r of report.uscite) {
      data.push({
        Sezione: "",
        Voce: r.label,
        Totale: r.totale,
        Pagate: "",
        "Non Pagate": "",
      });
    }
    data.push({
      Sezione: "",
      Voce: "TOTALE USCITE",
      Totale: totaleUscite,
      Pagate: "",
      "Non Pagate": "",
    });

    exportExcel(data, `report_${anno}`);
  };

  // ── Export PDF (multi-tabella inline) ─────────────────────────────────
  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "portrait" });
    const ML = 14,
      MR = 14;

    // Logo Anda (top-left)
    const logo = await new Promise<HTMLImageElement | null>((resolve) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = "/logo anda.png";
    });
    let textOffsetY = 16;
    if (logo) {
      const h = 30;
      const w = h * (logo.naturalWidth / logo.naturalHeight);
      doc.addImage(logo, "PNG", ML, 8, w, h);
      textOffsetY = 41;
    }

    // Company name + titolo (sotto il logo)
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Anda Agencia de Publicidad SL", ML, textOffsetY);
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(`Report ${anno}`, ML, textOffsetY + 8);

    let y = textOffsetY + 16;

    // Riepilogo annuale (box con head/body/foot stile tabella)
    autoTable(doc, {
      head: [["RIEPILOGO ANNUALE", "Importo"]],
      body: [
        ["Totale Entrate", fmt(totaleEntrate)],
        ["Totale Uscite", fmt(totaleUscite)],
      ],
      foot: [
        [
          "BILANCIO NETTO",
          {
            content: fmt(bilancio),
            styles: {
              textColor: bilancio >= 0 ? [16, 185, 129] : [239, 68, 68],
            },
          },
        ],
      ],
      startY: y,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: {
        fillColor: [233, 30, 140],
        textColor: 255,
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: 30,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      margin: { left: ML, right: MR },
      didParseCell: (data) => {
        if (data.column.index >= 1) data.cell.styles.halign = "right";
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

    // Bilancio mese per mese
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("BILANCIO MESE PER MESE", ML, y);
    y += 2;
    autoTable(doc, {
      head: [["Mese", "Entrate", "Uscite", "Bilancio"]],
      body: report.mesi.map((m) => {
        const bil = m.entrate - m.uscite;
        return [
          MESI[m.mese - 1],
          fmt(m.entrate),
          fmt(m.uscite),
          {
            content: fmt(bil),
            styles: {
              textColor: bil >= 0 ? [16, 185, 129] : [239, 68, 68],
              fontStyle: "bold",
            },
          },
        ];
      }),
      foot: [
        [
          "TOTALE",
          fmt(totEntrateMesi),
          fmt(totUsciteMesi),
          {
            content: fmt(bilancioMesi),
            styles: {
              textColor: bilancioMesi >= 0 ? [16, 185, 129] : [239, 68, 68],
            },
          },
        ],
      ],
      startY: y + 2,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: {
        fillColor: [233, 30, 140],
        textColor: 255,
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: 30,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      margin: { left: ML, right: MR },
      didParseCell: (data) => {
        if (data.column.index >= 1) data.cell.styles.halign = "right";
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

    // Dettaglio entrate
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("DETTAGLIO ENTRATE", ML, y);
    y += 2;
    const totPagate = r2(
      report.entrate.reduce((s, r) => s + (r.pagate ?? 0), 0),
    );
    const totNonPagate = r2(
      report.entrate.reduce((s, r) => s + (r.nonPagate ?? 0), 0),
    );
    autoTable(doc, {
      head: [["Voce", "Totale", "Pagate", "Non Pagate"]],
      body: report.entrate.map((r) => [
        r.label,
        fmt(r.totale),
        r.pagate != null ? fmt(r.pagate) : "—",
        r.nonPagate != null ? fmt(r.nonPagate) : "—",
      ]),
      foot: [
        [
          "TOTALE ENTRATE",
          fmt(totaleEntrate),
          {
            content: fmt(totPagate),
            styles: { textColor: [16, 185, 129] },
          },
          {
            content: fmt(totNonPagate),
            styles: { textColor: [245, 158, 11] },
          },
        ],
      ],
      startY: y + 2,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: {
        fillColor: [233, 30, 140],
        textColor: 255,
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: 30,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      margin: { left: ML, right: MR },
      didParseCell: (data) => {
        if (data.column.index >= 1) data.cell.styles.halign = "right";
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

    // Dettaglio uscite — controlla spazio per page break
    if (y > 230) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("DETTAGLIO USCITE PRINCIPALI", ML, y);
    y += 2;
    autoTable(doc, {
      head: [["Voce", "Totale"]],
      body: report.uscite.map((r) => [r.label, fmt(r.totale)]),
      startY: y + 2,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: {
        fillColor: [233, 30, 140],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      margin: { left: ML, right: MR },
      didParseCell: (data) => {
        if (data.column.index >= 1) data.cell.styles.halign = "right";
      },
    });

    doc.save(`report_${anno}.pdf`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-4xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Report {anno}</h2>
          <div className="flex items-center gap-3">
            <select
              value={anno}
              onChange={(e) => setAnno(parseInt(e.target.value))}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
            >
              {[2024, 2025, 2026].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              aria-label="Chiudi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading && (
          <p className="text-xs text-gray-500 text-center">Caricamento...</p>
        )}

        {/* RIEPILOGO ANNUALE */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
              Totale Entrate
            </p>
            <p className="text-lg font-bold text-emerald-700 mt-0.5">
              {fmt(totaleEntrate)}
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
              Totale Uscite
            </p>
            <p className="text-lg font-bold text-red-700 mt-0.5">
              {fmt(totaleUscite)}
            </p>
          </div>
          <div
            className="rounded-xl p-3 border-2"
            style={{
              background: bilancio >= 0 ? "#f0fdf4" : "#fef2f2",
              borderColor: bilancio >= 0 ? "#86efac" : "#fca5a5",
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: bilancio >= 0 ? "#15803d" : "#dc2626" }}
            >
              Bilancio Netto
            </p>
            <p
              className="text-lg font-bold mt-0.5"
              style={{ color: bilancio >= 0 ? "#15803d" : "#dc2626" }}
            >
              {fmt(bilancio)}
            </p>
          </div>
        </div>

        {/* BILANCIO MESE PER MESE */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Bilancio mese per mese
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Mese</th>
                <th className="px-3 py-2 text-right font-medium">Entrate</th>
                <th className="px-3 py-2 text-right font-medium">Uscite</th>
                <th className="px-3 py-2 text-right font-medium">Bilancio</th>
              </tr>
            </thead>
            <tbody>
              {report.mesi.map((m) => {
                const bil = m.entrate - m.uscite;
                return (
                  <tr key={m.mese} className="border-b border-gray-50">
                    <td className="px-3 py-1.5 text-gray-700">
                      {MESI[m.mese - 1]}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={m.entrate}
                        onChange={(e) =>
                          updateMese(
                            m.mese,
                            "entrate",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-28 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-pink-300 rounded px-1 py-0.5 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={m.uscite}
                        onChange={(e) =>
                          updateMese(
                            m.mese,
                            "uscite",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-28 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-pink-300 rounded px-1 py-0.5 text-right tabular-nums"
                      />
                    </td>
                    <td
                      className="px-3 py-1.5 text-right font-semibold tabular-nums"
                      style={{
                        color: bil >= 0 ? "#15803d" : "#dc2626",
                      }}
                    >
                      {fmt(bil)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-sm">
                <td className="px-3 py-2 text-gray-700">TOTALE</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                  {fmt(totEntrateMesi)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">
                  {fmt(totUsciteMesi)}
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums"
                  style={{
                    color: bilancioMesi >= 0 ? "#15803d" : "#dc2626",
                  }}
                >
                  {fmt(bilancioMesi)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* DETTAGLIO ENTRATE */}
        <DetailSection
          title="Dettaglio Entrate"
          rows={report.entrate}
          totale={totaleEntrate}
          totaleColor="#10b981"
          showFattureCols
          onUpdate={(id, patch) => updateRow("entrate", id, patch)}
          onRemove={(id) => removeRow("entrate", id)}
          onAdd={() => addRow("entrate")}
        />

        {/* DETTAGLIO USCITE */}
        <DetailSection
          title="Dettaglio Uscite"
          rows={report.uscite}
          totale={totaleUscite}
          totaleColor="#ef4444"
          onUpdate={(id, patch) => updateRow("uscite", id, patch)}
          onRemove={(id) => removeRow("uscite", id)}
          onAdd={() => addRow("uscite")}
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
          >
            Chiudi
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Esporta Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="glass-btn-primary flex items-center justify-center gap-2 flex-1 text-white text-sm font-medium py-2.5 rounded-xl"
          >
            <Download className="w-4 h-4" />
            Esporta PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  rows,
  totale,
  totaleColor,
  showFattureCols,
  onUpdate,
  onRemove,
  onAdd,
}: {
  title: string;
  rows: Row[];
  totale: number;
  totaleColor: string;
  showFattureCols?: boolean;
  onUpdate: (id: string, patch: Partial<Row>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-500">
            <th className="px-3 py-2 text-left font-medium">Voce</th>
            <th className="px-3 py-2 text-right font-medium">Totale</th>
            {showFattureCols && (
              <>
                <th className="px-3 py-2 text-right font-medium">Pagate</th>
                <th className="px-3 py-2 text-right font-medium">Non Pagate</th>
              </>
            )}
            <th className="px-3 py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-50">
              <td className="px-3 py-1.5">
                <input
                  type="text"
                  value={r.label}
                  onChange={(e) => onUpdate(r.id, { label: e.target.value })}
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-pink-300 rounded px-1 py-0.5 text-gray-800"
                />
              </td>
              <td className="px-3 py-1.5 text-right">
                <input
                  type="number"
                  step="0.01"
                  value={r.totale}
                  onChange={(e) =>
                    onUpdate(r.id, { totale: parseFloat(e.target.value) || 0 })
                  }
                  className="w-28 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-pink-300 rounded px-1 py-0.5 text-right tabular-nums font-medium text-gray-900"
                />
              </td>
              {showFattureCols && (
                <>
                  <td className="px-3 py-1.5 text-right">
                    {r.pagate != null && (
                      <input
                        type="number"
                        step="0.01"
                        value={r.pagate}
                        onChange={(e) =>
                          onUpdate(r.id, {
                            pagate: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-24 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-pink-300 rounded px-1 py-0.5 text-right tabular-nums text-emerald-700"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {r.nonPagate != null && (
                      <input
                        type="number"
                        step="0.01"
                        value={r.nonPagate}
                        onChange={(e) =>
                          onUpdate(r.id, {
                            nonPagate: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-24 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-pink-300 rounded px-1 py-0.5 text-right tabular-nums text-amber-700"
                      />
                    )}
                  </td>
                </>
              )}
              <td className="px-2 py-1.5 text-center">
                {r.removable && (
                  <button
                    onClick={() => onRemove(r.id)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label="Rimuovi riga"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={showFattureCols ? 5 : 3} className="px-3 py-1.5">
              <button
                onClick={onAdd}
                className="text-xs text-pink-600 hover:text-pink-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Aggiungi riga
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td className="px-3 py-2 text-sm font-semibold text-gray-700">
              TOTALE
            </td>
            <td
              className="px-3 py-2 text-right text-sm font-bold tabular-nums"
              style={{ color: totaleColor }}
            >
              {fmt(totale)}
            </td>
            {showFattureCols && <td colSpan={2} />}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

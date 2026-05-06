"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { fmt, MESI } from "@/lib/constants";
import FiltriBar from "@/components/FiltriBar";
import { useAnno } from "@/lib/anno-context";
import { exportExcel, exportPDF, loadOptimizedLogo } from "@/lib/export";
import { isFinnRitenuta } from "@/lib/finn-split";
import ReportModal from "@/components/ReportModal";

interface MeseData {
  mese: number;
  entrate: number;
  uscite: number;
  bilancio: number;
}

export default function BilancioPage() {
  const [dati, setDati] = useState<MeseData[]>([]);
  const [fattureTotale, setFattureTotale] = useState(0);
  const [fattureTotaleIncassato, setFattureTotaleIncassato] = useState(0);
  const [speseTotale, setSpeseTotale] = useState(0);
  const { anno, setAnno } = useAnno();
  const [azienda, setAzienda] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [modalita, setModalita] = useState<"fatturato" | "incassato">(
    "fatturato",
  );

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams({ anno: String(anno) });
      if (azienda) params.set("azienda", azienda);
      const [rawF, rawS, rawAltri] = await Promise.all([
        (await fetch(`/api/fatture?${params}`)).json() as Promise<any>,
        (await fetch(`/api/spese?${params}`)).json() as Promise<any>,
        (await fetch(`/api/altri-ingressi?${params}`)).json() as Promise<any>,
      ]);
      const fatture: { mese: number; importo: number; pagato?: boolean }[] =
        Array.isArray(rawF) ? rawF : [];
      const spese: { mese: number; importo: number }[] = Array.isArray(rawS)
        ? rawS
        : [];
      const altriRaw: {
        mese: number;
        importo: number;
        fonte?: string | null;
        descrizione?: string | null;
        incassato?: boolean;
      }[] = Array.isArray(rawAltri) ? rawAltri : [];
      // Escludi ritenute Finn dai totali
      const altri = altriRaw.filter((a) => !isFinnRitenuta(a));

      const totFatture = fatture.reduce(
        (s: number, f) => s + (f?.importo ?? 0),
        0,
      );
      const totAltri = altri.reduce((s: number, a) => s + (a?.importo ?? 0), 0);

      const totFattureIncassate = fatture.reduce(
        (s: number, f) => (f?.pagato ? s + (f?.importo ?? 0) : s),
        0,
      );
      const totAltriIncassati = altri.reduce(
        (s: number, a) => (a?.incassato ? s + (a?.importo ?? 0) : s),
        0,
      );

      setFattureTotale(totFatture + totAltri);
      setFattureTotaleIncassato(totFattureIncassate + totAltriIncassati);
      setSpeseTotale(spese.reduce((s: number, e) => s + (e?.importo ?? 0), 0));
      setDati(
        Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const entrFat = fatture
            .filter((f) => f?.mese === m)
            .reduce((s: number, f) => s + (f?.importo ?? 0), 0);
          const entrAltri = altri
            .filter((a) => a?.mese === m)
            .reduce((s: number, a) => s + (a?.importo ?? 0), 0);
          const entrate = entrFat + entrAltri;
          const uscite = spese
            .filter((e) => e?.mese === m)
            .reduce((s: number, e) => s + (e?.importo ?? 0), 0);
          return { mese: m, entrate, uscite, bilancio: entrate - uscite };
        }),
      );
    };
    run();
  }, [anno, azienda]);

  const bilancioTotale = fattureTotale - speseTotale;

  // Analisi virtuale Italia: costi stimati NON contabilizzati nel bilancio reale
  const isItalia = azienda === "Italia";
  const baseFatturato =
    modalita === "incassato" ? fattureTotaleIncassato : fattureTotale;
  // Contributi costo dipendenti: 2000€ × mesi trascorsi nell'anno selezionato
  // - Anno corrente: dal 1° al mese odierno
  // - Anno passato: 12 mesi pieni
  // - Anno futuro: 0
  const oggi = new Date();
  const annoCorrente = oggi.getFullYear();
  const meseCorrente = oggi.getMonth() + 1;
  const mesiTrascorsi =
    anno < annoCorrente ? 12 : anno === annoCorrente ? meseCorrente : 0;
  const meseLabel = MESI[Math.max(0, mesiTrascorsi - 1)] ?? "";
  const periodoStipendiLabel =
    mesiTrascorsi === 12
      ? `gen-dic`
      : mesiTrascorsi > 0
        ? `gen-${meseLabel.slice(0, 3).toLowerCase()}`
        : "—";
  const contributoStipendi = 2000 * mesiTrascorsi;

  // Ufficio: parte da Aprile 2026 (€390/mese; aprile 2026 include matricola = €610,20)
  const UFFICIO_START_YEAR = 2026;
  const UFFICIO_START_MONTH = 4;
  const UFFICIO_RATE = 390;
  const UFFICIO_FIRST_MONTH_COST = 610.2;
  let ufficioMesi = 0;
  let ufficioCosto = 0;
  if (anno >= UFFICIO_START_YEAR && anno <= annoCorrente) {
    const meseLimite = anno === annoCorrente ? meseCorrente : 12;
    if (anno === UFFICIO_START_YEAR) {
      if (meseLimite >= UFFICIO_START_MONTH) {
        ufficioMesi = meseLimite - UFFICIO_START_MONTH + 1;
        ufficioCosto =
          UFFICIO_FIRST_MONTH_COST + (ufficioMesi - 1) * UFFICIO_RATE;
      }
    } else {
      // Anni successivi al 2026: nessuna matricola, quote regolari fino al mese limite
      ufficioMesi = meseLimite;
      ufficioCosto = meseLimite * UFFICIO_RATE;
    }
  }
  const ufficioSubLabel =
    anno === UFFICIO_START_YEAR
      ? "(€390/mese da apr · apr: €610,20)"
      : ufficioMesi > 0
        ? `(€390/mese × ${ufficioMesi})`
        : "—";

  const costiGestione = baseFatturato * 0.15;
  const totaleCostiVirtuali = contributoStipendi + ufficioCosto + costiGestione;
  const margineNettoStimato = baseFatturato - totaleCostiVirtuali;
  const modalitaLabel =
    modalita === "incassato" ? "Su Incassato" : "Su Fatturato";
  const ANALISI_TITLE = `Analisi Investimento Italia — non contabilizzata (${modalitaLabel})`;
  const fatturatoLabel =
    modalita === "incassato" ? "Fatturato Italia (incassato)" : "Fatturato Italia";

  const chartData = dati.map((d) => ({
    name: MESI[d.mese - 1].slice(0, 3),
    Entrate: d.entrate,
    Uscite: d.uscite,
    Bilancio: d.bilancio,
  }));

  const handleExcel = async () => {
    const baseSheet = dati.map((d) => ({
      Mese: MESI[d.mese - 1],
      Entrate: d.entrate,
      Uscite: d.uscite,
      Bilancio: d.bilancio,
    }));

    if (isItalia) {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(baseSheet),
        "Bilancio",
      );
      const analisi = [
        { Voce: ANALISI_TITLE, Valore: "" },
        { Voce: `Modalità calcolo: ${modalitaLabel}`, Valore: "" },
        { Voce: fatturatoLabel, Valore: baseFatturato },
        {
          Voce: `Contributi costo dipendenti (€2.000 × ${mesiTrascorsi} mesi · ${periodoStipendiLabel})`,
          Valore: contributoStipendi,
        },
        {
          Voce: `Ufficio ${ufficioSubLabel}`,
          Valore: ufficioCosto,
        },
        { Voce: "Costi Gestione Aziendale (15%)", Valore: costiGestione },
        { Voce: "Totale Costi Virtuali", Valore: totaleCostiVirtuali },
        { Voce: "Margine Netto Stimato", Valore: margineNettoStimato },
      ];
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(analisi),
        "Analisi virtuale",
      );
      XLSX.writeFile(
        wb,
        `bilancio_${anno}_Italia_${modalita === "incassato" ? "incassato" : "fatturato"}.xlsx`,
      );
      return;
    }

    exportExcel(baseSheet, `bilancio_${anno}`);
  };

  const handlePDF = async () => {
    const title = `Bilancio ${anno}${azienda ? ` — ${azienda}` : ""}`;
    const columns = ["Mese", "Entrate", "Uscite", "Bilancio"];
    const rows = dati.map((d) => [
      MESI[d.mese - 1],
      fmt(d.entrate),
      fmt(d.uscite),
      fmt(d.bilancio),
    ]);
    const filename = `bilancio_${anno}${isItalia ? `_Italia_${modalita}` : ""}`;

    if (!isItalia) {
      await exportPDF(title, columns, rows, filename);
      return;
    }

    // Bilancio Italia: PDF custom con box "Analisi Investimento Italia"
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const ML = 14;

    // Header con logo (JPEG compresso per ridurre peso PDF)
    let y = 16;
    const logo = await loadOptimizedLogo("/logo anda.png");
    if (logo) {
      const h = 24;
      const w = h * (logo.width / logo.height);
      doc.addImage(logo.dataUrl, "JPEG", ML, 8, w, h);
      y = 38;
    } else {
      y = 24;
    }

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Anda Agencia de Publicidad SL", ML, y);
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(title, ML, y + 8);

    // Tabella bilancio principale (stesso stile di exportPDF)
    autoTable(doc, {
      head: [columns],
      body: rows,
      startY: y + 14,
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: {
        fillColor: [233, 30, 140],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      margin: { left: ML, right: ML },
    });

    let cursor =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 10;

    // ── Box "Analisi Investimento Italia — non contabilizzata" ──
    const boxRows: Array<{
      label: string;
      sub?: string;
      value: string;
      color?: [number, number, number];
      bold?: boolean;
      separator?: "thin" | "thick";
    }> = [
      {
        label: fatturatoLabel,
        value: fmt(baseFatturato),
        color: [4, 120, 87], // emerald-700
        separator: "thin",
      },
      {
        label: "Contributi costo dipendenti",
        sub: `(€2.000 × ${mesiTrascorsi} mesi · ${periodoStipendiLabel})`,
        value: fmt(contributoStipendi),
        color: [220, 38, 38], // red-600
        separator: "thin",
      },
      {
        label: "Ufficio",
        sub: ufficioSubLabel,
        value: fmt(ufficioCosto),
        color: [220, 38, 38],
        separator: "thin",
      },
      {
        label: "Costi Gestione Aziendale",
        sub: `(15% ${modalita === "incassato" ? "incassato" : "fatturato"})`,
        value: fmt(costiGestione),
        color: [220, 38, 38],
        separator: "thin",
      },
      {
        label: "Totale Costi Virtuali",
        value: fmt(totaleCostiVirtuali),
        color: [185, 28, 28], // red-700
        bold: true,
        separator: "thick",
      },
      {
        label: "Margine Netto Stimato",
        value: fmt(margineNettoStimato),
        color:
          margineNettoStimato >= 0
            ? [4, 120, 87] // emerald-700
            : [185, 28, 28], // red-700
        bold: true,
      },
    ];

    const boxX = ML;
    const boxW = pageW - ML * 2;
    const headerH = 22;
    const modalitaH = 7;
    const rowH = 8;
    const padBottom = 6;
    const boxH = headerH + modalitaH + boxRows.length * rowH + padBottom;

    // Page break se non c'è spazio
    if (cursor + boxH > pageH - 10) {
      doc.addPage();
      cursor = 16;
    }

    // Sfondo crema #FFF8E7
    doc.setFillColor(255, 248, 231);
    doc.rect(boxX, cursor, boxW, boxH, "F");

    // Bordo tratteggiato amber #FCD34D
    doc.setDrawColor(252, 191, 36);
    doc.setLineWidth(0.6);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.rect(boxX, cursor, boxW, boxH);
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.2);

    // Titolo (amber-900)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(120, 53, 15); // amber-900
    doc.text(ANALISI_TITLE, boxX + 5, cursor + 8);

    // Sottotitolo (amber-800)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text(
      "Stima virtuale: questi valori NON modificano il bilancio reale né alcun dato registrato.",
      boxX + 5,
      cursor + 14,
    );

    // Badge "SOLO SIMULAZIONE" in alto a destra
    const badgeText = "SOLO SIMULAZIONE";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const badgeTextW = doc.getTextWidth(badgeText);
    const badgePadX = 3;
    const badgeW = badgeTextW + badgePadX * 2;
    const badgeH = 5;
    const badgeX = boxX + boxW - badgeW - 5;
    const badgeY = cursor + 5;
    doc.setFillColor(254, 243, 199); // amber-100
    doc.setDrawColor(252, 191, 36);
    doc.setLineWidth(0.4);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, "FD");
    doc.setLineWidth(0.2);
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text(badgeText, badgeX + badgePadX, badgeY + 3.6);

    // Modalità calcolo (italic, grigio)
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Modalità calcolo: ${modalitaLabel}`,
      boxX + 5,
      cursor + headerH - 1,
    );

    // Righe valori
    let rowY = cursor + headerH + modalitaH;
    for (const r of boxRows) {
      // Separatore sopra (sottile o spesso)
      if (r.separator === "thick") {
        doc.setDrawColor(252, 191, 36); // amber-300
        doc.setLineWidth(0.6);
      } else {
        doc.setDrawColor(253, 230, 138); // amber-200
        doc.setLineWidth(0.2);
      }
      doc.line(boxX + 5, rowY - 1.5, boxX + boxW - 5, rowY - 1.5);
      doc.setLineWidth(0.2);

      // Label
      doc.setFont("helvetica", r.bold ? "bold" : "normal");
      doc.setFontSize(r.bold ? 10 : 9.5);
      doc.setTextColor(60, 60, 60);
      doc.text(r.label, boxX + 5, rowY + 4);

      // Sublabel (es. "(€2.000 × 5 mesi · gen-mag)")
      if (r.sub) {
        const labelW = doc.getTextWidth(r.label);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(r.sub, boxX + 5 + labelW + 1.5, rowY + 4);
      }

      // Valore allineato a destra
      doc.setFont("helvetica", r.bold ? "bold" : "normal");
      doc.setFontSize(r.bold ? 10 : 9.5);
      const c = r.color ?? [60, 60, 60];
      doc.setTextColor(c[0], c[1], c[2]);
      doc.text(r.value, boxX + boxW - 5, rowY + 4, { align: "right" });

      rowY += rowH;
    }

    doc.save(`${filename}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bilancio</h1>
          <p className="text-gray-500 text-sm mt-1">
            Conto economico {anno}
            {azienda ? ` — ${azienda}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar
            anno={anno}
            azienda={azienda}
            onAnno={setAnno}
            onAzienda={setAzienda}
          />
          <button
            onClick={handleExcel}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel
          </button>
          <button
            onClick={handlePDF}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-50"
          >
            <Download className="w-4 h-4 text-red-500" /> PDF
          </button>
          <button
            onClick={() => setReportOpen(true)}
            className="glass-btn-primary flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl"
          >
            <FileText className="w-4 h-4" /> Genera Report
          </button>
        </div>
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        initialAnno={anno}
      />

      {/* KPI Totali */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Totale Entrate
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {fmt(fattureTotale)}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Totale Uscite
          </p>
          <p className="text-2xl font-bold text-red-500 mt-1">
            {fmt(speseTotale)}
          </p>
        </div>
        <div
          className={`glass-card rounded-2xl p-5 ${
            bilancioTotale > 0
              ? "bg-emerald-50/60"
              : bilancioTotale < 0
                ? "bg-red-50/60"
                : ""
          }`}
        >
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Bilancio Netto
          </p>
          <p
            className={`text-2xl font-bold mt-1 ${
              bilancioTotale > 0
                ? "text-emerald-600"
                : bilancioTotale < 0
                  ? "text-red-600"
                  : "text-gray-500"
            }`}
          >
            {fmt(bilancioTotale)}
          </p>
        </div>
      </div>

      {/* Grafico Entrate vs Uscite */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Entrate vs Uscite per Mese
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barSize={20} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <Bar dataKey="Entrate" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Uscite" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Grafico Bilancio netto */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Bilancio Netto per Mese
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={2} />
            <Bar dataKey="Bilancio" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Bar
                  key={i}
                  dataKey="Bilancio"
                  fill={entry.Bilancio >= 0 ? "#10b981" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabella mensile */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {["Mese", "Entrate", "Uscite", "Bilancio"].map((h, i) => (
                <th
                  key={h}
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3 ${i > 0 ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="zebra">
            {dati.map((d) => (
              <tr
                key={d.mese}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-3 text-sm font-medium text-gray-800">
                  {MESI[d.mese - 1]}
                </td>
                <td
                  className="px-6 py-3 text-sm font-semibold text-right"
                  style={{ color: d.entrate > 0 ? "#10b981" : "#94a3b8" }}
                >
                  {d.entrate > 0 ? fmt(d.entrate) : "—"}
                </td>
                <td className="px-6 py-3 text-sm font-semibold text-red-500 text-right">
                  {d.uscite > 0 ? fmt(d.uscite) : "—"}
                </td>
                <td
                  className={`px-6 py-3 text-sm font-bold text-right ${d.bilancio >= 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {d.entrate === 0 && d.uscite === 0 ? "—" : fmt(d.bilancio)}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
              <td className="px-6 py-3 text-sm text-gray-800">TOTALE ANNO</td>
              <td className="px-6 py-3 text-sm text-right text-emerald-600">
                {fmt(fattureTotale)}
              </td>
              <td className="px-6 py-3 text-sm text-red-500 text-right">
                {fmt(speseTotale)}
              </td>
              <td
                className={`px-6 py-3 text-sm text-right ${bilancioTotale >= 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {fmt(bilancioTotale)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Analisi virtuale Italia (non contabilizzata) */}
      {isItalia && (
        <div
          className="rounded-2xl p-6 border-2 border-dashed border-amber-300"
          style={{ background: "#FFF8E7" }}
        >
          <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
            <div>
              <h2 className="text-base font-bold text-amber-900">
                {ANALISI_TITLE}
              </h2>
              <p className="text-xs text-amber-800/80 mt-0.5">
                Stima virtuale: questi valori NON modificano il bilancio reale
                né alcun dato registrato.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-1 rounded-md uppercase tracking-wide">
              Solo simulazione
            </span>
          </div>

          {/* Toggle modalità calcolo */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-medium text-amber-900">
              Modalità calcolo:
            </span>
            <div className="inline-flex rounded-lg overflow-hidden border border-amber-300 bg-white/60">
              {(
                [
                  { v: "fatturato", l: "Su Fatturato" },
                  { v: "incassato", l: "Su Incassato" },
                ] as const
              ).map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setModalita(v)}
                  className="text-xs font-semibold px-3 py-1.5 transition-colors"
                  style={
                    modalita === v
                      ? { background: "#b45309", color: "#fff" }
                      : { background: "transparent", color: "#92400e" }
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-amber-200/60">
                <td className="py-2 text-gray-700">{fatturatoLabel}</td>
                <td className="py-2 text-right font-semibold text-emerald-700 tabular-nums">
                  {fmt(baseFatturato)}
                </td>
              </tr>
              <tr className="border-b border-amber-200/60">
                <td className="py-2 text-gray-700">
                  Contributi costo dipendenti
                  <span className="text-xs text-gray-500 ml-1">
                    (€2.000 × {mesiTrascorsi} mesi · {periodoStipendiLabel})
                  </span>
                </td>
                <td className="py-2 text-right font-medium text-red-600 tabular-nums">
                  {fmt(contributoStipendi)}
                </td>
              </tr>
              <tr className="border-b border-amber-200/60">
                <td className="py-2 text-gray-700">
                  Ufficio
                  <span className="text-xs text-gray-500 ml-1">
                    {ufficioSubLabel}
                  </span>
                </td>
                <td className="py-2 text-right font-medium text-red-600 tabular-nums">
                  {fmt(ufficioCosto)}
                </td>
              </tr>
              <tr className="border-b border-amber-200/60">
                <td className="py-2 text-gray-700">
                  Costi Gestione Aziendale
                  <span className="text-xs text-gray-500 ml-1">
                    (15% {modalita === "incassato" ? "incassato" : "fatturato"})
                  </span>
                </td>
                <td className="py-2 text-right font-medium text-red-600 tabular-nums">
                  {fmt(costiGestione)}
                </td>
              </tr>
              <tr className="border-b-2 border-amber-300">
                <td className="py-2 font-semibold text-gray-800">
                  Totale Costi Virtuali
                </td>
                <td className="py-2 text-right font-bold text-red-700 tabular-nums">
                  {fmt(totaleCostiVirtuali)}
                </td>
              </tr>
              <tr>
                <td className="pt-3 font-bold text-gray-900">
                  Margine Netto Stimato
                </td>
                <td
                  className={`pt-3 text-right font-bold text-base tabular-nums ${margineNettoStimato >= 0 ? "text-emerald-700" : "text-red-700"}`}
                >
                  {fmt(margineNettoStimato)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

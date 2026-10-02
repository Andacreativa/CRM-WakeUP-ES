"use client";

import { ExportBar, ExportButton } from "@/components/ExportBar";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
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
import { exportExcel, exportPDF } from "@/lib/export";
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
  const [exportMode, setExportMode] = useState(false);
  const [fattureTotale, setFattureTotale] = useState(0);
  const [, setFattureTotaleIncassato] = useState(0);
  const [speseTotale, setSpeseTotale] = useState(0);
  const { anno, setAnno } = useAnno();
  const [azienda, setAzienda] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams();
      if (anno > 0) params.set("anno", String(anno));
      if (azienda) params.set("azienda", azienda);
      const [rawF, rawS, rawAltri] = await Promise.all([
        (await fetch(`/api/fatture?${params}`)).json() as Promise<any>,
        (await fetch(`/api/spese?${params}`)).json() as Promise<any>,
        (await fetch(`/api/altri-ingressi?${params}`)).json() as Promise<any>,
      ]);
      const fatture: {
        mese: number;
        importo: number;
        pagato?: boolean;
        acconti?: { importo: number }[];
      }[] = Array.isArray(rawF) ? rawF : [];
      const sumAcc = (f: { acconti?: { importo: number }[] }) =>
        (f.acconti ?? []).reduce((s, a) => s + a.importo, 0);
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

      const totFattureIncassate = fatture.reduce((s: number, f) => {
        const acc = sumAcc(f);
        return (
          s + (f?.pagato || acc >= (f?.importo ?? 0) ? (f?.importo ?? 0) : acc)
        );
      }, 0);
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


    exportExcel(baseSheet, `bilancio_${anno > 0 ? anno : "tutti"}`);
  };

  const handlePDF = async () => {
    const annoLabel = anno > 0 ? String(anno) : "tutti gli anni";
    const annoFile = anno > 0 ? String(anno) : "tutti";
    const columns = ["Mese", "Entrate", "Uscite", "Bilancio"];
    const rows = dati.map((d) => [
      MESI[d.mese - 1],
      fmt(d.entrate),
      fmt(d.uscite),
      fmt(d.bilancio),
    ]);
    await exportPDF(`Bilancio ${annoLabel}`, columns, rows, `bilancio_${annoFile}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Bilancio</h1>
          <p className="page-sub">
            Conto economico {anno > 0 ? anno : "tutti gli anni"}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltriBar
            anno={anno}
            azienda={azienda}
            onAnno={setAnno}
            onAzienda={setAzienda}
            showAzienda={false}
            includeAllYears
          />
          <ExportButton active={exportMode} onClick={() => setExportMode((v) => !v)} title="Scarica il bilancio in Excel o PDF" />
          <button
            onClick={() => setReportOpen(true)}
            className="btn btn-primary"
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
      <KpiGrid cols={3}>
        <Kpi label="Totale entrate" value={fmt(fattureTotale)} valueClass="text-ok" />
        <Kpi label="Totale uscite" value={fmt(speseTotale)} valueClass="text-bad" />
        <Kpi
          label="Bilancio netto"
          value={fmt(bilancioTotale)}
          valueClass={bilancioTotale > 0 ? "text-ok" : bilancioTotale < 0 ? "text-bad" : "text-gray-500"}
          sub="entrate meno uscite"
        />
      </KpiGrid>

      {/* Grafici affiancati */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Entrate vs Uscite per Mese
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} barSize={16} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              <Bar dataKey="Entrate" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Uscite" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Bilancio Netto per Mese
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={2} />
              <Bar dataKey="Bilancio" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.Bilancio >= 0 ? "#22c55e" : "#ef4444"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabella mensile */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="tbl">
          <thead>
            <tr>
              {["Mese", "Entrate", "Uscite", "Bilancio"].map((h, i) => (
                <th
                  key={h}
                  className={`${i > 0 ?"text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dati.map((d) => (
              <tr
                key={d.mese}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="font-medium">
                  {MESI[d.mese - 1]}
                </td>
                <td
                  className="px-6 py-3 text-sm font-semibold text-right"
                  style={{ color: d.entrate > 0 ? "#22c55e" : "#9ca3af" }}
                >
                  {d.entrate > 0 ? fmt(d.entrate) : "—"}
                </td>
                <td className="font-semibold text-bad text-right">
                  {d.uscite > 0 ? fmt(d.uscite) : "—"}
                </td>
                <td
                  className={`px-6 py-3 text-sm font-semibold text-right ${d.bilancio >= 0 ? "text-ok" : "text-bad"}`}
                >
                  {d.entrate === 0 && d.uscite === 0 ? "—" : fmt(d.bilancio)}
                </td>
              </tr>
            ))}
            <tr className="tbl-total">
              <td>TOTALE ANNO</td>
              <td className="text-right text-ok">
                {fmt(fattureTotale)}
              </td>
              <td className="text-bad text-right">
                {fmt(speseTotale)}
              </td>
              <td
                className={`px-6 py-3 text-sm text-right ${bilancioTotale >= 0 ? "text-ok" : "text-bad"}`}
              >
                {fmt(bilancioTotale)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {exportMode && (
        <ExportBar
          total={12}
          unit="mesi"
          summary={<span>Bilancio <strong className="text-gray-900">{anno > 0 ? anno : "di tutti gli anni"}</strong>, entrate e uscite per mese</span>}
          onClose={() => setExportMode(false)}
          groups={[
            {
              actions: [
                { label: "Excel", icon: <FileSpreadsheet className="text-ok" />, onClick: handleExcel },
                { label: "PDF", icon: <Download />, primary: true, onClick: handlePDF },
              ],
            },
          ]}
        />
      )}
    </div>
  );
}

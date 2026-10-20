// Export dell'informe per il commercialista: Excel (un foglio per sezione,
// numeri veri) e PDF in spagnolo con lo stile degli altri PDF dell'app.
// Gira nel browser; i file si scaricano o si passano in base64 all'email.
import { fmt } from "@/lib/constants";
import { loadOptimizedLogo } from "@/lib/export";
import {
  categoriaEs,
  etichettaPeriodo,
  fechaEs,
  mesEs,
  titoloInforme,
  type InformeDati,
  type Periodo,
  type Sezione,
} from "@/lib/informe";

const PINK: [number, number, number] = [233, 30, 140];
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function informeExcel(d: InformeDati, p: Periodo, sezioni: Set<Sezione>) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const foglio = (nome: string, righe: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righe.length ? righe : [{ Nota: "Sin datos en el periodo" }]), nome);
  const r = d.riepilogo;
  if (sezioni.has("resumen")) {
    foglio("Resumen", [
      { Concepto: "Periodo", Importe: etichettaPeriodo(p) },
      { Concepto: "Desde", Importe: fechaEs(d.da) },
      { Concepto: "Hasta", Importe: fechaEs(d.a) },
      { Concepto: "Facturas emitidas (nº)", Importe: r.nFatture },
      { Concepto: "Base imponible facturas emitidas", Importe: r.base },
      { Concepto: "Cuota IGIC repercutida", Importe: r.cuota },
      { Concepto: "Total facturado", Importe: r.total },
      { Concepto: "Cobrado", Importe: r.cobrado },
      { Concepto: "Pendiente de cobro", Importe: r.pendiente },
      { Concepto: "Otros ingresos", Importe: r.otros },
      { Concepto: "Gastos (nº)", Importe: r.nSpese },
      { Concepto: "Gastos", Importe: r.gastos },
      ...r.gastosPerCategoria.map((c) => ({ Concepto: `  Gastos · ${categoriaEs(c.categoria)}`, Importe: c.importo })),
      { Concepto: "Resultado (base + otros ingresos - gastos)", Importe: r.resultado },
    ]);
  }
  if (sezioni.has("emitidas")) {
    foglio(
      "Facturas emitidas",
      d.fatture.map((f) => ({
        "Nº": f.numero ?? "",
        Fecha: fechaEs(f.data),
        Cliente: f.cliente,
        NIF: f.nif,
        "País": f.paese,
        "Base imponible": f.base,
        "Tipo IGIC %": f.aliquota,
        "Cuota IGIC": f.cuota,
        Total: f.total,
        "Exención": f.causa,
        Tipo: f.tipoFattura,
        "Rectifica a": f.rettificaDi ?? "",
        Cobrada: f.cobrada ? "Sí" : "No",
        Cobrado: f.cobrado,
      })),
    );
  }
  if (sezioni.has("gastos")) {
    foglio(
      "Gastos",
      d.spese.map((s) => ({
        Mes: mesEs(s.mese, s.anno),
        Proveedor: s.fornitore,
        NIF: s.nif,
        "Categoría": categoriaEs(s.categoria),
        "Descripción": s.descrizione,
        Importe: s.importo,
      })),
    );
  }
  if (sezioni.has("otros")) {
    foglio(
      "Otros ingresos",
      d.altri.map((x) => ({
        Mes: mesEs(x.mese, x.anno),
        Origen: x.fonte,
        "Categoría": categoriaEs(x.categoria),
        "Descripción": x.descrizione,
        Importe: x.importo,
        Cobrado: x.incassato ? "Sí" : "No",
      })),
    );
  }
  return {
    scarica: (nome: string) => XLSX.writeFile(wb, `${nome}.xlsx`),
    base64: () => XLSX.write(wb, { bookType: "xlsx", type: "base64" }) as string,
  };
}

export async function informePdf(
  d: InformeDati,
  p: Periodo,
  sezioni: Set<Sezione>,
  emittente: { ragioneSociale: string; nif: string; logoUrl?: string },
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape" });
  const ML = 14;
  const larghezza = doc.internal.pageSize.getWidth();
  const altezza = doc.internal.pageSize.getHeight();
  const r = d.riepilogo;

  const logo = await loadOptimizedLogo(emittente.logoUrl || "/logo anda.png");
  let y = 16;
  if (logo) {
    const h = 20;
    doc.addImage(logo.dataUrl, "JPEG", ML, 8, h * (logo.width / logo.height), h);
    y = 34;
  }
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${emittente.ragioneSociale} · NIF ${emittente.nif}`, ML, y);
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text(`${titoloInforme(p)} — ${etichettaPeriodo(p)}`, ML, y + 8);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Periodo: ${fechaEs(d.da)} – ${fechaEs(d.a)} · Generado el ${new Date().toLocaleDateString("es-ES")}`,
    ML,
    y + 14,
  );
  y += 22;

  const ultimaY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const titolo = (t: string) => {
    if (y > altezza - 40) {
      doc.addPage();
      y = 16;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60);
    doc.text(t.toUpperCase(), ML, y);
    doc.setFont("helvetica", "normal");
    y += 2;
  };
  const stile = {
    startY: 0,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PINK, textColor: 255 as unknown as [number, number, number], fontStyle: "bold" as const },
    footStyles: { fillColor: [240, 240, 240] as [number, number, number], textColor: 30 as unknown as [number, number, number], fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: [249, 249, 249] as [number, number, number] },
    margin: { left: ML, right: ML },
    showFoot: "lastPage" as const,
  };
  const tabella = (
    head: string[],
    body: (string | number)[][],
    foot: (string | number)[][] | undefined,
    colonneADestra: number[],
  ) => {
    autoTable(doc, {
      ...stile,
      startY: y,
      head: [head],
      body: body.length ? body : [["Sin datos en el periodo", ...head.slice(1).map(() => "")]],
      foot,
      didParseCell: (c) => {
        if (colonneADestra.includes(c.column.index)) c.cell.styles.halign = "right";
      },
    });
    y = ultimaY() + 8;
  };

  if (sezioni.has("resumen")) {
    titolo("Resumen del periodo");
    tabella(
      ["Concepto", "Importe"],
      [
        ["Facturas emitidas", `${r.nFatture}`],
        ["Base imponible", fmt(r.base)],
        ["Cuota IGIC repercutida", fmt(r.cuota)],
        ["Total facturado", fmt(r.total)],
        ["Cobrado", fmt(r.cobrado)],
        ["Pendiente de cobro", fmt(r.pendiente)],
        ["Otros ingresos", fmt(r.otros)],
        [`Gastos (${r.nSpese})`, fmt(r.gastos)],
        ...r.gastosPerCategoria.map((c): (string | number)[] => [`    ${categoriaEs(c.categoria)}`, fmt(c.importo)]),
      ],
      // Niente «−» tipografico: il font del PDF non lo ha
      [["Resultado (base + otros ingresos - gastos)", fmt(r.resultado)]],
      [1],
    );
  }
  if (sezioni.has("emitidas")) {
    titolo("Libro de facturas emitidas");
    tabella(
      ["Nº", "Fecha", "Cliente", "NIF", "País", "Base", "IGIC %", "Cuota", "Total", "Exención", "Cobrada"],
      d.fatture.map((f) => [
        f.numero ?? "",
        fechaEs(f.data) || mesEs(f.mese, f.anno),
        f.cliente + (f.rettificaDi ? ` (rectifica ${f.rettificaDi})` : ""),
        f.nif,
        f.paese,
        fmt(f.base),
        f.aliquota ? `${f.aliquota} %` : "0 %",
        fmt(f.cuota),
        fmt(f.total),
        f.causa,
        f.cobrada ? "Sí" : "No",
      ]),
      [["TOTAL", "", `${r.nFatture} facturas`, "", "", fmt(r.base), "", fmt(r.cuota), fmt(r.total), "", ""]],
      [5, 6, 7, 8],
    );
  }
  if (sezioni.has("gastos")) {
    titolo("Gastos (facturas recibidas)");
    tabella(
      ["Mes", "Proveedor", "NIF", "Categoría", "Descripción", "Importe"],
      d.spese.map((s) => [mesEs(s.mese, s.anno), s.fornitore, s.nif, categoriaEs(s.categoria), s.descrizione, fmt(s.importo)]),
      [["TOTAL", `${r.nSpese} gastos`, "", "", "", fmt(r.gastos)]],
      [5],
    );
  }
  if (sezioni.has("otros")) {
    titolo("Otros ingresos");
    tabella(
      ["Mes", "Origen", "Categoría", "Descripción", "Importe", "Cobrado"],
      d.altri.map((x) => [mesEs(x.mese, x.anno), x.fonte, categoriaEs(x.categoria), x.descrizione, fmt(x.importo), x.incassato ? "Sí" : "No"]),
      [["TOTAL", `${r.nAltri}`, "", "", fmt(r2(r.otros)), ""]],
      [4],
    );
  }

  // Piè di pagina con numero di pagina
  const pagine = doc.getNumberOfPages();
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`${emittente.ragioneSociale} · ${titoloInforme(p)} ${etichettaPeriodo(p)}`, ML, altezza - 8);
    doc.text(`Página ${i} de ${pagine}`, larghezza - ML, altezza - 8, { align: "right" });
  }
  return {
    scarica: (nome: string) => doc.save(`${nome}.pdf`),
    base64: () => doc.output("datauristring").split(",")[1] ?? "",
  };
}

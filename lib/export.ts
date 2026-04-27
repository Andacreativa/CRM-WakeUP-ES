import { fmt } from "./constants";

// ── Types ──────────────────────────────────────────────────────────────────
export interface VocePreventivoData {
  servizio: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
}

export interface PreventivoPDFData {
  numero: string;
  nomeCliente: string;
  emailCliente?: string | null;
  aziendaCliente?: string | null;
  azienda?: string | null; // "Anda" | "Wake Up"
  oggetto: string;
  voci: string; // JSON string
  iva: number;
  subtotale: number;
  totale: number;
  condizioni?: string | null;
  note?: string | null;
  createdAt: string | Date;
}

// ── Excel ──────────────────────────────────────────────────────────────────
export async function exportExcel(
  data: Record<string, unknown>[],
  filename: string,
) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dati");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── PDF ────────────────────────────────────────────────────────────────────
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("img load failed"));
    });
    return img;
  } catch {
    return null;
  }
}

export async function exportPDF(
  title: string,
  columns: string[],
  rows: (string | number)[][],
  filename: string,
  options?: { logoPath?: string; footerText?: string },
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape" });

  // Logo opzionale (top-right)
  if (options?.logoPath) {
    const img = await loadImage(options.logoPath);
    if (img) {
      const height = 22;
      const ratio = img.naturalWidth / img.naturalHeight;
      const width = height * ratio;
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.addImage(img, "PNG", pageWidth - width - 14, 8, width, height);
    }
  }

  // Header
  doc.setFontSize(16);
  doc.setTextColor(232, 48, 138);
  doc.text("anda!", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Anda Agencia de Publicidad SL — Leonardo Mestre", 14, 22);
  doc.setFontSize(13);
  doc.setTextColor(30);
  doc.text(title, 14, 30);

  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: 35,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [232, 48, 138],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [253, 242, 248] },
  });

  if (options?.footerText) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? 35;
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(options.footerText, 14, finalY + 10);
  }

  doc.save(`${filename}.pdf`);
}

// ── Fatture helpers ────────────────────────────────────────────────────────
export function fattureToExcel(
  fatture: {
    cliente: { nome: string; paese: string } | null;
    azienda: string;
    mese: number;
    anno: number;
    importo: number;
    pagato: boolean;
  }[],
  MESI: string[],
) {
  return fatture.map((f) => ({
    Cliente: f.cliente?.nome ?? "",
    Paese: f.cliente?.paese ?? "",
    Azienda: f.azienda,
    Mese: MESI[f.mese - 1],
    Anno: f.anno,
    Importo: f.importo,
    Stato: f.pagato ? "Pagato" : "In Attesa",
  }));
}

export function fattureToPDF(
  fatture: {
    cliente: { nome: string; paese: string } | null;
    azienda: string;
    mese: number;
    importo: number;
    pagato: boolean;
  }[],
  MESI: string[],
  title: string,
) {
  const cols = ["Cliente", "Paese", "Azienda", "Mese", "Importo", "Stato"];
  const rows = fatture.map((f) => [
    f.cliente?.nome ?? "",
    f.cliente?.paese ?? "",
    f.azienda,
    MESI[f.mese - 1],
    fmt(f.importo),
    f.pagato ? "Pagato" : "In Attesa",
  ]);
  return { cols, rows, title };
}

// ── Preventivo PDF ────────────────────────────────────────────────────────
export async function exportPreventivoPDF(p: PreventivoPDFData) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210,
    H = 297,
    ML = 14,
    MR = 14;
  const CW = W - ML - MR; // 182mm

  const isAnda = p.azienda === "Anda";
  const ACCENT: [number, number, number] = isAnda
    ? [233, 30, 140] // #E91E8C
    : [219, 41, 27]; // rosso Wake Up

  const DARK: [number, number, number] = [20, 20, 20];
  const CARD: [number, number, number] = [38, 38, 38];
  const WHITE: [number, number, number] = [255, 255, 255];
  const LGRAY: [number, number, number] = [160, 160, 160];
  const DGRAY: [number, number, number] = [60, 60, 60];

  // ── PAGE 1: COVER ──────────────────────────────────────────────────────

  // Sfondo scuro
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, H, "F");

  // Company name
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text("ANDA AGENCIA DE PUBLICIDAD SL", ML, 48);

  // Tagline
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...LGRAY);
  doc.text("Marketing Digital & Comunicación Internacional", ML, 57);

  // Divider line accent
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(ML, 63, W - MR, 63);

  // "PROPOSTA COMMERCIALE"
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text("PROPOSTA COMMERCIALE", ML, 83);

  // oggetto
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...LGRAY);
  const oggettoLines = doc.splitTextToSize(p.oggetto, CW);
  doc.text(oggettoLines, ML, 94);

  // Info box (sfondo grigio scuro)
  const boxY = 116;
  const boxH = 76;
  doc.setFillColor(...CARD);
  doc.roundedRect(ML, boxY, CW, boxH, 3, 3, "F");

  const c1 = ML + 10;
  const c2 = ML + CW / 2 + 5;

  // — Preparato da —
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT);
  doc.text("PREPARATO DA", c1, boxY + 12);

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text("ANDA AGENCIA DE PUBLICIDAD SL", c1, boxY + 19);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...LGRAY);
  doc.text("Avenida Quinto Centenario, 23 - Piso 2 Int 21", c1, boxY + 24);
  doc.text(
    "38683, Puerto de Santiago (Santa Cruz de Tenerife)",
    c1,
    boxY + 28,
  );
  doc.text("NIF B16451536", c1, boxY + 32);
  doc.text("info@andacreativa.com", c1, boxY + 36);

  // — Destinatario —
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT);
  doc.text("DESTINATARIO", c2, boxY + 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...WHITE);
  doc.text(p.nomeCliente, c2, boxY + 19);

  let destY = boxY + 25.5;
  if (p.aziendaCliente) {
    doc.setFontSize(8.5);
    doc.setTextColor(...LGRAY);
    doc.text(p.aziendaCliente, c2, destY);
    destY += 6;
  }
  if (p.emailCliente) {
    doc.setFontSize(8.5);
    doc.setTextColor(...LGRAY);
    doc.text(p.emailCliente, c2, destY);
  }

  // — Data emissione —
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT);
  doc.text("DATA EMISSIONE", c1, boxY + 44);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...WHITE);
  const dateStr = new Date(p.createdAt).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(dateStr, c1, boxY + 51);

  // — N. Preventivo —
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT);
  doc.text("N. PREVENTIVO", c2, boxY + 44);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...WHITE);
  doc.text(p.numero, c2, boxY + 51);

  // — Validità —
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT);
  doc.text("VALIDITÀ OFFERTA", c1, boxY + 63);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...WHITE);
  doc.text("30 giorni dalla data di emissione", c1, boxY + 70);

  // Footer note
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Il presente preventivo ha validità 30 giorni dalla data di emissione.",
    ML,
    278,
  );

  // Bottom accent bar
  doc.setFillColor(...ACCENT);
  doc.rect(0, H - 7, W, 7, "F");

  // ── PAGE 2: DETAILS + PRICING ──────────────────────────────────────────
  doc.addPage();

  // Header bar scura
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 14, "F");

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 200);
  const hTitle =
    p.oggetto.length > 55 ? p.oggetto.substring(0, 52) + "..." : p.oggetto;
  doc.text(`ANDA AGENCIA DE PUBLICIDAD SL  |  ${hTitle}`, ML, 9);
  doc.text("Pag. 2", W - MR, 9, { align: "right" });

  let y = 26;

  // Section: PERIMETRO DEI SERVIZI
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT);
  doc.text("PERIMETRO DEI SERVIZI", ML, y);
  y += 5;

  let voci: VocePreventivoData[] = [];
  try {
    voci = JSON.parse(p.voci);
  } catch {
    voci = [];
  }

  autoTable(doc, {
    head: [["#", "Servizio", "Descrizione sintetica"]],
    body: voci.map((v, i) => [String(i + 1), v.servizio, v.descrizione || "—"]),
    startY: y,
    styles: { fontSize: 9, cellPadding: 3.5, textColor: [40, 40, 40] },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 58 },
      2: { cellWidth: "auto" },
    },
    margin: { left: ML, right: MR },
  });

  y =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 12;

  // Section: PIANO TARIFFARIO
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT);
  doc.text("PIANO TARIFFARIO", ML, y);
  y += 5;

  const ivaAmt = (p.subtotale * p.iva) / 100;

  autoTable(doc, {
    head: [["Servizio", "Q.tà", "Prezzo Unitario", "Totale"]],
    body: voci.map((v) => [
      v.servizio,
      String(v.quantita),
      fmt(v.prezzoUnitario),
      fmt(v.quantita * v.prezzoUnitario),
    ]),
    foot: [
      ["", "", "Subtotale", fmt(p.subtotale)],
      ["", "", `IVA (${p.iva}%)`, fmt(ivaAmt)],
      ["", "", "TOTALE", fmt(p.totale)],
    ],
    startY: y,
    styles: { fontSize: 9, cellPadding: 3.5, textColor: [40, 40, 40] },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 38, halign: "right" },
      3: { cellWidth: 38, halign: "right" },
    },
    margin: { left: ML, right: MR },
  });

  y =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 12;

  // Section: CONDIZIONI COMMERCIALI
  const condText = p.condizioni || p.note;
  if (condText && y < 250) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ACCENT);
    doc.text("CONDIZIONI COMMERCIALI", ML, y);
    y += 6;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DGRAY);
    const lines = doc.splitTextToSize(condText, CW);
    doc.text(lines, ML, y);
    y += lines.length * 4.5 + 10;
  }

  // Section: FIRMA E ACCETTAZIONE
  if (y < 258) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ACCENT);
    doc.text("FIRMA E ACCETTAZIONE", ML, y);
    y += 6;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DGRAY);
    doc.text(
      "Per accettazione della presente proposta, si prega di restituire il documento firmato.",
      ML,
      y,
    );
    y += 14;

    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.3);
    doc.line(ML, y, ML + 76, y);
    doc.line(W - MR - 76, y, W - MR, y);

    y += 5;
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text("Per Anda Agencia de Publicidad SL", ML, y);
    doc.text("Firma", ML, y + 4.5);
    const sigName = p.aziendaCliente
      ? `Per ${p.aziendaCliente}`
      : `Per ${p.nomeCliente}`;
    doc.text(sigName, W - MR - 76, y);
    doc.text("Firma", W - MR - 76, y + 4.5);
  }

  // Bottom accent bar + footer text
  doc.setFillColor(...ACCENT);
  doc.rect(0, H - 7, W, 7, "F");

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(
    "ANDA AGENCIA DE PUBLICIDAD SL  |  info@andacreativa.com  |  Pag. 2",
    W / 2,
    H - 10,
    { align: "center" },
  );

  doc.save(`preventivo_${p.numero}.pdf`);
}

// ── Spese helpers ──────────────────────────────────────────────────────────
export function speseToExcel(
  spese: {
    fornitore: string;
    categoria: string;
    azienda: string;
    mese: number;
    anno: number;
    importo: number;
    descrizione: string | null;
    note: string | null;
  }[],
  MESI: string[],
) {
  return spese.map((s) => ({
    Fornitore: s.fornitore,
    Categoria: s.categoria,
    Azienda: s.azienda,
    Mese: MESI[s.mese - 1],
    Anno: s.anno,
    Importo: s.importo,
    Descrizione: s.descrizione || "",
    Note: s.note || "",
  }));
}

import { fmt } from "./constants";

// ── Types ──────────────────────────────────────────────────────────────────
export interface VocePreventivoData {
  servizio: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  tipo?: "mensile" | "una_tantum";
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

// Colori brand standard
export const PINK: [number, number, number] = [233, 30, 140]; // #E91E8C
export const GREEN: [number, number, number] = [16, 185, 129];
export const ORANGE: [number, number, number] = [245, 158, 11];

export type CellInput =
  | string
  | number
  | {
      content: string | number;
      styles?: {
        textColor?: [number, number, number];
        fontStyle?: "normal" | "bold" | "italic";
        halign?: "left" | "center" | "right";
        fillColor?: [number, number, number];
      };
    };

type FootCell = CellInput;

export interface FooterCell {
  label: string;
  value: string;
  color?: [number, number, number];
}

export async function exportPDF(
  title: string,
  columns: string[],
  rows: CellInput[][],
  filename: string,
  options?: {
    footRows?: FootCell[][];
    footerCells?: FooterCell[];
    orientation?: "portrait" | "landscape";
    extraTables?: { columns: string[]; rows: CellInput[][] }[];
  },
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const orientation = options?.orientation ?? "landscape";
  const doc = new jsPDF({ orientation });
  const ML = 14;

  // Logo top-left
  const img = await loadImage("/logo anda.png");
  let y = 16;
  if (img) {
    const h = 24;
    const w = h * (img.naturalWidth / img.naturalHeight);
    doc.addImage(img, "PNG", ML, 8, w, h);
    y = 38;
  }

  // Company name + titolo
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("Anda Agencia de Publicidad SL", ML, y);
  doc.setFontSize(13);
  doc.setTextColor(30);
  doc.text(title, ML, y + 8);

  autoTable(doc, {
    head: [columns],
    body: rows,
    foot: options?.footRows,
    startY: y + 14,
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: {
      fillColor: PINK,
      textColor: 255,
      fontStyle: "bold",
    },
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: 30,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    margin: { left: ML, right: ML },
  });

  // Tabelle aggiuntive (es. riepilogo mensile)
  if (options?.extraTables?.length) {
    for (const t of options.extraTables) {
      const lastY =
        (doc as unknown as { lastAutoTable?: { finalY: number } })
          .lastAutoTable?.finalY ?? y + 20;
      autoTable(doc, {
        head: [t.columns],
        body: t.rows,
        startY: lastY + 6,
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        headStyles: {
          fillColor: PINK,
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [249, 249, 249] },
        margin: { left: ML, right: ML },
      });
    }
  }

  if (options?.footerCells?.length) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? y + 20;
    const pageW = doc.internal.pageSize.getWidth();
    const baseY = finalY + 10;
    const rectY = baseY - 5;
    const rectH = 7.5;
    // Sfondo grigio chiaro #F3F3F3
    doc.setFillColor(243, 243, 243);
    doc.rect(ML, rectY, pageW - ML * 2, rectH, "F");

    let x = ML + 3;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    for (const cell of options.footerCells) {
      doc.setTextColor(80);
      doc.text(`${cell.label}:`, x, baseY);
      const labelW = doc.getTextWidth(`${cell.label}: `);
      x += labelW + 1;
      const c = cell.color ?? [20, 20, 20];
      doc.setTextColor(c[0], c[1], c[2]);
      doc.text(cell.value, x, baseY);
      x += doc.getTextWidth(cell.value) + 8;
    }
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
  const rows: CellInput[][] = fatture.map((f) => [
    f.cliente?.nome ?? "",
    f.cliente?.paese ?? "",
    f.azienda,
    MESI[f.mese - 1],
    fmt(f.importo),
    {
      content: f.pagato ? "Pagato" : "In Attesa",
      styles: {
        textColor: f.pagato ? GREEN : ORANGE,
        fontStyle: "bold",
      },
    },
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

// ── Helpers contratto ─────────────────────────────────────────────────────
const FIRMA_LEO_MARKER = "[FIRMA_LEO]";

async function loadFirmaInvertita(): Promise<HTMLCanvasElement | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "/Firma Leo.png";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("firma load failed"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i + 3] > 0) {
        // non-transparent → setta RGB a nero (mantiene alpha)
        data.data[i] = 0;
        data.data[i + 1] = 0;
        data.data[i + 2] = 0;
      }
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}

// ── Contratto: text builder + PDF da testo editabile ──────────────────────
type Voce = {
  servizio: string;
  descrizione?: string;
  quantita?: number;
  prezzoUnitario?: number;
  tipo?: "mensile" | "una_tantum";
};

export function buildContrattoText(c: {
  cliente: {
    nome: string;
    via: string | null;
    cap: string | null;
    citta: string | null;
    provincia: string | null;
    partitaIva: string | null;
  };
  rappresentanteLegale: string;
  oggetto: string;
  voci: string;
  dataDecorrenza: string | Date;
  durataMesi: number;
  importoMensile: number;
  numeroRate: number;
  lingua?: "it" | "es";
}): string {
  const lang = c.lingua === "es" ? "es" : "it";
  const T = CONTRATTO_T[lang];
  const decorrenza = new Date(c.dataDecorrenza);
  const scadenza = new Date(decorrenza);
  scadenza.setMonth(scadenza.getMonth() + c.durataMesi);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString(lang === "es" ? "es-ES" : "it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  let voci: Voce[] = [];
  try {
    voci = JSON.parse(c.voci);
  } catch {
    voci = [];
  }
  const mensili = voci.filter((v) => v.tipo !== "una_tantum");
  const tantum = voci.filter((v) => v.tipo === "una_tantum");
  const labelBullet = (v: Voce) =>
    v.descrizione ? `${v.servizio} — ${v.descrizione}` : v.servizio;

  const cliAddr = [c.cliente.via, c.cliente.cap, c.cliente.citta]
    .filter(Boolean)
    .join(" - ");
  const cliProv = c.cliente.provincia ? ` (${c.cliente.provincia})` : "";
  const cliPiva = c.cliente.partitaIva ? `, P.IVA ${c.cliente.partitaIva}` : "";

  const lines: string[] = [];
  lines.push(`# ${T.title}`);
  lines.push("");
  lines.push(`**${T.tra}**`);
  lines.push("");
  lines.push(T.fornitoreIntro);
  lines.push("");
  lines.push(`**${T.e}**`);
  lines.push("");
  lines.push(
    T.clienteIntro(
      c.cliente.nome,
      `${cliAddr}${cliProv}`,
      cliPiva,
      c.rappresentanteLegale,
    ),
  );
  lines.push("");
  lines.push(`**${T.premesso}**`);
  lines.push("");
  lines.push(`• ${T.premessoFornitore}`);
  lines.push(`• ${T.premessoCliente(c.oggetto)}`);
  lines.push("");
  lines.push(`**${T.siConviene}**`);
  lines.push("");
  lines.push(`## ${T.art1Title}`);
  lines.push("");
  lines.push(T.art11(fmtDate(decorrenza)));
  lines.push("");
  lines.push(T.art12Intro);
  if (mensili.length > 0) {
    lines.push("");
    lines.push(
      `**${lang === "es" ? "Servicios mensuales recurrentes:" : "Servizi ricorrenti mensili:"}**`,
    );
    for (const v of mensili) lines.push(`• ${labelBullet(v)}`);
  }
  if (tantum.length > 0) {
    lines.push("");
    lines.push(
      `**${lang === "es" ? "Servicios una sola vez:" : "Servizi una tantum:"}**`,
    );
    for (const v of tantum) lines.push(`• ${labelBullet(v)}`);
  }
  lines.push("");
  lines.push(T.art12Outro);
  lines.push("");
  lines.push(`## ${T.art2Title}`);
  lines.push("");
  lines.push(T.art21);
  lines.push("");
  lines.push(`## ${T.art3Title}`);
  lines.push("");
  lines.push(T.art31);
  lines.push("");
  lines.push(`## ${T.art4Title}`);
  lines.push("");
  lines.push(T.art41(c.durataMesi, fmtDate(decorrenza), fmtDate(scadenza)));
  lines.push("");
  lines.push(T.art42(c.durataMesi));
  lines.push("");
  lines.push(T.art43);
  lines.push("");
  lines.push(`## ${T.art5Title}`);
  lines.push("");
  lines.push(T.art51(fmtCurrency(c.importoMensile), c.durataMesi));
  lines.push(`• ${T.art51b1(c.numeroRate, fmtCurrency(c.importoMensile))}`);
  lines.push(`• ${T.art51b2}`);
  lines.push(`• ${T.art51b3(fmtCurrency(c.importoMensile))}`);
  lines.push(`• ${T.art51b4}`);
  if (tantum.length > 0) {
    const totUnaTantum = tantum.reduce(
      (s, v) =>
        s + (Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0),
      0,
    );
    lines.push("");
    lines.push(
      lang === "es"
        ? `Adicionalmente, el Cliente abonará servicios una sola vez por un total de ${fmtCurrency(totUnaTantum)} IVA incluido, facturados al inicio del contrato:`
        : `In aggiunta, il Cliente corrisponderà servizi una tantum per un totale di ${fmtCurrency(totUnaTantum)} iva inclusa, fatturati all'avvio del contratto:`,
    );
    for (const v of tantum) {
      lines.push(
        `• ${v.servizio}${v.descrizione ? ` — ${v.descrizione}` : ""}: ${fmtCurrency((Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0))}`,
      );
    }
  }
  lines.push("");
  lines.push(T.art52);
  lines.push("");
  lines.push(T.art53);
  lines.push("");
  lines.push(`## ${T.art6Title}`);
  lines.push("");
  lines.push(T.art61);
  lines.push("");
  lines.push(`## ${T.art7Title}`);
  lines.push("");
  lines.push(T.art71);
  lines.push("");
  lines.push(`## ${T.art8Title}`);
  lines.push("");
  lines.push(T.art81);
  lines.push("");
  lines.push(T.art82);
  lines.push("");
  lines.push(`## ${T.art9Title}`);
  lines.push("");
  lines.push(T.art91);
  lines.push("");
  lines.push(T.art92);
  lines.push("");
  lines.push(T.letto);
  lines.push(T.luogoData(fmtDate(decorrenza)));
  lines.push("");
  lines.push("");
  lines.push(`**${T.perFornitore}**`);
  lines.push(FIRMA_LEO_MARKER);
  lines.push(T.fornitoreSign);
  lines.push("___");
  lines.push("");
  lines.push(`**${T.perCliente}**`);
  lines.push(c.rappresentanteLegale);
  lines.push("");
  lines.push("___");

  return lines.join("\n");
}

function fmtCurrency(n: number): string {
  return fmt(n);
}

// Renderizza un testo strutturato (markdown semplificato) come PDF contratto.
// Convenzioni:
//   "# ..."   → titolo (centrato, grande, bold)
//   "## ..."  → heading articolo (bold, sinistra)
//   "**...**" → paragrafo intero in bold
//   "• ..." o "- ..." → bullet (indentato)
//   "___"    → linea per firma
//   ""        → spazio verticale
export async function exportContrattoTextPDF(
  text: string,
  options: { numero: string },
) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210,
    H = 297,
    ML = 20,
    MR = 20;
  const CW = W - ML - MR;
  let y = 20;

  const firmaCanvas = await loadFirmaInvertita();

  const checkPage = (need: number) => {
    if (y + need > H - 20) {
      doc.addPage();
      y = 20;
    }
  };

  doc.setTextColor(20);

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();

    if (line === "") {
      y += 3;
      continue;
    }

    // Marker firma Leonardo
    if (line === FIRMA_LEO_MARKER) {
      if (firmaCanvas) {
        const widthMm = 50;
        const heightMm =
          widthMm * (firmaCanvas.height / firmaCanvas.width);
        checkPage(heightMm + 2);
        doc.addImage(
          firmaCanvas.toDataURL("image/png"),
          "PNG",
          ML,
          y,
          widthMm,
          heightMm,
        );
        y += heightMm + 1;
      }
      continue;
    }

    // Linea firma
    if (line === "___") {
      checkPage(8);
      doc.setDrawColor(190);
      doc.setLineWidth(0.3);
      doc.line(ML, y, ML + 76, y);
      y += 6;
      continue;
    }

    // Titolo principale
    if (line.startsWith("# ")) {
      const t = line.slice(2);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      const lines = doc.splitTextToSize(t, CW);
      checkPage(lines.length * 7 + 4);
      for (const l of lines) {
        doc.text(l, W / 2, y, { align: "center" });
        y += 7;
      }
      y += 4;
      continue;
    }

    // Heading articolo
    if (line.startsWith("## ")) {
      const t = line.slice(3);
      y += 3;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      const lines = doc.splitTextToSize(t, CW);
      checkPage(lines.length * 6);
      doc.text(lines, ML, y);
      y += lines.length * 6 + 1;
      continue;
    }

    // Paragrafo bold (** ... **)
    if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      const t = line.slice(2, -2);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      const lines = doc.splitTextToSize(t, CW);
      checkPage(lines.length * 5);
      doc.text(lines, ML, y);
      y += lines.length * 5 + 1;
      continue;
    }

    // Bullet
    if (line.startsWith("• ") || line.startsWith("- ")) {
      const t = line.slice(2);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(`• ${t}`, CW - 6);
      checkPage(lines.length * 5);
      doc.text(lines, ML + 6, y);
      y += lines.length * 5 + 1;
      continue;
    }

    // Paragrafo normale
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(line, CW);
    checkPage(lines.length * 5 + 1);
    doc.text(lines, ML, y);
    y += lines.length * 5 + 1;
  }

  doc.save(`contratto_${options.numero}.pdf`);
}

// ── Contratto PDF (struttura legacy, ancora usato per quick download) ────
export interface ContrattoPDFData {
  numero: string;
  cliente: {
    nome: string;
    via: string | null;
    cap: string | null;
    citta: string | null;
    provincia: string | null;
    partitaIva: string | null;
  };
  rappresentanteLegale: string;
  oggetto: string;
  voci: string; // JSON
  dataDecorrenza: string | Date;
  durataMesi: number;
  importoMensile: number;
  numeroRate: number;
  totaleContratto: number;
  lingua?: "it" | "es";
}

const CONTRATTO_T = {
  it: {
    title: "CONTRATTO DI COLLABORAZIONE PER PIANO DI MARKETING E SVILUPPO BRAND",
    tra: "TRA",
    e: "E",
    fornitoreIntro:
      'Anda Agencia de Publicidad SL con sede legale in Avenida Quinto Centenario 23, Puerto de Santiago, 38683, Santa Cruz de Tenerife, Spagna NIF B16451536, iscritta al Registro Mercantil de Santa Cruz de Tenerife, rappresentata da Leonardo Mestre (di seguito denominata "Fornitore"),',
    clienteIntro: (
      nome: string,
      addr: string,
      piva: string,
      rapp: string,
    ) =>
      `${nome} con sede legale in ${addr}${piva}, rappresentata da ${rapp} (di seguito denominata "Cliente"),`,
    premesso: "PREMESSO CHE",
    premessoFornitore:
      "Il Fornitore è specializzato nello sviluppo di strategie di marketing e nella consulenza per il potenziamento del brand.",
    premessoCliente: (oggetto: string) => `Il Cliente: ${oggetto}`,
    siConviene: "SI CONVIENE E SI STIPULA QUANTO SEGUE",
    art1Title: "Art. 1 - Oggetto del Contratto",
    art11: (data: string) =>
      `1.1 Il Fornitore si impegna a fornire al Cliente i servizi di consulenza per la definizione e l'implementazione di un piano di marketing e sviluppo brand, come descritto nel preventivo allegato datato ${data}, che costituisce parte integrante del presente contratto.`,
    art12Intro: "1.2 I servizi forniti dal Fornitore al Cliente includono:",
    art12Outro:
      "Il budget pubblicitario mensile, scelto assieme al cliente, non è incluso nel corrispettivo del presente contratto. Tale importo dovrà essere pagato direttamente alla piattaforma pubblicitaria utilizzata (es. Facebook Ads, Google Ads) come extra rispetto al compenso pattuito per i servizi del Fornitore.",
    art2Title: "Art. 2 - Obblighi del Cliente",
    art21:
      "2.1 Il Cliente si impegna a fornire al Fornitore tutte le informazioni, i materiali e le risorse necessarie per lo svolgimento delle attività previste dal presente contratto.",
    art3Title: "Art. 3 - Obblighi del Fornitore",
    art31:
      "3.1 Il Fornitore si impegna a svolgere le attività previste dal presente contratto con la massima professionalità e diligenza, fornendo report periodici al Cliente sull'andamento dei lavori e mantenendo il Cliente costantemente aggiornato sulle attività svolte.",
    art4Title: "Art. 4 - Durata del Contratto",
    art41: (mesi: number, da: string, a: string) =>
      `4.1 Il presente contratto ha durata di ${mesi} mesi, con decorrenza dal ${da} al ${a}`,
    art42: (mesi: number) =>
      `4.2 Alla scadenza dei ${mesi} mesi, considerato periodo di prova, il contratto si rinnoverà automaticamente per un periodo di altri ${mesi} mesi, con relativo adeguamento del budget mensile a rialzo o ribasso in base alla revisione dei servizi erogati, salvo disdetta comunicata per iscritto da una delle Parti almeno 30 giorni prima della scadenza del periodo di prova.`,
    art43:
      "4.3 In seguito al termine dei secondi 6 mesi, il contratto si rinnoverà automaticamente per la durata di 12 mesi e si rinnoverà automaticamente di anno in anno salvo disdetta comunicata per iscritto da una delle Parti almeno 60 giorni prima della scadenza.",
    art5Title: "Art. 5 - Corrispettivo e Modalità di Pagamento",
    art51: (importo: string, mesi: number) =>
      `5.1 Il Cliente si impegna a corrispondere al Fornitore un corrispettivo mensile di ${importo} iva inclusa per i servizi resi durante il periodo di prova di ${mesi} mesi della collaborazione,`,
    art51b1: (rate: number, importo: string) =>
      `Pagabile con soluzione mensile in ${rate} rate di ${importo} iva inclusa;`,
    art51b2:
      "Eventuali modifiche o richieste extra ai servizi inclusi nel progetto preliminare dovranno essere preventivamente concordate e accettate dal Fornitore e potrebbero implicare un costo aggiuntivo",
    art51b3: (importo: string) =>
      `La prima fattura di ${importo} iva inclusa sarà emessa all'avvio del contratto e pagabile a 30 giorni`,
    art51b4:
      "Tutti i pagamenti dovranno essere effettuati entro i termini di legge previsti per le transazioni commerciali, ai sensi del Código Penal, Art. 31 bis e ss secondo la normativa spagnola, e comunque entro 30 giorni dalla ricezione della fattura.",
    art52:
      "5.2 Il Fornitore si riserva la possibilità di mettere in pausa l'erogazione del servizio qualora non ricevesse il saldo della fattura entro i 30 giorni dalla ricezione della medesima da parte del Cliente.",
    art53:
      "5.3 Il Fornitore e il Cliente si riservano la possibilità di ridefinire le cifre del corrispettivo di questa collaborazione in qualsiasi momento durante la durata del contratto previa comunicazione via email almeno 60 giorni prima l'interruzione o variazione del contratto. In quel caso il Cliente dovrà saldare tutte le pendenze rimanenti fino a quel momento.",
    art6Title: "Art. 6 - Proprietà Intellettuale",
    art61:
      "6.1 Tutti i contenuti prodotti dal Fornitore per il Cliente diventeranno di proprietà esclusiva del Cliente una volta effettuato il pagamento del corrispettivo pattuito per il lavoro svolto fino a quel momento. Il Fornitore è autorizzato ad utilizzare tali contenuti nei propri canali ufficiali o materiali promozionali online e visibili al pubblico.",
    art7Title: "Art. 7 - Riservatezza",
    art71:
      "7.1 Le parti si impegnano a mantenere riservate tutte le informazioni commerciali e tecniche apprese durante la collaborazione e a non divulgarle a terzi senza il consenso scritto dell'altra parte.",
    art8Title: "Art. 8 - Clausola Risolutiva Espressa",
    art81:
      "8.1 Il presente contratto può essere risolto da una delle Parti in caso di grave inadempimento dell'altra Parte, previa comunicazione scritta contenente una descrizione dettagliata delle violazioni contestate.",
    art82:
      "8.2 In ogni caso, il Cliente è obbligato a corrispondere al Fornitore tutti i pagamenti dovuti per le attività svolte fino alla data di risoluzione, incluso il pagamento per eventuali servizi completati ma non ancora saldati, prima di procedere con la risoluzione del contratto.",
    art9Title: "Art. 9 - Disposizioni Finali",
    art91:
      "9.1 Eventuali modifiche al presente contratto dovranno essere effettuate per iscritto e firmate da entrambe le Parti.",
    art92:
      "9.2 Per qualsiasi controversia derivante dall'interpretazione o esecuzione del presente contratto, sarà competente il Juzgado de Santa Cruz de Tenerife.",
    letto: "Letto, confermato e sottoscritto.",
    luogoData: (data: string) => `Puerto de Santiago, ${data}`,
    perFornitore: "Per il Fornitore:",
    fornitoreSign: "Leonardo Mestre, Amministratore Anda Agencia de Publicidad SL",
    perCliente: "Per il Cliente:",
  },
  es: {
    title: "CONTRATO DE COLABORACIÓN PARA PLAN DE MARKETING Y DESARROLLO DE MARCA",
    tra: "ENTRE",
    e: "Y",
    fornitoreIntro:
      'Anda Agencia de Publicidad SL con domicilio social en Avenida Quinto Centenario 23, Puerto de Santiago, 38683, Santa Cruz de Tenerife, España, NIF B16451536, inscrita en el Registro Mercantil de Santa Cruz de Tenerife, representada por Leonardo Mestre (en adelante, "el Proveedor"),',
    clienteIntro: (
      nome: string,
      addr: string,
      piva: string,
      rapp: string,
    ) =>
      `${nome} con domicilio social en ${addr}${piva}, representada por ${rapp} (en adelante, "el Cliente"),`,
    premesso: "EXPONEN",
    premessoFornitore:
      "El Proveedor está especializado en el desarrollo de estrategias de marketing y en la consultoría para el fortalecimiento de marca.",
    premessoCliente: (oggetto: string) => `El Cliente: ${oggetto}`,
    siConviene: "ACUERDAN Y ESTIPULAN LO SIGUIENTE",
    art1Title: "Art. 1 - Objeto del Contrato",
    art11: (data: string) =>
      `1.1 El Proveedor se compromete a prestar al Cliente los servicios de consultoría para la definición e implementación de un plan de marketing y desarrollo de marca, según se describe en el presupuesto adjunto fechado el ${data}, que forma parte integrante del presente contrato.`,
    art12Intro: "1.2 Los servicios prestados por el Proveedor al Cliente incluyen:",
    art12Outro:
      "El presupuesto publicitario mensual, elegido junto al Cliente, no está incluido en la contraprestación del presente contrato. Dicho importe deberá ser abonado directamente a la plataforma publicitaria utilizada (p.ej. Facebook Ads, Google Ads) como gasto adicional respecto a la compensación pactada por los servicios del Proveedor.",
    art2Title: "Art. 2 - Obligaciones del Cliente",
    art21:
      "2.1 El Cliente se compromete a proporcionar al Proveedor toda la información, materiales y recursos necesarios para el desarrollo de las actividades previstas en el presente contrato.",
    art3Title: "Art. 3 - Obligaciones del Proveedor",
    art31:
      "3.1 El Proveedor se compromete a desarrollar las actividades previstas en el presente contrato con la máxima profesionalidad y diligencia, proporcionando informes periódicos al Cliente sobre el avance de los trabajos y manteniendo al Cliente constantemente actualizado sobre las actividades realizadas.",
    art4Title: "Art. 4 - Duración del Contrato",
    art41: (mesi: number, da: string, a: string) =>
      `4.1 El presente contrato tiene una duración de ${mesi} meses, con vigencia desde el ${da} hasta el ${a}`,
    art42: (mesi: number) =>
      `4.2 Al vencimiento de los ${mesi} meses, considerados período de prueba, el contrato se renovará automáticamente por otros ${mesi} meses, con el correspondiente ajuste del presupuesto mensual al alza o a la baja según la revisión de los servicios prestados, salvo desistimiento comunicado por escrito por una de las Partes con al menos 30 días de antelación a la fecha de vencimiento del período de prueba.`,
    art43:
      "4.3 Tras el término de los segundos 6 meses, el contrato se renovará automáticamente por una duración de 12 meses y se renovará automáticamente año tras año salvo desistimiento comunicado por escrito por una de las Partes con al menos 60 días de antelación al vencimiento.",
    art5Title: "Art. 5 - Contraprestación y Forma de Pago",
    art51: (importo: string, mesi: number) =>
      `5.1 El Cliente se compromete a abonar al Proveedor una contraprestación mensual de ${importo} IVA incluido por los servicios prestados durante el período de prueba de ${mesi} meses de la colaboración,`,
    art51b1: (rate: number, importo: string) =>
      `Pagadero con solución mensual en ${rate} cuotas de ${importo} IVA incluido;`,
    art51b2:
      "Eventuales modificaciones o solicitudes adicionales a los servicios incluidos en el proyecto preliminar deberán ser previamente acordadas y aceptadas por el Proveedor y podrían implicar un coste adicional",
    art51b3: (importo: string) =>
      `La primera factura de ${importo} IVA incluido se emitirá al inicio del contrato y será pagadera en 30 días`,
    art51b4:
      "Todos los pagos deberán efectuarse dentro de los plazos legales previstos para las transacciones comerciales, según el Código Penal, Art. 31 bis y ss conforme a la normativa española, y en cualquier caso dentro de los 30 días desde la recepción de la factura.",
    art52:
      "5.2 El Proveedor se reserva la posibilidad de pausar la prestación del servicio en caso de no recibir el pago de la factura dentro de los 30 días desde la recepción de la misma por parte del Cliente.",
    art53:
      "5.3 El Proveedor y el Cliente se reservan la posibilidad de redefinir las cifras de la contraprestación de esta colaboración en cualquier momento durante la vigencia del contrato previa comunicación por correo electrónico con al menos 60 días de antelación a la interrupción o modificación del contrato. En ese caso el Cliente deberá liquidar todas las cantidades pendientes hasta ese momento.",
    art6Title: "Art. 6 - Propiedad Intelectual",
    art61:
      "6.1 Todos los contenidos producidos por el Proveedor para el Cliente pasarán a ser propiedad exclusiva del Cliente una vez efectuado el pago de la contraprestación pactada por el trabajo realizado hasta ese momento. El Proveedor está autorizado a utilizar dichos contenidos en sus propios canales oficiales o materiales promocionales online y visibles al público.",
    art7Title: "Art. 7 - Confidencialidad",
    art71:
      "7.1 Las partes se comprometen a mantener confidenciales toda la información comercial y técnica adquirida durante la colaboración y a no divulgarla a terceros sin el consentimiento escrito de la otra parte.",
    art8Title: "Art. 8 - Cláusula Resolutoria Expresa",
    art81:
      "8.1 El presente contrato podrá ser resuelto por una de las Partes en caso de grave incumplimiento de la otra Parte, previa comunicación escrita conteniendo una descripción detallada de las violaciones imputadas.",
    art82:
      "8.2 En todo caso, el Cliente está obligado a abonar al Proveedor todos los pagos debidos por las actividades realizadas hasta la fecha de resolución, incluido el pago por eventuales servicios completados pero aún no liquidados, antes de proceder con la resolución del contrato.",
    art9Title: "Art. 9 - Disposiciones Finales",
    art91:
      "9.1 Eventuales modificaciones al presente contrato deberán efectuarse por escrito y firmadas por ambas Partes.",
    art92:
      "9.2 Para cualquier controversia derivada de la interpretación o ejecución del presente contrato, será competente el Juzgado de Santa Cruz de Tenerife.",
    letto: "Leído, confirmado y suscrito.",
    luogoData: (data: string) => `Puerto de Santiago, ${data}`,
    perFornitore: "Por el Proveedor:",
    fornitoreSign: "Leonardo Mestre, Administrador Anda Agencia de Publicidad SL",
    perCliente: "Por el Cliente:",
  },
};

export async function exportContrattoPDF(c: ContrattoPDFData) {
  const { default: jsPDF } = await import("jspdf");
  const lang = c.lingua === "es" ? "es" : "it";
  const T = CONTRATTO_T[lang];

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210,
    H = 297,
    ML = 20,
    MR = 20;
  const CW = W - ML - MR;

  const decorrenza = new Date(c.dataDecorrenza);
  const scadenzaProva = new Date(decorrenza);
  scadenzaProva.setMonth(scadenzaProva.getMonth() + c.durataMesi);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString(lang === "es" ? "es-ES" : "it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  let y = 20;
  const firmaCanvas = await loadFirmaInvertita();

  const checkPage = (need: number) => {
    if (y + need > H - 20) {
      doc.addPage();
      y = 20;
    }
  };

  const writeP = (text: string, opts?: { bold?: boolean; size?: number }) => {
    doc.setFontSize(opts?.size ?? 10);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(20);
    const lines = doc.splitTextToSize(text, CW);
    checkPage(lines.length * 5 + 2);
    doc.text(lines, ML, y);
    y += lines.length * 5 + 2;
  };

  const writeArt = (titolo: string) => {
    y += 4;
    checkPage(8);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text(titolo, ML, y);
    y += 6;
  };

  const writeBullet = (text: string) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20);
    const lines = doc.splitTextToSize(`• ${text}`, CW - 6);
    checkPage(lines.length * 5);
    doc.text(lines, ML + 6, y);
    y += lines.length * 5 + 1;
  };

  // Titolo (centrato)
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20);
  const titleLines = doc.splitTextToSize(T.title, CW);
  for (const line of titleLines) {
    doc.text(line, W / 2, y, { align: "center" });
    y += 7;
  }
  y += 6;

  writeP(T.tra, { bold: true });
  writeP(T.fornitoreIntro);
  writeP(T.e, { bold: true });

  const cliAddr = [c.cliente.via, c.cliente.cap, c.cliente.citta]
    .filter(Boolean)
    .join(" - ");
  const cliProv = c.cliente.provincia ? ` (${c.cliente.provincia})` : "";
  const cliPiva = c.cliente.partitaIva ? `, P.IVA ${c.cliente.partitaIva}` : "";
  writeP(
    T.clienteIntro(
      c.cliente.nome,
      `${cliAddr}${cliProv}`,
      cliPiva,
      c.rappresentanteLegale,
    ),
  );

  writeP(T.premesso, { bold: true });
  writeBullet(T.premessoFornitore);
  writeBullet(T.premessoCliente(c.oggetto));

  writeP(T.siConviene, { bold: true });

  writeArt(T.art1Title);
  writeP(T.art11(fmtDate(decorrenza)));
  writeP(T.art12Intro);

  type VoceFull = {
    servizio: string;
    descrizione?: string;
    quantita?: number;
    prezzoUnitario?: number;
    tipo?: "mensile" | "una_tantum";
  };
  let voci: VoceFull[] = [];
  try {
    voci = JSON.parse(c.voci);
  } catch {
    voci = [];
  }
  const mensili = voci.filter((v) => v.tipo !== "una_tantum");
  const tantum = voci.filter((v) => v.tipo === "una_tantum");

  const labelBullet = (v: VoceFull) =>
    v.descrizione ? `${v.servizio} — ${v.descrizione}` : v.servizio;

  if (mensili.length > 0) {
    writeP(
      lang === "es"
        ? "Servicios mensuales recurrentes:"
        : "Servizi ricorrenti mensili:",
      { bold: true },
    );
    for (const v of mensili) writeBullet(labelBullet(v));
  }
  if (tantum.length > 0) {
    writeP(
      lang === "es" ? "Servicios una sola vez:" : "Servizi una tantum:",
      { bold: true },
    );
    for (const v of tantum) writeBullet(labelBullet(v));
  }
  writeP(T.art12Outro);

  writeArt(T.art2Title);
  writeP(T.art21);

  writeArt(T.art3Title);
  writeP(T.art31);

  writeArt(T.art4Title);
  writeP(T.art41(c.durataMesi, fmtDate(decorrenza), fmtDate(scadenzaProva)));
  writeP(T.art42(c.durataMesi));
  writeP(T.art43);

  writeArt(T.art5Title);
  writeP(T.art51(fmt(c.importoMensile), c.durataMesi));
  writeBullet(T.art51b1(c.numeroRate, fmt(c.importoMensile)));
  writeBullet(T.art51b2);
  writeBullet(T.art51b3(fmt(c.importoMensile)));
  writeBullet(T.art51b4);

  // Servizi una tantum (se presenti)
  if (tantum.length > 0) {
    const totUnaTantum = tantum.reduce(
      (s, v) => s + (Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0),
      0,
    );
    writeP(
      lang === "es"
        ? `Adicionalmente, el Cliente abonará servicios una sola vez por un total de ${fmt(totUnaTantum)} IVA incluido, facturados al inicio del contrato:`
        : `In aggiunta, il Cliente corrisponderà servizi una tantum per un totale di ${fmt(totUnaTantum)} iva inclusa, fatturati all'avvio del contratto:`,
    );
    for (const v of tantum) {
      writeBullet(
        `${v.servizio}${v.descrizione ? ` — ${v.descrizione}` : ""}: ${fmt(
          (Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0),
        )}`,
      );
    }
  }

  writeP(T.art52);
  writeP(T.art53);

  writeArt(T.art6Title);
  writeP(T.art61);

  writeArt(T.art7Title);
  writeP(T.art71);

  writeArt(T.art8Title);
  writeP(T.art81);
  writeP(T.art82);

  writeArt(T.art9Title);
  writeP(T.art91);
  writeP(T.art92);

  y += 6;
  writeP(T.letto);
  writeP(T.luogoData(fmtDate(decorrenza)));

  y += 4;
  checkPage(40);
  writeP(T.perFornitore, { bold: true });
  y -= 3;
  if (firmaCanvas) {
    const widthMm = 50;
    const heightMm = widthMm * (firmaCanvas.height / firmaCanvas.width);
    checkPage(heightMm + 2);
    doc.addImage(
      firmaCanvas.toDataURL("image/png"),
      "PNG",
      ML,
      y,
      widthMm,
      heightMm,
    );
    y += heightMm + 1;
  }
  writeP(T.fornitoreSign);
  y += 4;
  doc.setDrawColor(190);
  doc.setLineWidth(0.3);
  doc.line(ML, y, ML + 76, y);
  y += 14;
  writeP(T.perCliente, { bold: true });
  writeP(c.rappresentanteLegale);
  y += 14;
  doc.line(ML, y, ML + 76, y);

  doc.save(`contratto_${c.numero}.pdf`);
}

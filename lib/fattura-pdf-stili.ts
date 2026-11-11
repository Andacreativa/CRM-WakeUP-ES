import type { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { LogoPdf } from "./fattura-pdf";

// Impostazioni grafiche alternative del PDF della fattura (Impostazioni ›
// PDF › Impostazione grafica). Ricevono i dati già pronti e tradotti da
// lib/fattura-pdf.ts e disegnano tutto il foglio. Il QR tributario sta
// sempre all'inizio della fattura, dove lo vogliono le FAQ AEAT: in alto a
// sinistra (banda, colonna) o in alto al centro (minimal).
//   banda    = fascia blu scura in testa, numero grande, tabella a righe
//   minimal  = tipografica: righe sottili, niente riempimenti, molta aria
//   colonna  = colonna laterale grigia con QR, logo, azienda e banca

type RGB = [number, number, number];
export type StilePdf = "classico" | "banda" | "minimal" | "colonna";

export interface DatiStile {
  doc: jsPDF;
  accent: RGB;
  logo: LogoPdf | null;
  qrPng: string | null; // null = fattura senza QR (registrata a mano, bozza, proforma)
  etQr: string;
  prova: string | null; // dicitura dell'ambiente di prova, se è il caso
  titolo: string;
  bozza: string | null;
  etEmittente: string;
  etCliente: string;
  azienda: { nome: string; righe: string[] };
  cliente: { nome: string; righe: string[] };
  dati: [string, string][]; // numero, data, scadenza (etichetta, valore)
  note: string[]; // dicitura proforma, «rettifica la fattura…»
  descr: string;
  colonne: string[];
  righe: string[][];
  totali: [string, string][];
  totale: [string, string];
  esenzione: string;
  etPagamento: string;
  pagamento: string[];
  piePagina: string;
}

const W = 210,
  H = 297,
  ML = 15,
  MR = 15;
const NAVY: RGB = [30, 41, 59];
const DARK: RGB = [40, 40, 40];
const GRAY: RGB = [100, 100, 100];
const LINE: RGB = [222, 222, 222];
const BIANCO: RGB = [255, 255, 255];

type Finale = { lastAutoTable: { finalY: number } };
const finalY = (doc: jsPDF) => (doc as unknown as Finale).lastAutoTable.finalY;

function etichetta(doc: jsPDF, testo: string, x: number, y: number, colore: RGB, align?: "right" | "center") {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...colore);
  doc.text(testo.toUpperCase(), x, y, { align, charSpace: 0.6 });
}

// Nome in grassetto e righe sotto; torna la y dopo l'ultima riga
function blocco(
  doc: jsPDF,
  b: { nome: string; righe: string[] },
  x: number,
  y: number,
  larghezza: number,
  opts: { size?: number; align?: "right"; nomeColore?: RGB } = {},
) {
  const size = opts.size ?? 9.5;
  const al = opts.align ? { align: opts.align } : {};
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size + 1);
  doc.setTextColor(...(opts.nomeColore ?? DARK));
  const nome = doc.splitTextToSize(b.nome, larghezza) as string[];
  doc.text(nome, x, y, al);
  y += nome.length * (size + 1) * 0.42 + 1.2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...GRAY);
  for (const r of b.righe) {
    const parti = doc.splitTextToSize(r, larghezza) as string[];
    doc.text(parti, x, y, al);
    y += parti.length * size * 0.45;
  }
  return y;
}

function corsivo(doc: jsPDF, righe: string[], x: number, y: number, larghezza: number) {
  if (!righe.length) return y;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  for (const r of righe) {
    const parti = doc.splitTextToSize(r, larghezza) as string[];
    doc.text(parti, x, y);
    y += parti.length * 3.8 + 1;
  }
  return y + 1;
}

function descrizione(doc: jsPDF, testo: string, x: number, y: number, larghezza: number) {
  if (!testo) return y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  const righe = doc.splitTextToSize(testo, larghezza) as string[];
  doc.text(righe, x, y);
  return y + righe.length * 4.6 + 3;
}

// Se i totali non ci stanno, pagina nuova
function spazio(doc: jsPDF, y: number, serve: number, yNuova = 25) {
  if (y + serve <= H - 18) return y;
  doc.addPage();
  return yNuova;
}

function piede(doc: jsPDF, d: DatiStile, xSin: number, xDes: number) {
  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    if (d.piePagina) doc.text(doc.splitTextToSize(d.piePagina, xDes - xSin - 20) as string[], xSin, H - 10);
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(`${p} / ${pagine}`, xDes, H - 10, { align: "right" });
  }
}

function dicituraProva(doc: jsPDF, d: DatiStile, x: number, y: number) {
  if (!d.prova) return;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(200, 30, 30);
  doc.text(d.prova, x, y, { align: "right" });
}

function allineaTestata(d: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) {
  if (d.section === "head" && [1, 2, 4].includes(d.column.index)) d.cell.styles.halign = "right";
}

// ── Banda ──────────────────────────────────────────────────────────────────
function disegnaBanda(d: DatiStile) {
  const { doc, accent } = d;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 54, "F");
  let xTesto = ML;
  if (d.qrPng) {
    doc.setFillColor(...BIANCO);
    doc.roundedRect(ML, 7, 38, 44, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...DARK);
    doc.text(d.etQr, ML + 19, 11.5, { align: "center" });
    doc.addImage(d.qrPng, "PNG", ML + 4, 13.5, 30, 30);
    doc.text("VERI*FACTU", ML + 19, 48, { align: "center" });
    xTesto = ML + 46;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...BIANCO);
  doc.text(d.titolo, xTesto, 24);
  doc.setFontSize(14);
  doc.setTextColor(...accent);
  doc.text(d.dati[0][1], xTesto, 33.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(226, 232, 240);
  let y = 42;
  for (const [e, v] of d.dati.slice(1)) {
    doc.text(`${e}: ${v}`, xTesto, y);
    y += 5;
  }
  if (d.logo) {
    const k = Math.min(36 / d.logo.width, 13 / d.logo.height);
    const lw = d.logo.width * k,
      lh = d.logo.height * k;
    doc.setFillColor(...BIANCO);
    doc.roundedRect(W - MR - 44, 12, 44, 21, 2, 2, "F");
    doc.addImage(d.logo.dataUrl, "JPEG", W - MR - 22 - lw / 2, 22.5 - lh / 2, lw, lh);
  }
  if (d.bozza) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text(d.bozza, W - MR, 44, { align: "right" });
  }
  dicituraProva(doc, d, W - MR, 59.5);

  // Emittente e cliente affiancati
  const XD = 121;
  y = 66;
  etichetta(doc, d.etEmittente, ML, y, accent);
  etichetta(doc, d.etCliente, XD, y, accent);
  const y1 = blocco(doc, d.azienda, ML, y + 6.5, XD - ML - 10);
  const y2 = blocco(doc, d.cliente, XD, y + 6.5, W - MR - XD);
  y = Math.max(y1, y2) + 5;
  y = corsivo(doc, d.note, ML, y, W - ML - MR);
  y = descrizione(doc, d.descr, ML, y, W - ML - MR);

  autoTable(doc, {
    head: [d.colonne],
    body: d.righe,
    startY: y,
    theme: "striped",
    styles: { fontSize: 9.5, cellPadding: { top: 3.2, bottom: 3.2, left: 2.6, right: 2.6 }, textColor: DARK },
    headStyles: { fillColor: NAVY, textColor: BIANCO, fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 246, 248] },
    bodyStyles: { fillColor: BIANCO },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 14, halign: "right" },
      2: { cellWidth: 27, halign: "right" },
      3: { cellWidth: 24 },
      4: { cellWidth: 28, halign: "right" },
    },
    didParseCell: allineaTestata,
    margin: { left: ML, right: MR, top: 20, bottom: 25 },
  });
  y = spazio(doc, finalY(doc) + 10, 70);

  const xT = 121;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const [e, v] of d.totali) {
    doc.setTextColor(...GRAY);
    doc.text(e, xT + 3, y);
    doc.setTextColor(...DARK);
    doc.text(v, W - MR, y, { align: "right" });
    y += 7;
  }
  doc.setFillColor(...NAVY);
  doc.rect(xT, y - 2.5, W - MR - xT, 11.5, "F");
  doc.setFillColor(...accent);
  doc.rect(xT, y - 2.5, 1.8, 11.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...BIANCO);
  doc.text(d.totale[0], xT + 5, y + 5);
  doc.text(d.totale[1], W - MR - 2, y + 5, { align: "right" });
  y += 18;
  y = corsivo(doc, d.esenzione ? [d.esenzione] : [], ML, y - 3, W - ML - MR) + 3;

  const testoPag = d.pagamento.flatMap((r) => doc.splitTextToSize(r, W - ML - MR - 8) as string[]);
  const hPag = 9 + testoPag.length * 4;
  doc.setFillColor(...accent);
  doc.rect(ML, y, 1.8, hPag, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(d.etPagamento, ML + 5, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text(testoPag, ML + 5, y + 9.5);
  piede(doc, d, ML, W - MR);
}

// ── Minimal ────────────────────────────────────────────────────────────────
function disegnaMinimal(d: DatiStile) {
  const { doc, accent } = d;
  if (d.qrPng) {
    etichetta(doc, d.etQr, W / 2, 12, GRAY, "center");
    doc.addImage(d.qrPng, "PNG", (W - 30) / 2, 14.5, 30, 30);
    etichetta(doc, "VERI*FACTU", W / 2, 49, DARK, "center");
  }
  if (d.logo) {
    const k = Math.min(34 / d.logo.width, 12 / d.logo.height);
    doc.addImage(d.logo.dataUrl, "JPEG", ML, 18, d.logo.width * k, d.logo.height * k);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.text(d.titolo, W - MR, 27, { align: "right", charSpace: 0.5 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...accent);
  doc.text(d.dati[0][1], W - MR, 35, { align: "right" });
  if (d.bozza) {
    doc.setFontSize(9);
    doc.text(d.bozza, W - MR, 41.5, { align: "right" });
  }
  dicituraProva(doc, d, W - MR, 8);

  let y = d.qrPng ? 58 : 48;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(ML, y, W - MR, y);
  y += 9;
  const xC2 = 86;
  etichetta(doc, d.etEmittente, ML, y, GRAY);
  etichetta(doc, d.etCliente, xC2, y, GRAY);
  const y1 = blocco(doc, d.azienda, ML, y + 6.5, 62, { size: 9 });
  const y2 = blocco(doc, d.cliente, xC2, y + 6.5, 58, { size: 9 });
  let y3 = y;
  for (const [e, v] of d.dati.slice(1)) {
    etichetta(doc, e, W - MR, y3, GRAY, "right");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(v, W - MR, y3 + 5, { align: "right" });
    y3 += 12;
  }
  y = Math.max(y1, y2, y3) + 4;
  doc.setDrawColor(...LINE);
  doc.line(ML, y, W - MR, y);
  y += 9;
  y = corsivo(doc, d.note, ML, y, W - ML - MR);
  y = descrizione(doc, d.descr, ML, y, W - ML - MR);

  autoTable(doc, {
    head: [d.colonne.map((c) => c.toUpperCase())],
    body: d.righe,
    startY: y,
    theme: "plain",
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 3.8, bottom: 3.8, left: 1, right: 1 },
      textColor: DARK,
      lineColor: LINE,
      lineWidth: { bottom: 0.2 },
    },
    headStyles: { textColor: GRAY, fontSize: 7.5, fontStyle: "bold", lineColor: DARK, lineWidth: { bottom: 0.5 } },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 14, halign: "right" },
      2: { cellWidth: 27, halign: "right" },
      3: { cellWidth: 24 },
      4: { cellWidth: 28, halign: "right" },
    },
    didParseCell: allineaTestata,
    margin: { left: ML, right: MR, top: 20, bottom: 25 },
  });
  y = spazio(doc, finalY(doc) + 10, 70);

  const xT = 121;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const [e, v] of d.totali) {
    doc.setTextColor(...GRAY);
    doc.text(e, xT, y);
    doc.setTextColor(...DARK);
    doc.text(v, W - MR, y, { align: "right" });
    y += 7;
  }
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.8);
  doc.line(xT, y - 2, W - MR, y - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(d.totale[0], xT, y + 5.5);
  doc.text(d.totale[1], W - MR, y + 5.5, { align: "right" });
  y += 17;
  y = corsivo(doc, d.esenzione ? [d.esenzione] : [], ML, y, W - ML - MR) + 4;

  etichetta(doc, d.etPagamento, ML, y, GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text(
    d.pagamento.flatMap((r) => doc.splitTextToSize(r, W - ML - MR) as string[]),
    ML,
    y + 5,
  );
  piede(doc, d, ML, W - MR);
}

// ── Colonna ────────────────────────────────────────────────────────────────
function disegnaColonna(d: DatiStile) {
  const { doc, accent } = d;
  const SB = 68; // larghezza della colonna
  const cx = SB / 2;
  const XM = SB + 12; // inizio dell'area principale
  const sfondo = () => {
    doc.setFillColor(243, 244, 246);
    doc.rect(0, 0, SB, H, "F");
  };
  sfondo();
  let y = 16;
  if (d.qrPng) {
    etichetta(doc, d.etQr, cx, 13, GRAY, "center");
    doc.addImage(d.qrPng, "PNG", cx - 15, 15.5, 30, 30);
    etichetta(doc, "VERI*FACTU", cx, 50, DARK, "center");
    y = 62;
  }
  if (d.logo) {
    // Su una card bianca: il file del logo ha il fondo bianco
    const k = Math.min(40 / d.logo.width, 14 / d.logo.height);
    const lw = d.logo.width * k,
      lh = d.logo.height * k;
    doc.setFillColor(...BIANCO);
    doc.roundedRect(8, y - 4, SB - 16, lh + 8, 2, 2, "F");
    doc.addImage(d.logo.dataUrl, "JPEG", cx - lw / 2, y, lw, lh);
    y += lh + 14;
  } else y += 4;
  etichetta(doc, d.etEmittente, 10, y, accent);
  blocco(doc, d.azienda, 10, y + 6, SB - 20, { size: 8.5 });

  // Banca in fondo alla colonna
  const yPag = H - 62;
  etichetta(doc, d.etPagamento, 10, yPag, accent);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text(
    d.pagamento.flatMap((r) => doc.splitTextToSize(r, SB - 20) as string[]),
    10,
    yPag + 5,
  );

  // Area principale: titolo, numero, date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  doc.text(d.titolo, XM, 26);
  doc.setFontSize(12);
  doc.setTextColor(...accent);
  doc.text(d.dati[0][1], XM, 34);
  if (d.bozza) {
    doc.setFontSize(9);
    doc.text(d.bozza, W - MR, 10, { align: "right" });
  }
  dicituraProva(doc, d, W - MR, 6);
  let yd = 22;
  for (const [e, v] of d.dati.slice(1)) {
    etichetta(doc, e, W - MR, yd, GRAY, "right");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(v, W - MR, yd + 5, { align: "right" });
    yd += 12;
  }
  y = 50;
  etichetta(doc, d.etCliente, XM, y, accent);
  const yc = blocco(doc, d.cliente, XM, y + 6.5, 70);
  y = Math.max(yc, yd) + 6;
  y = corsivo(doc, d.note, XM, y, W - MR - XM);
  y = descrizione(doc, d.descr, XM, y, W - MR - XM);

  autoTable(doc, {
    head: [d.colonne],
    body: d.righe,
    startY: y,
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 3.2, bottom: 3.2, left: 1.8, right: 1.8 },
      textColor: DARK,
      lineColor: LINE,
      lineWidth: { bottom: 0.2 },
    },
    headStyles: { fillColor: accent, textColor: BIANCO, fontStyle: "bold", fontSize: 8, lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 12, halign: "right" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 18 },
      4: { cellWidth: 24, halign: "right" },
    },
    didParseCell: allineaTestata,
    willDrawPage: (data) => {
      if (data.pageNumber > 1) sfondo();
    },
    margin: { left: XM, right: MR, top: 20, bottom: 25 },
  });
  y = spazio(doc, finalY(doc) + 10, 60);

  const xT = XM + 36;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const [e, v] of d.totali) {
    doc.setTextColor(...GRAY);
    doc.text(e, xT, y);
    doc.setTextColor(...DARK);
    doc.text(v, W - MR, y, { align: "right" });
    y += 7;
  }
  doc.setFillColor(...NAVY);
  doc.rect(xT - 3, y - 2.5, W - MR - xT + 3, 11, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...BIANCO);
  doc.text(d.totale[0], xT, y + 4.8);
  doc.text(d.totale[1], W - MR - 2, y + 4.8, { align: "right" });
  y += 17;
  corsivo(doc, d.esenzione ? [d.esenzione] : [], XM, y, W - MR - XM);
  piede(doc, d, XM, W - MR);
}

export function disegnaStile(stile: StilePdf, d: DatiStile) {
  if (stile === "banda") disegnaBanda(d);
  else if (stile === "minimal") disegnaMinimal(d);
  else disegnaColonna(d);
}

import type { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { LogoPdf } from "./fattura-pdf";

// Impostazioni grafiche alternative del PDF della fattura (Impostazioni ›
// PDF › Impostazione grafica). Ricevono i dati già pronti e tradotti da
// lib/fattura-pdf.ts e disegnano tutto il foglio. Il QR tributario sta
// sempre all'inizio della fattura, dove lo vogliono le FAQ AEAT: in alto a
// sinistra (banda, colonna) o in alto al centro (minimal).
//   banda    = fascia scura in testa, numero grande, tabella a righe
//   minimal  = tipografica: righe sottili, niente riempimenti, molta aria
//   colonna  = colonna laterale scura con QR, logo, azienda e banca
// Il colore della fascia e della colonna è il «tono»: blu notte o antracite.

type RGB = [number, number, number];
export type StilePdf = "classico" | "banda" | "minimal" | "colonna";
export type NomeTono = "notte" | "antracite";
export interface Tono {
  nome: NomeTono;
  fondo: RGB;
  testo: RGB; // testo principale sul fondo
  testoSoft: RGB; // testo secondario sul fondo
  numero: RGB; // numero della fattura sul fondo
  scuro: boolean;
}
// Una riga del blocco pagamenti; l'IBAN sta su una riga sua, in grassetto
export interface RigaPagamento {
  t: string;
  forte?: boolean;
}

export interface DatiStile {
  doc: jsPDF;
  accent: RGB;
  tono: Tono;
  logo: LogoPdf | null;
  logoBianco: LogoPdf | null; // per gli sfondi scuri (PNG trasparente)
  qrPng: string | null; // null = fattura senza QR (registrata a mano, bozza, proforma)
  etQr: string;
  prova: string | null; // dicitura dell'ambiente di prova, se è il caso
  titolo: string;
  bozza: string | null;
  etEmittente: string;
  etCliente: string;
  azienda: { nome: string; righe: string[]; righeStrette: string[] };
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
  pagamento: RigaPagamento[]; // intro, IBAN (grassetto), note
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

export function tonoDa(nome: NomeTono, accent: RGB): Tono {
  if (nome === "antracite")
    return { nome, fondo: [24, 24, 27], testo: BIANCO, testoSoft: [200, 200, 206], numero: accent, scuro: true };
  return { nome: "notte", fondo: NAVY, testo: BIANCO, testoSoft: [203, 213, 225], numero: accent, scuro: true };
}

type Finale = { lastAutoTable: { finalY: number } };
const finalY = (doc: jsPDF) => (doc as unknown as Finale).lastAutoTable.finalY;
const formatoImg = (l: LogoPdf) => (l.dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG");

// Etichetta in maiuscolo spaziato. L'allineamento lo calcoliamo noi: jsPDF
// non conta la spaziatura fra le lettere e a destra sforerebbe il margine.
const SPAZIO_ET = 0.6;
function larghezzaEt(doc: jsPDF, testo: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const t = testo.toUpperCase();
  return doc.getTextWidth(t) + SPAZIO_ET * Math.max(0, t.length - 1);
}
function etichetta(doc: jsPDF, testo: string, x: number, y: number, colore: RGB, align?: "right" | "center") {
  const w = larghezzaEt(doc, testo);
  const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  doc.setTextColor(...colore);
  doc.text(testo.toUpperCase(), x0, y, { charSpace: SPAZIO_ET });
}

// Nome in grassetto e righe sotto; torna la y dopo l'ultima riga
function blocco(
  doc: jsPDF,
  b: { nome: string; righe: string[] },
  x: number,
  y: number,
  larghezza: number,
  opts: { size?: number; align?: "right"; nome?: RGB; righe?: RGB } = {},
) {
  const size = opts.size ?? 9.5;
  const al = opts.align ? { align: opts.align } : {};
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size + 1.5);
  doc.setTextColor(...(opts.nome ?? DARK));
  const nome = doc.splitTextToSize(b.nome, larghezza) as string[];
  doc.text(nome, x, y, al);
  y += nome.length * (size + 1.5) * 0.42 + 1.6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...(opts.righe ?? GRAY));
  for (const r of b.righe) {
    const parti = doc.splitTextToSize(r, larghezza) as string[];
    doc.text(parti, x, y, al);
    y += parti.length * size * 0.47;
  }
  return y;
}

// Righe del blocco pagamenti, a capo per larghezza; la riga dell'IBAN è in
// grassetto e un filo più grande. Torna la y dopo l'ultima riga.
function scriviPagamento(
  doc: jsPDF,
  righe: RigaPagamento[],
  x: number,
  y: number,
  maxW: number,
  size: number,
  colore: RGB,
  coloreForte: RGB = DARK,
) {
  for (const r of righe) {
    const dim = r.forte ? size + 1 : size;
    doc.setFont("helvetica", r.forte ? "bold" : "normal");
    doc.setFontSize(dim);
    doc.setTextColor(...(r.forte ? coloreForte : colore));
    const parti = doc.splitTextToSize(r.t, maxW) as string[];
    doc.text(parti, x, y);
    y += parti.length * dim * 0.5 + (r.forte ? 0.8 : 0);
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

// Logo su un fondo colorato: bianco se il fondo è scuro (e non del colore
// del logo), altrimenti quello normale su una card bianca. Torna l'altezza.
function logoSuFondo(d: DatiStile, x: number, y: number, boxW: number, boxH: number, align: "left" | "right" | "center") {
  const { doc, tono } = d;
  const bianco = tono.scuro && d.logoBianco ? d.logoBianco : null;
  const img = bianco ?? d.logo;
  if (!img) return 0;
  const card = !bianco;
  const pad = card ? 4 : 0;
  const k = Math.min((boxW - pad * 2) / img.width, (boxH - pad * 2) / img.height);
  const lw = img.width * k,
    lh = img.height * k;
  const cw = card ? lw + pad * 2 : lw;
  const ch = card ? lh + pad * 2 : lh;
  const cx = align === "right" ? x - cw : align === "center" ? x - cw / 2 : x;
  if (card) {
    doc.setFillColor(...BIANCO);
    doc.roundedRect(cx, y, cw, ch, 2, 2, "F");
  }
  doc.addImage(img.dataUrl, formatoImg(img), cx + pad, y + pad, lw, lh);
  return ch;
}

// QR sempre su bianco, così si legge su qualunque fondo
function qrSuCard(d: DatiStile, x: number, y: number, suFondo: boolean) {
  const { doc } = d;
  if (!d.qrPng) return;
  if (suFondo) {
    doc.setFillColor(...BIANCO);
    doc.roundedRect(x, y, 38, 45, 2, 2, "F");
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  doc.text(d.etQr, x + 19, y + 4.5, { align: "center" });
  doc.addImage(d.qrPng, "PNG", x + 4, y + 6.5, 30, 30);
  doc.text("VERI*FACTU", x + 19, y + 41, { align: "center" });
}

function allineaTestata(d: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) {
  if (d.section === "head" && [1, 2, 4].includes(d.column.index)) d.cell.styles.halign = "right";
}

// Righe dei totali e riga del totale su fondo pieno
function totali(d: DatiStile, xT: number, y: number, fondo: RGB, barra: RGB | null) {
  const { doc } = d;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const [e, v] of d.totali) {
    doc.setTextColor(...GRAY);
    doc.text(e, xT + 3, y);
    doc.setTextColor(...DARK);
    doc.text(v, W - MR, y, { align: "right" });
    y += 7;
  }
  doc.setFillColor(...fondo);
  doc.rect(xT, y - 2.5, W - MR - xT, 11.5, "F");
  if (barra) {
    doc.setFillColor(...barra);
    doc.rect(xT, y - 2.5, 1.8, 11.5, "F");
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...BIANCO);
  doc.text(d.totale[0], xT + 5, y + 5);
  doc.text(d.totale[1], W - MR - 2, y + 5, { align: "right" });
  return y + 18;
}

// ── Banda ──────────────────────────────────────────────────────────────────
function disegnaBanda(d: DatiStile) {
  const { doc, accent, tono } = d;
  const HB = 56;
  doc.setFillColor(...tono.fondo);
  doc.rect(0, 0, W, HB, "F");
  doc.setFillColor(...accent);
  doc.rect(0, HB, W, 1.4, "F");
  let xTesto = ML;
  if (d.qrPng) {
    qrSuCard(d, ML, 6, true);
    xTesto = ML + 47;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...tono.testo);
  doc.text(d.titolo, xTesto, 22.5);
  doc.setFontSize(14);
  doc.setTextColor(...tono.numero);
  doc.text(d.dati[0][1], xTesto, 32);
  let y = 42;
  const wEt = Math.max(0, ...d.dati.slice(1).map(([e]) => larghezzaEt(doc, e)));
  for (const [e, v] of d.dati.slice(1)) {
    etichetta(doc, e, xTesto, y, tono.testoSoft);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...tono.testo);
    doc.text(v, xTesto + wEt + 5, y);
    y += 6.2;
  }
  logoSuFondo(d, W - MR, 14, 48, 22, "right");
  if (d.bozza) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...tono.numero);
    doc.text(d.bozza, W - MR, 48, { align: "right" });
  }
  dicituraProva(doc, d, W - MR, HB + 6.5);

  // Emittente e cliente affiancati
  const XD = 118;
  y = HB + 14;
  etichetta(doc, d.etEmittente, ML, y, accent);
  etichetta(doc, d.etCliente, XD, y, accent);
  const y1 = blocco(doc, d.azienda, ML, y + 7, XD - ML - 10);
  const y2 = blocco(doc, d.cliente, XD, y + 7, W - MR - XD);
  y = Math.max(y1, y2) + 6;
  y = corsivo(doc, d.note, ML, y, W - ML - MR);
  y = descrizione(doc, d.descr, ML, y, W - ML - MR);

  const testa: RGB = tono.scuro ? tono.fondo : [55, 65, 81];
  autoTable(doc, {
    head: [d.colonne],
    body: d.righe,
    startY: y,
    theme: "striped",
    styles: { fontSize: 9.5, cellPadding: { top: 3.4, bottom: 3.4, left: 2.6, right: 2.6 }, textColor: DARK },
    // Bordo dello stesso colore: copre le fessure fra una cella e l'altra
    headStyles: { fillColor: testa, textColor: BIANCO, fontStyle: "bold", fontSize: 8.5, lineColor: testa, lineWidth: 0.3 },
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
  y = spazio(doc, finalY(doc) + 10, 72);
  y = totali(d, 118, y, testa, accent);
  y = corsivo(doc, d.esenzione ? [d.esenzione] : [], ML, y - 3, W - ML - MR) + 3;

  // Pagamento con barra colorata e IBAN in grassetto
  const yPag = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(d.etPagamento, ML + 5, y + 5);
  const fine = scriviPagamento(doc, d.pagamento, ML + 5, y + 10.5, W - ML - MR - 8, 9, GRAY, DARK);
  doc.setFillColor(...accent);
  doc.rect(ML, yPag, 1.8, fine - yPag - 1, "F");
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
    const k = Math.min(36 / d.logo.width, 13 / d.logo.height);
    doc.addImage(d.logo.dataUrl, formatoImg(d.logo), ML, 17, d.logo.width * k, d.logo.height * k);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.text(d.titolo, W - MR, 25, { align: "right", charSpace: 0.5 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...accent);
  doc.text(d.dati[0][1], W - MR, 33, { align: "right" });
  let yd = 41.5;
  for (const [e, v] of d.dati.slice(1)) {
    etichetta(doc, e, W - MR, yd, GRAY, "right");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(v, W - MR, yd + 4.8, { align: "right" });
    yd += 11;
  }
  if (d.bozza) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    doc.text(d.bozza, W - MR, yd, { align: "right" });
    yd += 6;
  }
  dicituraProva(doc, d, W - MR, 8);

  let y = Math.max(yd + 2, d.qrPng ? 58 : 48);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(ML, y, W - MR, y);
  y += 9;
  const xC2 = 112;
  etichetta(doc, d.etEmittente, ML, y, GRAY);
  etichetta(doc, d.etCliente, xC2, y, GRAY);
  const y1 = blocco(doc, d.azienda, ML, y + 7, xC2 - ML - 10, { size: 9 });
  const y2 = blocco(doc, d.cliente, xC2, y + 7, W - MR - xC2, { size: 9 });
  y = Math.max(y1, y2) + 5;
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
      cellPadding: { top: 3.8, bottom: 3.8, left: 2.4, right: 2.4 },
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
  y = spazio(doc, finalY(doc) + 10, 72);

  const xT = 118;
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
  scriviPagamento(doc, d.pagamento, ML, y + 5.5, W - ML - MR, 9, GRAY, DARK);
  piede(doc, d, ML, W - MR);
}

// ── Colonna ────────────────────────────────────────────────────────────────
function disegnaColonna(d: DatiStile) {
  const { doc, accent, tono } = d;
  const SB = 72; // larghezza della colonna
  const MC = 8; // margine interno
  const cx = SB / 2;
  const XM = SB + 12; // inizio dell'area principale
  const etColore: RGB = accent;
  const sfondo = () => {
    doc.setFillColor(...tono.fondo);
    doc.rect(0, 0, SB, H, "F");
  };
  sfondo();
  let y = 14;
  if (d.qrPng) {
    qrSuCard(d, cx - 19, 8, true);
    y = 62;
  }
  const hLogo = logoSuFondo(d, cx, y, SB - MC * 2, 20, "center");
  y += hLogo ? hLogo + 12 : 4;
  etichetta(doc, d.etEmittente, MC, y, etColore);
  blocco(doc, { nome: d.azienda.nome, righe: d.azienda.righeStrette }, MC, y + 6.5, SB - MC * 2, {
    size: 8.5,
    nome: tono.testo,
    righe: tono.testoSoft,
  });

  // Banca in fondo alla colonna, IBAN in grassetto
  const yPag = H - 64;
  etichetta(doc, d.etPagamento, MC, yPag, etColore);
  scriviPagamento(doc, d.pagamento, MC, yPag + 6, SB - MC * 2, 8, tono.testoSoft, tono.testo);

  // Area principale: titolo, numero, date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...DARK);
  doc.text(d.titolo, XM, 26);
  doc.setFontSize(12.5);
  doc.setTextColor(...accent);
  doc.text(d.dati[0][1], XM, 34.5);
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
  y = Math.max(50, yd + 4);
  etichetta(doc, d.etCliente, XM, y, accent);
  y = blocco(doc, d.cliente, XM, y + 7, W - MR - XM) + 6;
  y = corsivo(doc, d.note, XM, y, W - MR - XM);
  y = descrizione(doc, d.descr, XM, y, W - MR - XM);

  const testa: RGB = tono.scuro ? tono.fondo : [55, 65, 81];
  autoTable(doc, {
    head: [d.colonne],
    body: d.righe,
    startY: y,
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 3.4, bottom: 3.4, left: 2, right: 2 },
      textColor: DARK,
      lineColor: LINE,
      lineWidth: { bottom: 0.2 },
    },
    headStyles: { fillColor: testa, textColor: BIANCO, fontStyle: "bold", fontSize: 8, lineColor: testa, lineWidth: 0.3 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 11, halign: "right" },
      2: { cellWidth: 21, halign: "right" },
      3: { cellWidth: 17 },
      4: { cellWidth: 23, halign: "right" },
    },
    didParseCell: allineaTestata,
    willDrawPage: (data) => {
      if (data.pageNumber > 1) sfondo();
    },
    margin: { left: XM, right: MR, top: 20, bottom: 25 },
  });
  y = spazio(doc, finalY(doc) + 10, 60);
  y = totali(d, XM + 34, y, testa, null);
  corsivo(doc, d.esenzione ? [d.esenzione] : [], XM, y - 3, W - MR - XM);
  piede(doc, d, XM, W - MR);
}

export function disegnaStile(stile: StilePdf, d: DatiStile) {
  if (stile === "banda") disegnaBanda(d);
  else if (stile === "minimal") disegnaMinimal(d);
  else disegnaColonna(d);
}

import type { LogoPdf } from "@/lib/fattura-pdf";
import type { Creditore } from "@/lib/abbonamenti-impostazioni";
import { ETICHETTE, LOCALE, MANDATO_LEGALE, MESI_L } from "@/lib/abbonamenti-testi";
import { formattaIban } from "@/lib/sepa";
import { linguaValida, nomeProdotto, IMPOSTA_LABEL } from "@/components/abbonamenti/tipi";

// PDF «contratto + mandato SEPA» dell'abbonamento, nella lingua del cliente:
// prima il contratto accettato (il testo salvato alla firma), poi la pagina
// del mandato con i dati del creditore, del debitore e del conto, il testo
// legale SEPA Core e la firma elettronica (data, ora, IP). Gira sul server.

export interface AbbonamentoPdf {
  codice: string;
  prodotto: string;
  pianoNome: string;
  prezzo: number;
  tipoIva: string;
  totale: number;
  intestatario: string;
  nif: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  paese: string;
  titolareConto: string;
  iban: string;
  bic: string | null;
  mandatoRef: string;
  mandatoFirmatoIl: Date | string | null;
  mandatoLuogo: string | null;
  mandatoIp: string | null;
  contrattoTesto: string | null;
  lingua: string;
  dataInizio: Date | string | null;
}

type RGB = [number, number, number];
const DARK: RGB = [40, 40, 40];
const GRAY: RGB = [95, 95, 95];
const LINEA: RGB = [210, 210, 210];

const euro = (n: number, lingua: string) =>
  `${n.toLocaleString(LOCALE[linguaValida(lingua)], { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const indirizzoRiga = (p: {
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  paese: string | null;
}) =>
  [p.via, [p.cap, p.citta].filter(Boolean).join(" "), p.provincia, p.paese]
    .filter((x) => x && String(x).trim())
    .join(", ");

export async function pdfContrattoMandato(
  a: AbbonamentoPdf,
  cred: Creditore,
  giornoAddebito: number,
  logo: LogoPdf | null,
): Promise<Buffer> {
  const lingua = linguaValida(a.lingua);
  const L = ETICHETTE[lingua];
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210,
    H = 297,
    ML = 18,
    MR = 18,
    larghezza = W - ML - MR;
  const firmatoIl = a.mandatoFirmatoIl ? new Date(a.mandatoFirmatoIl) : null;
  const dataLunga = (d: Date) =>
    d.toLocaleDateString(LOCALE[lingua], { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
  const oraLunga = (d: Date) =>
    d.toLocaleTimeString(LOCALE[lingua], { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

  // ── Testata di ogni pagina ─────────────────────────────────────────────
  const testata = () => {
    if (logo) {
      const k = Math.min(34 / logo.width, 12 / logo.height);
      doc.addImage(logo.dataUrl, "JPEG", ML, 14, logo.width * k, logo.height * k);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(cred.nome, W - MR, 16, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`${L.nif} ${cred.nif}`, W - MR, 20.5, { align: "right" });
    doc.text(
      indirizzoRiga({ via: cred.via, cap: cred.cap, citta: cred.citta, provincia: cred.provincia, paese: null }),
      W - MR,
      24.5,
      { align: "right" },
    );
    doc.setDrawColor(...LINEA);
    doc.line(ML, 29, W - MR, 29);
  };
  const piede = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY);
      doc.text(`${a.codice} · ${a.mandatoRef}`, ML, H - 10);
      doc.text(`${L.pagina} ${i} / ${n}`, W - MR, H - 10, { align: "right" });
    }
  };

  // ── Contratto ──────────────────────────────────────────────────────────
  testata();
  let y = 38;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(L.contratto, ML, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  const testo = (a.contrattoTesto ?? "").replace(/\r/g, "");
  const paragrafi = testo.split("\n");
  const interlinea = 4.4;
  for (const p of paragrafi) {
    if (!p.trim()) {
      y += interlinea * 0.7;
      continue;
    }
    const titolo = /^[A-ZÁÉÍÓÚÑ0-9 .,'’\-]{12,}$/.test(p.trim()) && p.trim() === p.trim().toUpperCase();
    doc.setFont("helvetica", titolo ? "bold" : "normal");
    const righe = doc.splitTextToSize(p, larghezza) as string[];
    for (const r of righe) {
      if (y > H - 22) {
        doc.addPage();
        testata();
        y = 38;
      }
      y += interlinea;
      doc.text(r, ML, y);
    }
  }

  // ── Mandato (pagina nuova) ────────────────────────────────────────────
  doc.addPage();
  testata();
  y = 38;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(L.mandato, ML, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("SEPA Core Direct Debit", ML, y + 5);

  const inizio = a.dataInizio ? new Date(a.dataInizio) : null;
  const primoCobro = inizio ? `${MESI_L[lingua][inizio.getUTCMonth()]} ${inizio.getUTCFullYear()}` : "—";
  const imposta = IMPOSTA_LABEL[lingua][a.tipoIva] ?? "";
  const righe: [string, string][] = [
    [L.ref, a.mandatoRef],
    [L.identificador, cred.identificador],
    [L.acreedor, `${cred.nome} · ${L.nif} ${cred.nif}\n${indirizzoRiga({ via: cred.via, cap: cred.cap, citta: cred.citta, provincia: cred.provincia, paese: cred.paese })}`],
    [
      L.deudor,
      `${a.titolareConto || a.intestatario}${a.intestatario && a.titolareConto && a.titolareConto !== a.intestatario ? ` (${a.intestatario})` : ""}${a.nif ? ` · ${L.nif} ${a.nif}` : ""}\n${indirizzoRiga(a)}`,
    ],
    [L.iban, formattaIban(a.iban)],
    [L.bic, a.bic || "—"],
    [L.tipoPago, L.recurrente],
    [L.concepto, `${nomeProdotto(a.prodotto)} · ${a.pianoNome}`],
    [L.importe, `${euro(a.totale, lingua)} ${L.alMes} (${euro(a.prezzo, lingua)} + ${imposta})`],
    [L.diaCobro, String(giornoAddebito)],
    [L.desde, primoCobro],
    [L.fecha, firmatoIl ? dataLunga(firmatoIl) : "—"],
    [L.lugar, a.mandatoLuogo || cred.citta],
  ];
  autoTable(doc, {
    startY: y + 10,
    margin: { left: ML, right: MR },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, textColor: DARK, cellPadding: 2.2, lineColor: LINEA, lineWidth: 0.2, valign: "top" },
    columnStyles: { 0: { cellWidth: 58, fontStyle: "bold", fillColor: [246, 246, 246] } },
    body: righe,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  const legale = doc.splitTextToSize(MANDATO_LEGALE[lingua], larghezza) as string[];
  for (const r of legale) {
    y += 4;
    doc.text(r, ML, y);
  }

  // Firma elettronica
  y += 10;
  if (y > H - 50) {
    doc.addPage();
    testata();
    y = 40;
  }
  doc.setDrawColor(...LINEA);
  doc.roundedRect(ML, y, larghezza, 30, 2, 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(L.firma, ML + 4, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  const firmaRighe = doc.splitTextToSize(L.firmaElectronica, larghezza - 8) as string[];
  let fy = y + 11;
  for (const r of firmaRighe) {
    doc.text(r, ML + 4, fy);
    fy += 4;
  }
  doc.setTextColor(...DARK);
  doc.text(
    `${a.titolareConto || a.intestatario} · ${L.firmadoEl} ${firmatoIl ? `${dataLunga(firmatoIl)} ${oraLunga(firmatoIl)}` : "—"}${a.mandatoIp ? ` · ${L.ip} ${a.mandatoIp}` : ""}`,
    ML + 4,
    fy + 2,
  );

  piede();
  return Buffer.from(doc.output("arraybuffer"));
}

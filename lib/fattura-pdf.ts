import { fmt, MESI } from "./constants";
import { compilaTesto, type ImpostazioniFatture } from "./impostazioni";
import { leggiVoci, nonSoggetta, type FatturaDettaglio } from "./fatture";

// PDF della singola fattura e messaggio email. I dati dell'emittente, la
// lingua, il colore e i testi arrivano da Impostazioni › Fatture.
// L'impostazione è quella delle fatture emesse finora con Billin: logo e
// dati dell'azienda a sinistra, QR tributario a destra, Cliente e Factura
// affiancati, tabella dei concetti, totali e metodi di pagamento.

type Lingua = "it" | "es" | "en";
type RGB = [number, number, number];

const MESI_L: Record<Lingua, string[]> = {
  it: MESI,
  es: [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

const T = {
  it: {
    titolo: "FATTURA",
    rettificativa: "FATTURA RETTIFICATIVA",
    bozza: "BOZZA",
    rettifica: "Rettifica la fattura n. {numero} del {data}",
    numero: "N. fattura",
    data: "Data fattura",
    scadenza: "Scadenza",
    cliente: "CLIENTE",
    colonne: ["Concetti", "Q.tà", "Prezzo unit.", "Imp.", "Totale"],
    servizi: "Servizi",
    imponibile: "Imponibile",
    esente: "Esente",
    nonSoggetta: "Non soggetta",
    totale: "Totale",
    pagamento: "Metodi di pagamento",
    bonifico: "Bonifico bancario sul conto",
    swift: "Codice SWIFT",
    qr: "QR tributario",
    prova: "Ambiente di prova AEAT — senza valore fiscale",
    locale: "it-IT",
  },
  es: {
    titolo: "FACTURA",
    rettificativa: "FACTURA RECTIFICATIVA",
    bozza: "BORRADOR",
    rettifica: "Rectifica la factura n.º {numero} de fecha {data}",
    numero: "Nº de factura",
    data: "Fecha factura",
    scadenza: "Fecha vencimiento",
    cliente: "CLIENTE",
    colonne: ["Conceptos", "Cant.", "Precio uni.", "Imp.", "Total"],
    servizi: "Servicios",
    imponibile: "Base Imponible",
    esente: "Exenta",
    nonSoggetta: "No sujeta",
    totale: "Total",
    pagamento: "Métodos de pago",
    bonifico: "Transferencia bancaria al número de cuenta",
    swift: "Código SWIFT",
    qr: "QR tributario",
    prova: "Entorno de pruebas AEAT — sin validez fiscal",
    locale: "es-ES",
  },
  en: {
    titolo: "INVOICE",
    rettificativa: "CORRECTIVE INVOICE",
    bozza: "DRAFT",
    rettifica: "Corrects invoice no. {numero} dated {data}",
    numero: "Invoice no.",
    data: "Invoice date",
    scadenza: "Due date",
    cliente: "BILL TO",
    colonne: ["Items", "Qty", "Unit price", "Tax", "Total"],
    servizi: "Services",
    imponibile: "Net amount",
    esente: "Exempt",
    nonSoggetta: "Not subject",
    totale: "Total",
    pagamento: "Payment methods",
    bonifico: "Bank transfer to account",
    swift: "SWIFT code",
    qr: "QR tributario",
    prova: "AEAT test environment — no fiscal validity",
    locale: "en-GB",
  },
};

// Il paese è salvato in italiano: sul PDF va nella lingua del documento
const PAESI_L: Record<string, { es: string; en: string }> = {
  Spagna: { es: "España", en: "Spain" },
  Italia: { es: "Italia", en: "Italy" },
  Francia: { es: "Francia", en: "France" },
  Germania: { es: "Alemania", en: "Germany" },
  Portogallo: { es: "Portugal", en: "Portugal" },
  "Regno Unito": { es: "Reino Unido", en: "United Kingdom" },
  Irlanda: { es: "Irlanda", en: "Ireland" },
  "Paesi Bassi": { es: "Países Bajos", en: "Netherlands" },
  Belgio: { es: "Bélgica", en: "Belgium" },
  Lussemburgo: { es: "Luxemburgo", en: "Luxembourg" },
  Austria: { es: "Austria", en: "Austria" },
  Svizzera: { es: "Suiza", en: "Switzerland" },
  "Stati Uniti": { es: "Estados Unidos", en: "United States" },
};
const paeseL = (paese: string | null | undefined, lingua: Lingua) =>
  !paese || paese === "Altro" ? "" : lingua === "it" ? paese : (PAESI_L[paese]?.[lingua] ?? paese);

export interface VoceFattura {
  descrizione: string;
  quantita: number;
  prezzo: number;
  imponibile: number;
}

const nomeImposta = (tipoIva: string) => (tipoIva.startsWith("igic") ? "IGIC" : "IVA");

// Le righe sono quelle della fattura. Le fatture di prima non ne hanno: si
// leggono dalla richiesta collegata quando i conti tornano con l'importo,
// altrimenti la fattura è una riga sola.
export function vociFattura(f: FatturaDettaglio, lingua: Lingua = "it"): VoceFattura[] {
  const periodo = `${MESI_L[lingua][f.mese - 1] ?? ""} ${f.anno}`.trim();
  const generica =
    f.richiesta?.descrizione?.trim() || f.contratto?.oggetto?.trim() || T[lingua].servizi;
  const proprie = leggiVoci(f.voci);
  if (proprie.length) {
    return proprie.map((v) => ({
      descrizione: v.descrizione || `${generica} · ${periodo}`,
      quantita: v.quantita,
      prezzo: v.prezzo,
      imponibile: Math.round(v.quantita * v.prezzo * 100) / 100,
    }));
  }
  if (f.richiesta) {
    try {
      const raw = JSON.parse(f.richiesta.voci || "[]") as { descrizione?: string; importo?: number }[];
      const voci = (Array.isArray(raw) ? raw : [])
        .map((v) => ({ descrizione: String(v.descrizione ?? "").trim(), importo: Number(v.importo) || 0 }))
        .filter((v) => v.descrizione || v.importo);
      const somma = voci.reduce((s, v) => s + v.importo, 0);
      if (voci.length && Math.abs(somma - f.importo) < 0.01) {
        return voci.map((v) => ({
          descrizione: v.descrizione || T[lingua].servizi,
          quantita: 1,
          prezzo: v.importo,
          imponibile: v.importo,
        }));
      }
    } catch {
      /* voci non leggibili: riga unica */
    }
  }
  return [
    {
      descrizione: `${generica} · ${periodo}`,
      quantita: 1,
      prezzo: f.importo,
      imponibile: f.importo,
    },
  ];
}

export function totaliFattura(f: { importo: number; iva: number }) {
  const imposta = Math.round(f.importo * (Number(f.iva) || 0)) / 100;
  return { imponibile: f.importo, imposta, totale: f.importo + imposta };
}

const hexToRgb = (hex: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [232, 48, 138];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Logo senza i margini bianchi o trasparenti intorno: così ha la stessa
// grandezza nel PDF qualunque sia il file caricato nelle Impostazioni.
async function caricaLogoRifilato(
  src: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const scala = Math.min(1, 1000 / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scala);
    const h = Math.round(img.naturalHeight * scala);
    const tela = document.createElement("canvas");
    tela.width = w;
    tela.height = h;
    const ctx = tela.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    let x0 = w,
      y0 = h,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (px[i] > 244 && px[i + 1] > 244 && px[i + 2] > 244) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d")?.drawImage(tela, x0, y0, cw, ch, 0, 0, cw, ch);
    return { dataUrl: out.toDataURL("image/jpeg", 0.92), width: cw, height: ch };
  } catch {
    return null;
  }
}

const nomeFilePDF = (f: { id: number; numero: string | null }) =>
  `fattura_${(f.numero ?? `bozza_${f.id}`).replace(/[^\w.-]+/g, "_")}.pdf`;

export async function exportFatturaPDF(f: FatturaDettaglio, cfg: ImpostazioniFatture) {
  (await creaFatturaPDF(f, cfg)).save(nomeFilePDF(f));
}

async function creaFatturaPDF(f: FatturaDettaglio, cfg: ImpostazioniFatture) {
  const lingua: Lingua = cfg.linguaDefault === "es" || cfg.linguaDefault === "en" ? cfg.linguaDefault : "it";
  const L = T[lingua];
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210,
    H = 297,
    ML = 15,
    MR = 15;
  const ACCENT = hexToRgb(cfg.colore || "#e8308a");
  const NAVY: RGB = [30, 41, 59];
  const DARK: RGB = [40, 40, 40];
  const GRAY: RGB = [85, 85, 85];
  const FONDO: RGB = [242, 242, 242];
  const TESTA: RGB = [158, 158, 158];
  const data = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(L.locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
  const bozza = f.stato === "bozza";
  const c = f.cliente;

  // ── Logo e azienda a sinistra ──────────────────────────────────────────
  const logo = cfg.logoUrl ? await caricaLogoRifilato(cfg.logoUrl) : null;
  if (logo) {
    // Sta in un riquadro di 34×12 mm, senza deformarsi
    const k = Math.min(34 / logo.width, 12 / logo.height);
    doc.addImage(logo.dataUrl, "JPEG", ML + 2, 24, logo.width * k, logo.height * k);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  let y = 48;
  doc.text(cfg.ragioneSociale, ML, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  for (const r of [
    cfg.nif,
    cfg.indirizzo,
    [[cfg.cap, cfg.citta].filter(Boolean).join(" "), cfg.provincia, paeseL(cfg.paese, lingua)]
      .filter(Boolean)
      .join(", "),
  ]) {
    if (!r) continue;
    y += 4.6;
    doc.text(r, ML, y);
  }

  // ── QR tributario a destra (30×30 mm, dicitura sopra e sotto) ──────────
  // Solo per le fatture trasmesse da qui: quelle registrate a mano hanno il
  // loro PDF ufficiale altrove.
  if (f.vfQr && !bozza) {
    const { default: QRCode } = await import("qrcode");
    const png = await QRCode.toDataURL(f.vfQr, { errorCorrectionLevel: "M", margin: 0, scale: 8 });
    const lato = 30,
      qx = W - MR - lato;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text(L.qr, qx + lato / 2, 22.5, { align: "center" });
    doc.addImage(png, "PNG", qx, 25, lato, lato);
    doc.text("VERI*FACTU", qx + lato / 2, 60, { align: "center" });
    if (f.vfQr.includes("prewww")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(200, 30, 30);
      doc.text(L.prova, W - MR, 14, { align: "right" });
    }
  }

  // ── Cliente e Factura affiancati ───────────────────────────────────────
  const xD = 121;
  const rett = f.tipoFattura !== "F1";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(L.cliente, ML, 76);
  doc.text(rett ? L.rettificativa : L.titolo, xD, 76);
  if (bozza) {
    doc.setTextColor(...ACCENT);
    doc.text(L.bozza, W - MR, 76, { align: "right" });
  }

  doc.setFontSize(10.5);
  doc.setTextColor(...DARK);
  let yc = 84.5;
  const nome = doc.splitTextToSize(c?.nome ?? "—", xD - ML - 8) as string[];
  doc.text(nome, ML, yc);
  yc += nome.length * 4.8 - 0.4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  for (const r of [
    c?.partitaIva,
    c?.via,
    [[c?.cap, c?.citta].filter(Boolean).join(" "), c?.provincia, paeseL(c?.paese, lingua)]
      .filter(Boolean)
      .join(", "),
  ]) {
    if (!r) continue;
    const parti = doc.splitTextToSize(r, xD - ML - 8) as string[];
    doc.text(parti, ML, yc);
    yc += parti.length * 4.5;
  }

  let yd = 84.5;
  const rigaDato = (etichetta: string, valore: string, forte = false) => {
    doc.setFont("helvetica", forte ? "bold" : "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...(forte ? DARK : GRAY));
    doc.text(etichetta, xD, yd);
    doc.text(valore, W - MR, yd, { align: "right" });
    yd += 6.8;
  };
  rigaDato(L.numero, f.numero ?? "—", true);
  rigaDato(L.data, data(f.data));
  if (f.scadenza) rigaDato(L.scadenza, data(f.scadenza));
  if (rett && f.rettificaDi?.numero) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    const t = compilaTesto(L.rettifica, { numero: f.rettificaDi.numero, data: data(f.rettificaDi.data) });
    doc.text(doc.splitTextToSize(t, W - MR - xD) as string[], xD, yd - 1);
    yd += 6;
  }

  // ── Descrizione dell'operazione ────────────────────────────────────────
  y = Math.max(yc, yd) + 6;
  const descr = (f.descrizione || cfg.vfDescrizioneDefault || "").trim();
  if (descr) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    const righe = doc.splitTextToSize(descr, W - ML - MR) as string[];
    doc.text(righe, ML, y);
    y += righe.length * 4.6 + 3;
  }

  // ── Concetti: testata grigia, corpo su fondo chiaro ────────────────────
  const imposta = nomeImposta(f.tipoIva);
  const zero = !(f.iva > 0);
  const etichettaZero = nonSoggetta(f.causaIgic) ? L.nonSoggetta : L.esente;
  const num = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const voci = vociFattura(f, lingua);
  const tot = totaliFattura(f);
  // Il fondo chiaro arriva fino ai totali, come un foglio unico
  const yTotali = 226;
  autoTable(doc, {
    head: [L.colonne],
    body: voci.map((v) => [
      v.descrizione,
      num(v.quantita),
      fmt(v.prezzo),
      zero ? etichettaZero : `${f.iva} %`,
      fmt(v.imponibile),
    ]),
    startY: y,
    styles: { fontSize: 9.5, cellPadding: { top: 3.4, bottom: 3.4, left: 2.6, right: 2.6 }, textColor: DARK },
    headStyles: { fillColor: TESTA, textColor: [255, 255, 255], fontStyle: "normal", fontSize: 8.5 },
    bodyStyles: { fillColor: FONDO },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 14, halign: "right" },
      2: { cellWidth: 27, halign: "right" },
      3: { cellWidth: 24, halign: "left" },
      4: { cellWidth: 28, halign: "right" },
    },
    didParseCell: (d) => {
      if (d.section === "head" && (d.column.index === 1 || d.column.index === 2 || d.column.index === 4))
        d.cell.styles.halign = "right";
    },
    theme: "plain",
    margin: { left: ML, right: MR, bottom: H - yTotali + 6 },
  });
  const finale = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (doc.getNumberOfPages() === 1 && finale < yTotali - 6) {
    doc.setFillColor(...FONDO);
    doc.rect(ML, finale, W - ML - MR, yTotali - 6 - finale, "F");
  }
  doc.setPage(doc.getNumberOfPages());

  // ── Totali ─────────────────────────────────────────────────────────────
  const xT = xD;
  y = Math.max(yTotali, doc.getNumberOfPages() > 1 ? finale + 10 : 0) + 4;
  const rigaTot = (etichetta: string, valore: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(etichetta, xT + 3, y);
    doc.text(valore, W - MR, y, { align: "right" });
    y += 7.2;
  };
  const conImposta = zero ? `${imposta} ${etichettaZero}` : `${imposta} ${f.iva} %`;
  rigaTot(`${L.imponibile} ${conImposta}`, fmt(tot.imponibile));
  rigaTot(conImposta, fmt(tot.imposta));
  doc.setFillColor(...FONDO);
  doc.rect(xT, y - 2, W - MR - xT, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(L.totale, xT + 3, y + 4.6);
  doc.text(fmt(tot.totale), W - MR, y + 4.6, { align: "right" });
  y += 16;

  // ── Dicitura di esenzione (testo delle Impostazioni) ───────────────────
  if (zero && cfg.testoEsenzione.trim() && !nonSoggetta(f.causaIgic)) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(cfg.testoEsenzione.trim(), W - ML - MR) as string[], ML, y - 4);
  }

  // ── Metodi di pagamento ────────────────────────────────────────────────
  const iban = cfg.iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
  const righePag = [
    cfg.iban ? `${L.bonifico} ${iban}${cfg.bic ? ` / ${L.swift}: ${cfg.bic}` : ""}` : "",
    cfg.noteDefault.trim(),
  ].filter(Boolean);
  const testoPag = righePag.flatMap((r) => doc.splitTextToSize(r, W - ML - MR - 5) as string[]);
  const hPag = 8 + testoPag.length * 4;
  doc.setFillColor(...FONDO);
  doc.rect(ML, y, W - ML - MR, hPag, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(L.pagamento, ML + 2.5, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text(testoPag, ML + 2.5, y + 9);

  // ── Piè di pagina: testo libero e numero di pagina ─────────────────────
  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    if (cfg.piePagina.trim())
      doc.text(doc.splitTextToSize(cfg.piePagina.trim(), W - ML - MR - 20) as string[], ML, H - 10);
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(`${p} / ${pagine}`, W - MR, H - 10, { align: "right" });
  }

  return doc;
}

// ── Email ────────────────────────────────────────────────────────────────
const MAIL = {
  it: {
    oggetto: "Fattura {numero} — {azienda}",
    testo:
      "Gentile {cliente},\n\nin allegato la fattura {numero} del {data} di {importo}{scadenza}.\nPagamento con bonifico sull'IBAN {iban}.\n\nCordiali saluti,\n{azienda}",
    scadenza: ", con scadenza {d}",
  },
  es: {
    oggetto: "Factura {numero} — {azienda}",
    testo:
      "Estimado/a {cliente},\n\nadjuntamos la factura {numero} del {data} por importe de {importo}{scadenza}.\nPago mediante transferencia al IBAN {iban}.\n\nUn cordial saludo,\n{azienda}",
    scadenza: ", con vencimiento {d}",
  },
};

// Destinatario, oggetto e testo del messaggio che accompagna la fattura.
// Spagnolo per i clienti spagnoli, italiano per gli altri (come i solleciti).
export function messaggioFattura(
  f: {
    numero: string | null;
    data: string | Date | null;
    scadenza: string | Date | null;
    importo: number;
    iva: number;
    cliente: { nome: string; paese: string; email?: string | null } | null;
  },
  cfg: ImpostazioniFatture,
): { a: string; oggetto: string; testo: string } | null {
  if (!f.cliente?.email) return null;
  const es = (f.cliente.paese ?? "").toLowerCase() === "spagna";
  const M = es ? MAIL.es : MAIL.it;
  const loc = es ? "es-ES" : "it-IT";
  const v = {
    cliente: f.cliente.nome,
    numero: f.numero ?? "",
    data: f.data ? new Date(f.data).toLocaleDateString(loc) : "",
    importo: fmt(totaliFattura(f).totale),
    scadenza: f.scadenza
      ? M.scadenza.replace("{d}", new Date(f.scadenza).toLocaleDateString(loc))
      : "",
    iban: cfg.iban,
    azienda: cfg.ragioneSociale,
  };
  return {
    a: f.cliente.email,
    oggetto: compilaTesto(M.oggetto, v),
    testo: compilaTesto(M.testo, v),
  };
}

// ── Azioni pronte per i bottoni (lista e pannello) ───────────────────────
async function caricaFatturaECfg(id: number): Promise<[FatturaDettaglio, ImpostazioniFatture]> {
  const [f, cfg] = await Promise.all([
    fetch(`/api/fatture/${id}`).then((r) => {
      if (!r.ok) throw new Error("Fattura non trovata");
      return r.json();
    }),
    fetch("/api/impostazioni/fatture").then((r) => r.json()),
  ]);
  return [f, cfg];
}

export async function scaricaFatturaPDF(id: number) {
  const [f, cfg] = await caricaFatturaECfg(id);
  await exportFatturaPDF(f, cfg);
}

// Manda la fattura al cliente e la segna come inviata; restituisce la data
// d'invio (null se non parte). Con la casella aziendale collegata l'email
// parte da lì con il PDF allegato; altrimenti si scarica il PDF e si apre il
// programma di posta con il messaggio pronto.
export async function inviaFatturaMail(id: number): Promise<string | null> {
  const [[f, cfg], posta] = await Promise.all([
    caricaFatturaECfg(id),
    fetch("/api/mail")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{ configurata: boolean; mittente: string | null } | null>,
  ]);
  const msg = messaggioFattura(f, cfg);
  if (!msg) return null;

  if (posta?.configurata) {
    if (
      !confirm(
        `Inviare la fattura ${f.numero ?? ""} a ${msg.a}?\n\nParte da ${posta.mittente} con il PDF allegato.`,
      )
    )
      return null;
    const doc = await creaFatturaPDF(f, cfg);
    const pdf = doc.output("datauristring").split("base64,")[1] ?? "";
    const res = await fetch(`/api/fatture/${id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf, filename: nomeFilePDF(f) }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Invio non riuscito");
    return String(j.dataInvio);
  }

  if (
    !confirm(
      `Inviare la fattura ${f.numero ?? ""} a ${msg.a}?\n\nSi scarica il PDF da allegare e si apre il programma di posta con il messaggio pronto.`,
    )
  )
    return null;
  await exportFatturaPDF(f, cfg);
  window.location.href = `mailto:${msg.a}?subject=${encodeURIComponent(msg.oggetto)}&body=${encodeURIComponent(msg.testo)}`;
  const dataInvio = new Date().toISOString();
  await fetch(`/api/fatture/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviata: true, dataInvio }),
  });
  return dataInvio;
}

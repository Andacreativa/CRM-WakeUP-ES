import { fmt, MESI } from "./constants";
import { compilaTesto, type ImpostazioniFatture } from "./impostazioni";
import type { FatturaDettaglio } from "./fatture";

// PDF della singola fattura e messaggio email. I dati dell'emittente, la
// lingua, il colore e i testi arrivano da Impostazioni › Fatture.

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
    numero: "N°",
    data: "Data",
    scadenza: "Scadenza",
    emittente: "EMITTENTE",
    cliente: "CLIENTE",
    piva: "P.IVA",
    colonne: ["Descrizione", "Q.tà", "Prezzo", "Imposta", "Imponibile"],
    servizi: "Servizi",
    imponibile: "Imponibile",
    esente: "esente",
    totale: "TOTALE",
    pagamento: "PAGAMENTO",
    metodo: "Metodo",
    banca: "Banca",
    note: "NOTE",
    locale: "it-IT",
  },
  es: {
    titolo: "FACTURA",
    numero: "N.º",
    data: "Fecha",
    scadenza: "Vencimiento",
    emittente: "EMISOR",
    cliente: "CLIENTE",
    piva: "NIF/CIF",
    colonne: ["Descripción", "Cant.", "Precio", "Impuesto", "Base imponible"],
    servizi: "Servicios",
    imponibile: "Base imponible",
    esente: "exento",
    totale: "TOTAL",
    pagamento: "FORMA DE PAGO",
    metodo: "Método",
    banca: "Banco",
    note: "NOTAS",
    locale: "es-ES",
  },
  en: {
    titolo: "INVOICE",
    numero: "No.",
    data: "Date",
    scadenza: "Due date",
    emittente: "FROM",
    cliente: "BILL TO",
    piva: "VAT No.",
    colonne: ["Description", "Qty", "Price", "Tax", "Net amount"],
    servizi: "Services",
    imponibile: "Net amount",
    esente: "exempt",
    totale: "TOTAL",
    pagamento: "PAYMENT",
    metodo: "Method",
    banca: "Bank",
    note: "NOTES",
    locale: "en-GB",
  },
};

const METODO_L: Record<string, Record<Lingua, string>> = {
  bonifico: { it: "Bonifico", es: "Transferencia bancaria", en: "Bank transfer" },
};

export interface VoceFattura {
  descrizione: string;
  quantita: number;
  prezzo: number;
  imponibile: number;
}

const nomeImposta = (tipoIva: string) => (tipoIva.startsWith("igic") ? "IGIC" : "IVA");

// Le voci si leggono dalla richiesta collegata quando i conti tornano con
// l'importo della fattura; altrimenti la fattura è una riga sola.
export function vociFattura(f: FatturaDettaglio, lingua: Lingua = "it"): VoceFattura[] {
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
  const periodo = `${MESI_L[lingua][f.mese - 1] ?? ""} ${f.anno}`.trim();
  const descrizione =
    f.richiesta?.descrizione?.trim() ||
    f.contratto?.oggetto?.trim() ||
    T[lingua].servizi;
  return [
    {
      descrizione: `${descrizione} · ${periodo}`,
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
  `fattura_${(f.numero ?? String(f.id)).replace(/[^\w.-]+/g, "_")}.pdf`;

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
    ML = 16,
    MR = 16;
  const ACCENT = hexToRgb(cfg.colore || "#e8308a");
  const DARK: RGB = [17, 24, 39];
  const GRAY: RGB = [107, 114, 128];
  const LIGHT: RGB = [156, 163, 175];
  const data = (d: string | null) => (d ? new Date(d).toLocaleDateString(L.locale) : "—");

  // ── Testata: logo a sinistra, titolo e numero a destra ──────────────────
  const logo = cfg.logoUrl ? await caricaLogoRifilato(cfg.logoUrl) : null;
  if (logo) {
    // Sta in un riquadro di 62×20 mm, senza deformarsi
    const k = Math.min(62 / logo.width, 20 / logo.height);
    doc.addImage(logo.dataUrl, "JPEG", ML, 16, logo.width * k, logo.height * k);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...DARK);
    doc.text(cfg.ragioneSociale, ML, 24);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...ACCENT);
  doc.text(L.titolo, W - MR, 22, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(`${L.numero} ${f.numero ?? "—"}`, W - MR, 29, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(`${L.data}: ${data(f.data)}`, W - MR, 35, { align: "right" });
  if (f.scadenza) doc.text(`${L.scadenza}: ${data(f.scadenza)}`, W - MR, 40, { align: "right" });

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(ML, 46, W - MR, 46);

  // ── Emittente e cliente ────────────────────────────────────────────────
  const blocco = (x: number, titolo: string, nome: string, righe: (string | null | undefined)[]) => {
    let y = 56;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...ACCENT);
    doc.text(titolo, x, y);
    y += 6;
    doc.setFontSize(10.5);
    doc.setTextColor(...DARK);
    const nomeRighe = doc.splitTextToSize(nome, 84) as string[];
    doc.text(nomeRighe, x, y);
    y += nomeRighe.length * 4.8 + 0.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    for (const r of righe) {
      if (!r) continue;
      const parti = doc.splitTextToSize(r, 84) as string[];
      doc.text(parti, x, y);
      y += parti.length * 4.4;
    }
    return y;
  };
  const c = f.cliente;
  const y1 = blocco(ML, L.emittente, cfg.ragioneSociale, [
    cfg.nif ? `NIF ${cfg.nif}` : null,
    cfg.indirizzo,
    [cfg.cap, cfg.citta, cfg.provincia ? `(${cfg.provincia})` : ""].filter(Boolean).join(" "),
    cfg.email,
    cfg.telefono,
  ]);
  const y2 = blocco(W / 2 + 4, L.cliente, c?.nome ?? "—", [
    c?.partitaIva ? `${L.piva} ${c.partitaIva}` : null,
    c?.via,
    [c?.cap, c?.citta, c?.provincia ? `(${c.provincia})` : ""].filter(Boolean).join(" "),
    c?.paese,
    c?.email,
  ]);

  // ── Voci ───────────────────────────────────────────────────────────────
  const imposta = nomeImposta(f.tipoIva);
  const etichettaImposta = f.iva > 0 ? `${imposta} ${f.iva}%` : `${imposta} ${L.esente}`;
  const voci = vociFattura(f, lingua);
  autoTable(doc, {
    head: [L.colonne],
    body: voci.map((v) => [
      v.descrizione,
      String(v.quantita),
      fmt(v.prezzo),
      f.iva > 0 ? `${f.iva}%` : "0%",
      fmt(v.imponibile),
    ]),
    startY: Math.max(y1, y2) + 8,
    styles: { fontSize: 9, cellPadding: 3.2, textColor: [55, 65, 81] },
    headStyles: { fillColor: [249, 250, 251], textColor: GRAY, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 16, halign: "right" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
    },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right";
    },
    theme: "plain",
    margin: { left: ML, right: MR },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.2);
  doc.line(ML, y, W - MR, y);

  // ── Totali ─────────────────────────────────────────────────────────────
  const tot = totaliFattura(f);
  const xL = W - MR - 72;
  const riga = (label: string, valore: string) => {
    y += 6.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...GRAY);
    doc.text(label, xL, y);
    doc.text(valore, W - MR, y, { align: "right" });
  };
  y += 2;
  riga(L.imponibile, fmt(tot.imponibile));
  riga(etichettaImposta, fmt(tot.imposta));
  y += 4;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(xL, y, W - MR, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...ACCENT);
  doc.text(L.totale, xL, y);
  doc.text(fmt(tot.totale), W - MR, y, { align: "right" });

  // ── Esenzione, pagamento, note ─────────────────────────────────────────
  y += 14;
  if (!(f.iva > 0) && cfg.testoEsenzione) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    const righe = doc.splitTextToSize(cfg.testoEsenzione, W - ML - MR) as string[];
    doc.text(righe, ML, y);
    y += righe.length * 4.2 + 6;
  }
  const sezione = (titolo: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...ACCENT);
    doc.text(titolo, ML, y);
    y += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
  };
  const metodoRaw = (f.metodo || cfg.metodoPagamentoDefault || "").trim();
  const metodo = METODO_L[metodoRaw.toLowerCase()]?.[lingua] ?? metodoRaw;
  sezione(L.pagamento);
  for (const r of [
    metodo ? `${L.metodo}: ${metodo}` : null,
    cfg.banca ? `${L.banca}: ${cfg.banca}` : null,
    cfg.iban ? `IBAN: ${cfg.iban}` : null,
    cfg.bic ? `BIC/SWIFT: ${cfg.bic}` : null,
    f.scadenza ? `${L.scadenza}: ${data(f.scadenza)}` : null,
  ]) {
    if (!r) continue;
    doc.text(r, ML, y);
    y += 4.6;
  }
  if (cfg.noteDefault.trim()) {
    y += 5;
    sezione(L.note);
    const righe = doc.splitTextToSize(cfg.noteDefault.trim(), W - ML - MR) as string[];
    doc.text(righe, ML, y);
  }

  // ── Piè di pagina ──────────────────────────────────────────────────────
  const pie =
    cfg.piePagina.trim() ||
    [cfg.ragioneSociale, cfg.nif ? `NIF ${cfg.nif}` : "", cfg.email].filter(Boolean).join(" · ");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...LIGHT);
  doc.text(doc.splitTextToSize(pie, W - ML - MR) as string[], W / 2, H - 12, { align: "center" });

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

import { createHash } from "node:crypto";

// Registri di fatturazione VERI*FACTU (Orden HAC/1177/2024): dati, impronta
// concatenata e XML. Qui non c'è né database né rete: solo funzioni che da
// una fattura costruiscono il registro da inviare all'AEAT.
// Specifiche: «Veri-Factu_Descripcion_SWeb» v1.0.3, «especificaciones huella
// hash» v0.1.2, «Validaciones_Errores_Veri-Factu» v1.2.2.

export type Ambiente = "prova" | "produzione";
export type TipoFattura = "F1" | "R1" | "R2" | "R3" | "R4";
// A 0 %: esente (E1…E8, per l'IGIC) o non soggetta (N1, N2)
export type CausaIgic = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8" | "N1" | "N2";

export const NS_LR =
  "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd";
export const NS_SI =
  "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";

export interface SistemaInformatico {
  nombreRazon: string; // chi ha prodotto il programma
  nif: string;
  nombreSistema: string; // max 30
  idSistema: string; // max 2
  version: string;
  numeroInstalacion: string;
}

export interface Destinatario {
  nombreRazon: string;
  // Spagnolo: NIF. Estero: IDOtro (02 = NIF-IVA europeo, 04 = documento del
  // paese, 06 = altro documento).
  nif?: string;
  idOtro?: { codigoPais?: string; idType: "02" | "03" | "04" | "05" | "06"; id: string };
}

export interface RegistroPrecedente {
  nifEmittente: string;
  numSerie: string;
  dataFattura: string; // DD-MM-AAAA
  huella: string;
}

export interface DatiAlta {
  nifEmittente: string;
  nombreRazonEmittente: string;
  numSerie: string;
  dataFattura: string; // DD-MM-AAAA
  tipoFattura: TipoFattura;
  // Rettificativa per differenze: gli importi sono la differenza
  rettificate?: { numSerie: string; dataFattura: string }[];
  descrizione: string;
  destinatario: Destinatario;
  claveRegimen: string; // lista L8B per l'IGIC: 01 = regime generale
  imponibile: number;
  aliquota: number; // 0 oppure la percentuale IGIC
  causa?: CausaIgic | null; // obbligatoria se aliquota = 0
  subsanacion?: boolean;
  rechazoPrevio?: "N" | "S" | "X";
}

export interface DatiAnulacion {
  nifEmittente: string;
  numSerie: string;
  dataFattura: string;
  // La fattura non risulta all'AEAT (il suo registro era stato rifiutato)
  sinRegistroPrevio?: boolean;
  rechazoPrevio?: boolean;
}

export interface RegistroGenerato {
  xml: string; // <sum1:RegistroAlta> oppure <sum1:RegistroAnulacion>
  huella: string;
  generatoIl: string; // FechaHoraHusoGenRegistro
  cuotaTotal: string | null;
  importeTotal: string | null;
}

// ── Formati ────────────────────────────────────────────────────────────────
export const importo = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// La data della fattura è salvata a mezzanotte UTC del giorno scelto
export const dataRegistro = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;

// Data e ora con fuso (ora delle Canarie), es. 2026-10-03T14:05:09+01:00
export function dataOraFuso(d: Date = new Date(), timeZone = "Atlantic/Canary"): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const fuso = /([+-]\d{2}:\d{2})/.exec(p.timeZoneName)?.[1] ?? "+00:00";
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${fuso}`;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const el = (nome: string, valore: string) => `<sum1:${nome}>${esc(valore.trim())}</sum1:${nome}>`;

// ── Impronta (SHA-256, esadecimale maiuscolo) ──────────────────────────────
export const sha256 = (testo: string) =>
  createHash("sha256").update(testo, "utf8").digest("hex").toUpperCase();

export function huellaAlta(c: {
  nifEmittente: string;
  numSerie: string;
  dataFattura: string;
  tipoFattura: string;
  cuotaTotal: string;
  importeTotal: string;
  huellaPrecedente: string | null;
  generatoIl: string;
}): string {
  return sha256(
    `IDEmisorFactura=${c.nifEmittente.trim()}&NumSerieFactura=${c.numSerie.trim()}` +
      `&FechaExpedicionFactura=${c.dataFattura}&TipoFactura=${c.tipoFattura}` +
      `&CuotaTotal=${c.cuotaTotal}&ImporteTotal=${c.importeTotal}` +
      `&Huella=${c.huellaPrecedente ?? ""}&FechaHoraHusoGenRegistro=${c.generatoIl}`,
  );
}

export function huellaAnulacion(c: {
  nifEmittente: string;
  numSerie: string;
  dataFattura: string;
  huellaPrecedente: string | null;
  generatoIl: string;
}): string {
  return sha256(
    `IDEmisorFacturaAnulada=${c.nifEmittente.trim()}&NumSerieFacturaAnulada=${c.numSerie.trim()}` +
      `&FechaExpedicionFacturaAnulada=${c.dataFattura}` +
      `&Huella=${c.huellaPrecedente ?? ""}&FechaHoraHusoGenRegistro=${c.generatoIl}`,
  );
}

// ── Controlli prima di generare il registro ────────────────────────────────
// NumSerieFactura: solo ASCII stampabile, senza " ' < > =
const NUM_SERIE_OK = /^[\x20-\x7E]{1,60}$/;
export function erroriAlta(d: DatiAlta): string[] {
  const e: string[] = [];
  if (!d.nifEmittente.trim()) e.push("Manca il NIF dell'azienda (Impostazioni › Dati emittente).");
  if (!d.nombreRazonEmittente.trim()) e.push("Manca la ragione sociale dell'azienda.");
  if (!NUM_SERIE_OK.test(d.numSerie) || /["'<>=]/.test(d.numSerie))
    e.push("Il numero della fattura contiene caratteri non ammessi dall'AEAT.");
  if (!d.descrizione.trim()) e.push("Manca la descrizione dell'operazione.");
  if (d.descrizione.trim().length > 500) e.push("La descrizione dell'operazione supera i 500 caratteri.");
  if (!d.destinatario.nombreRazon.trim()) e.push("Manca il nome del cliente.");
  if (!d.destinatario.nif && !d.destinatario.idOtro?.id)
    e.push("Il cliente non ha NIF / P.IVA: completare l'anagrafica.");
  if (d.destinatario.idOtro && !d.destinatario.idOtro.codigoPais)
    e.push("Cliente estero senza paese riconoscibile: indicare il paese nell'anagrafica.");
  if (d.aliquota === 0 && !d.causa)
    e.push("Fattura a 0 %: scegliere se è esente (e con quale causa) o non soggetta.");
  if (d.aliquota > 0 && d.causa) e.push("Con un'aliquota non si indica una causa di esenzione.");
  if (d.tipoFattura !== "F1" && !d.rettificate?.length)
    e.push("La rettificativa deve indicare la fattura che corregge.");
  return e;
}

// ── XML ────────────────────────────────────────────────────────────────────
function xmlDestinatario(d: Destinatario): string {
  const id = d.nif
    ? el("NIF", d.nif)
    : `<sum1:IDOtro>${d.idOtro!.codigoPais ? el("CodigoPais", d.idOtro!.codigoPais) : ""}${el("IDType", d.idOtro!.idType)}${el("ID", d.idOtro!.id)}</sum1:IDOtro>`;
  return `<sum1:Destinatarios><sum1:IDDestinatario>${el("NombreRazon", d.nombreRazon.slice(0, 120))}${id}</sum1:IDDestinatario></sum1:Destinatarios>`;
}

function xmlEncadenamiento(prec: RegistroPrecedente | null): string {
  if (!prec) return `<sum1:Encadenamiento>${el("PrimerRegistro", "S")}</sum1:Encadenamiento>`;
  return (
    `<sum1:Encadenamiento><sum1:RegistroAnterior>` +
    el("IDEmisorFactura", prec.nifEmittente) +
    el("NumSerieFactura", prec.numSerie) +
    el("FechaExpedicionFactura", prec.dataFattura) +
    el("Huella", prec.huella) +
    `</sum1:RegistroAnterior></sum1:Encadenamiento>`
  );
}

function xmlSistema(s: SistemaInformatico): string {
  return (
    `<sum1:SistemaInformatico>` +
    el("NombreRazon", s.nombreRazon.slice(0, 120)) +
    el("NIF", s.nif) +
    el("NombreSistemaInformatico", s.nombreSistema.slice(0, 30)) +
    el("IdSistemaInformatico", s.idSistema.slice(0, 2)) +
    el("Version", s.version.slice(0, 50)) +
    el("NumeroInstalacion", s.numeroInstalacion.slice(0, 100)) +
    // Funziona solo come VERI*FACTU e per una sola azienda
    el("TipoUsoPosibleSoloVerifactu", "S") +
    el("TipoUsoPosibleMultiOT", "N") +
    el("IndicadorMultiplesOT", "N") +
    `</sum1:SistemaInformatico>`
  );
}

export function registroAlta(
  d: DatiAlta,
  sistema: SistemaInformatico,
  prec: RegistroPrecedente | null,
  adesso: Date = new Date(),
): RegistroGenerato {
  const cuota = d.aliquota > 0 ? Math.round(d.imponibile * d.aliquota) / 100 : 0;
  const cuotaTotal = importo(cuota);
  const importeTotal = importo(d.imponibile + cuota);
  const generatoIl = dataOraFuso(adesso);
  const huella = huellaAlta({
    nifEmittente: d.nifEmittente,
    numSerie: d.numSerie,
    dataFattura: d.dataFattura,
    tipoFattura: d.tipoFattura,
    cuotaTotal,
    importeTotal,
    huellaPrecedente: prec?.huella ?? null,
    generatoIl,
  });

  // Soggetta: qualifica S1 con aliquota e quota. Non soggetta: N1/N2.
  // Esente: la causa, senza aliquota né quota.
  const qualifica =
    d.aliquota > 0
      ? el("CalificacionOperacion", "S1") + el("TipoImpositivo", importo(d.aliquota))
      : d.causa!.startsWith("N")
        ? el("CalificacionOperacion", d.causa!)
        : el("OperacionExenta", d.causa!);
  const dettaglio =
    `<sum1:DetalleDesglose>` +
    el("Impuesto", "03") + // IGIC
    el("ClaveRegimen", d.claveRegimen) +
    qualifica +
    el("BaseImponibleOimporteNoSujeto", importo(d.imponibile)) +
    (d.aliquota > 0 ? el("CuotaRepercutida", cuotaTotal) : "") +
    `</sum1:DetalleDesglose>`;

  const rettifica =
    d.tipoFattura === "F1"
      ? ""
      : el("TipoRectificativa", "I") +
        `<sum1:FacturasRectificadas>` +
        (d.rettificate ?? [])
          .map(
            (r) =>
              `<sum1:IDFacturaRectificada>${el("IDEmisorFactura", d.nifEmittente)}${el("NumSerieFactura", r.numSerie)}${el("FechaExpedicionFactura", r.dataFattura)}</sum1:IDFacturaRectificada>`,
          )
          .join("") +
        `</sum1:FacturasRectificadas>`;

  const xml =
    `<sum1:RegistroAlta>` +
    el("IDVersion", "1.0") +
    `<sum1:IDFactura>${el("IDEmisorFactura", d.nifEmittente)}${el("NumSerieFactura", d.numSerie)}${el("FechaExpedicionFactura", d.dataFattura)}</sum1:IDFactura>` +
    el("NombreRazonEmisor", d.nombreRazonEmittente.slice(0, 120)) +
    (d.subsanacion ? el("Subsanacion", "S") : "") +
    (d.rechazoPrevio && d.rechazoPrevio !== "N" ? el("RechazoPrevio", d.rechazoPrevio) : "") +
    el("TipoFactura", d.tipoFattura) +
    rettifica +
    el("DescripcionOperacion", d.descrizione.slice(0, 500)) +
    xmlDestinatario(d.destinatario) +
    `<sum1:Desglose>${dettaglio}</sum1:Desglose>` +
    el("CuotaTotal", cuotaTotal) +
    el("ImporteTotal", importeTotal) +
    xmlEncadenamiento(prec) +
    xmlSistema(sistema) +
    el("FechaHoraHusoGenRegistro", generatoIl) +
    el("TipoHuella", "01") +
    el("Huella", huella) +
    `</sum1:RegistroAlta>`;
  return { xml, huella, generatoIl, cuotaTotal, importeTotal };
}

export function registroAnulacion(
  d: DatiAnulacion,
  sistema: SistemaInformatico,
  prec: RegistroPrecedente | null,
  adesso: Date = new Date(),
): RegistroGenerato {
  const generatoIl = dataOraFuso(adesso);
  const huella = huellaAnulacion({
    nifEmittente: d.nifEmittente,
    numSerie: d.numSerie,
    dataFattura: d.dataFattura,
    huellaPrecedente: prec?.huella ?? null,
    generatoIl,
  });
  const xml =
    `<sum1:RegistroAnulacion>` +
    el("IDVersion", "1.0") +
    `<sum1:IDFactura>${el("IDEmisorFacturaAnulada", d.nifEmittente)}${el("NumSerieFacturaAnulada", d.numSerie)}${el("FechaExpedicionFacturaAnulada", d.dataFattura)}</sum1:IDFactura>` +
    (d.sinRegistroPrevio ? el("SinRegistroPrevio", "S") : "") +
    (d.rechazoPrevio ? el("RechazoPrevio", "S") : "") +
    xmlEncadenamiento(prec) +
    xmlSistema(sistema) +
    el("FechaHoraHusoGenRegistro", generatoIl) +
    el("TipoHuella", "01") +
    el("Huella", huella) +
    `</sum1:RegistroAnulacion>`;
  return { xml, huella, generatoIl, cuotaTotal: null, importeTotal: null };
}

// Il messaggio per l'AEAT: testata con l'azienda e fino a 1.000 registri.
// incidenza = l'invio arriva in ritardo per un problema tecnico.
export function busta(
  emittente: { nombreRazon: string; nif: string },
  registri: string[],
  incidenza = false,
): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="${NS_LR}" xmlns:sum1="${NS_SI}">` +
    `<soapenv:Header/><soapenv:Body><sum:RegFactuSistemaFacturacion>` +
    `<sum:Cabecera><sum1:ObligadoEmision>${el("NombreRazon", emittente.nombreRazon.slice(0, 120))}${el("NIF", emittente.nif)}</sum1:ObligadoEmision>` +
    (incidenza ? `<sum1:RemisionVoluntaria>${el("Incidencia", "S")}</sum1:RemisionVoluntaria>` : "") +
    `</sum:Cabecera>` +
    registri.map((r) => `<sum:RegistroFactura>${r}</sum:RegistroFactura>`).join("") +
    `</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`
  );
}

// ── Cliente → destinatario ─────────────────────────────────────────────────
// Spagnolo: NIF senza prefisso. Estero: documento ufficiale del paese di
// residenza (IDType 04) con il codice del paese e la P.IVA com'è in
// anagrafica — così sono state trasmesse finora tutte le fatture ai clienti
// esteri (in Billin: tipo «ORIGIN»). Il tipo 02 (NIF-IVA) farebbe dipendere
// l'accettazione dal registro europeo VIES.
export function destinatarioDa(
  cliente: { nome: string; partitaIva: string | null },
  codicePaese: string, // ISO a due lettere della sede; "" se non noto
): Destinatario {
  const piva = (cliente.partitaIva ?? "").replace(/[\s.-]/g, "").toUpperCase();
  const nombreRazon = cliente.nome.trim();
  if (!piva) return { nombreRazon };
  const prefisso = /^[A-Z]{2}(?=[A-Z0-9]{2,})/.exec(piva)?.[0] ?? "";
  // La Grecia scrive EL sulla partita IVA ma il suo codice paese è GR
  const paese = codicePaese || (prefisso === "EL" ? "GR" : prefisso);
  if (paese === "ES") return { nombreRazon, nif: prefisso === "ES" ? piva.slice(2) : piva };
  return { nombreRazon, idOtro: { codigoPais: paese || undefined, idType: "04", id: piva } };
}

// Regime dell'operazione (ClaveRegimen). Le esenti per esportazione (E2) e
// assimilate (E3) vanno col regime 02: con lo 01 l'AEAT non le ammette.
export const regimePer = (causa: string | null | undefined, generale: string) =>
  causa === "E2" || causa === "E3" ? "02" : generale || "01";

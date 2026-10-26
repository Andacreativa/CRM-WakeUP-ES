// SEPA Core: IBAN, identificador de acreedor e fichero pain.008 per la
// banca (AEB «Cuaderno 19-14 XML»). Funzioni pure: le usano il modulo
// pubblico (browser), le API e il cron. Niente Prisma qui.

// ── Caratteri ─────────────────────────────────────────────────────────────
// Il set SEPA è latino ristretto: via accenti e simboli, «ñ» → «n».
export function testoSepa(s: unknown, max = 70): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Mod 97 (ISO 7064) su stringhe lunghe, senza BigInt ───────────────────
export function mod97(numerico: string): number {
  let resto = 0;
  for (let i = 0; i < numerico.length; i += 7) {
    resto = parseInt(String(resto) + numerico.slice(i, i + 7), 10) % 97;
  }
  return resto;
}
const lettereInNumeri = (s: string) =>
  s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

// ── IBAN ─────────────────────────────────────────────────────────────────
export const pulisciIban = (s: unknown) =>
  String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const LUNGHEZZA_IBAN: Record<string, number> = {
  ES: 24, IT: 27, FR: 27, DE: 22, PT: 25, GB: 22, IE: 22, NL: 18, BE: 16, LU: 20, AT: 20, CH: 21,
};

export function ibanValido(raw: unknown): boolean {
  const iban = pulisciIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const attesa = LUNGHEZZA_IBAN[iban.slice(0, 2)];
  if (attesa && iban.length !== attesa) return false;
  return mod97(lettereInNumeri(iban.slice(4) + iban.slice(0, 4))) === 1;
}

export const formattaIban = (raw: unknown) =>
  pulisciIban(raw).replace(/(.{4})/g, "$1 ").trim();

// Nelle liste si vede solo l'inizio e la fine: ES93 •••• •••• 7468
export function mascheraIban(raw: unknown): string {
  const iban = pulisciIban(raw);
  if (iban.length < 8) return iban;
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
}

export const bicValido = (raw: unknown) =>
  /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(raw ?? "").toUpperCase().trim());
export const pulisciBic = (raw: unknown) => String(raw ?? "").toUpperCase().replace(/\s+/g, "");

// ── NIF / NIE / CIF spagnolo ─────────────────────────────────────────────
const LETTERE_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";
export function nifSpagnoloValido(raw: unknown): boolean {
  const v = String(raw ?? "").toUpperCase().replace(/[\s.\-]/g, "");
  if (/^\d{8}[A-Z]$/.test(v)) return LETTERE_DNI[parseInt(v.slice(0, 8), 10) % 23] === v[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const n = parseInt({ X: "0", Y: "1", Z: "2" }[v[0] as "X" | "Y" | "Z"] + v.slice(1, 8), 10);
    return LETTERE_DNI[n % 23] === v[8];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const cifre = v.slice(1, 8);
    let pari = 0,
      dispari = 0;
    for (let i = 0; i < 7; i++) {
      const d = parseInt(cifre[i], 10);
      if (i % 2 === 0) {
        const x = d * 2;
        dispari += x > 9 ? x - 9 : x;
      } else pari += d;
    }
    const controllo = (10 - ((pari + dispari) % 10)) % 10;
    const lettera = "JABCDEFGHI"[controllo];
    const c = v[8];
    if (/[PQRSNW]/.test(v[0])) return c === lettera;
    if (/[ABEH]/.test(v[0])) return c === String(controllo);
    return c === String(controllo) || c === lettera;
  }
  return false;
}

// ── Identificador de acreedor SEPA (ES + 2 cifre di controllo + sufijo + NIF)
export function identificadorAcreedor(nif: unknown, sufijo = "000", paese = "ES"): string {
  const n = String(nif ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^ES(?=[A-Z0-9]{9}$)/, "");
  if (!n) return "";
  const resto = mod97(lettereInNumeri(n + paese + "00"));
  const controllo = String(98 - resto).padStart(2, "0");
  return `${paese}${controllo}${String(sufijo || "000").padStart(3, "0").slice(0, 3)}${n}`;
}

export function identificadorAcreedorValido(raw: unknown): boolean {
  const id = String(raw ?? "").toUpperCase().replace(/\s+/g, "");
  const m = /^([A-Z]{2})(\d{2})([A-Z0-9]{3})([A-Z0-9]{1,28})$/.exec(id);
  if (!m) return false;
  return identificadorAcreedor(m[4], m[3], m[1]) === id;
}

// ── Date ─────────────────────────────────────────────────────────────────
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Gli addebiti si presentano in un giorno lavorativo: sabato e domenica
// scivolano al lunedì (le feste nazionali le sposta la banca).
export function giornoLavorativo(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const g = out.getUTCDay();
  if (g === 6) out.setUTCDate(out.getUTCDate() + 2);
  else if (g === 0) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}

// ── pain.008 ─────────────────────────────────────────────────────────────
export type VersionePain = "pain.008.001.08" | "pain.008.001.02";
export const VERSIONI_PAIN: { value: VersionePain; label: string }[] = [
  { value: "pain.008.001.08", label: "pain.008.001.08 (AEB 19-14 XML, attuale)" },
  { value: "pain.008.001.02", label: "pain.008.001.02 (versione precedente)" },
];
export const versionePainValida = (v: unknown): VersionePain =>
  v === "pain.008.001.02" ? v : "pain.008.001.08";

export interface ParteSepa {
  nome: string;
  iban: string;
  bic?: string | null;
  paese?: string | null; // ISO 2 lettere
  via?: string | null;
  cap?: string | null;
  citta?: string | null;
}

export interface AddebitoPain {
  endToEndId: string;
  importo: number; // euro, 2 decimali
  mandatoRef: string;
  dataFirma: Date;
  seq?: string; // RCUR di norma
  debitore: ParteSepa;
  concepto: string;
}

export interface OpzioniPain {
  versione: VersionePain;
  msgId: string;
  pmtInfId?: string;
  creazione: Date;
  creditore: ParteSepa & { identificador: string };
  dataAddebito: Date;
  batchBooking: boolean;
  addebiti: AddebitoPain[];
}

const PAESI_ISO: Record<string, string> = {
  spagna: "ES", italia: "IT", francia: "FR", germania: "DE", portogallo: "PT", "regno unito": "GB",
  irlanda: "IE", "paesi bassi": "NL", belgio: "BE", lussemburgo: "LU", austria: "AT", svizzera: "CH",
};
// Paese ISO della parte: dal campo paese (nome italiano o codice) oppure dall'IBAN
export function paeseIso(p: { paese?: string | null; iban?: string }): string {
  const v = String(p.paese ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  const iso = PAESI_ISO[v.toLowerCase()];
  if (iso) return iso;
  return pulisciIban(p.iban).slice(0, 2) || "ES";
}

function indirizzoXml(p: ParteSepa, indent: string): string {
  const righe: string[] = [];
  const via = testoSepa(p.via, 70);
  const cap = testoSepa(p.cap, 16);
  const citta = testoSepa(p.citta, 35);
  if (via) righe.push(`${indent}<StrtNm>${escapeXml(via)}</StrtNm>`);
  if (cap) righe.push(`${indent}<PstCd>${escapeXml(cap)}</PstCd>`);
  if (citta) righe.push(`${indent}<TwnNm>${escapeXml(citta)}</TwnNm>`);
  righe.push(`${indent}<Ctry>${paeseIso(p)}</Ctry>`);
  return righe.join("\n");
}

const importoXml = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const dataOraXml = (d: Date) => d.toISOString().slice(0, 19);

// Costruisce il fichero. I nomi e i concetti passano dal set di caratteri
// SEPA; gli importi hanno sempre due decimali; il BIC del debitore è
// facoltativo (NOTPROVIDED), quello del creditore si mette se c'è.
export function pain008(o: OpzioniPain): string {
  const v08 = o.versione === "pain.008.001.08";
  const tagBic = v08 ? "BICFI" : "BIC";
  const totale = o.addebiti.reduce((s, a) => s + Math.round(a.importo * 100), 0) / 100;
  const n = o.addebiti.length;
  const cred = o.creditore;
  const credId = escapeXml(testoSepa(cred.identificador, 35));
  const bicCred = pulisciBic(cred.bic);

  const tx = o.addebiti.map((a) => {
    const bicDeb = pulisciBic(a.debitore.bic);
    const agente = bicValido(bicDeb)
      ? `          <FinInstnId><${tagBic}>${bicDeb}</${tagBic}></FinInstnId>`
      : `          <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
    const haIndirizzo = !!(a.debitore.citta || a.debitore.via || a.debitore.paese);
    return [
      `      <DrctDbtTxInf>`,
      `        <PmtId><EndToEndId>${escapeXml(testoSepa(a.endToEndId, 35))}</EndToEndId></PmtId>`,
      `        <InstdAmt Ccy="EUR">${importoXml(a.importo)}</InstdAmt>`,
      `        <DrctDbtTx>`,
      `          <MndtRltdInf>`,
      `            <MndtId>${escapeXml(testoSepa(a.mandatoRef, 35))}</MndtId>`,
      `            <DtOfSgntr>${ymd(a.dataFirma)}</DtOfSgntr>`,
      `          </MndtRltdInf>`,
      `        </DrctDbtTx>`,
      `        <DbtrAgt>`,
      agente,
      `        </DbtrAgt>`,
      `        <Dbtr>`,
      `          <Nm>${escapeXml(testoSepa(a.debitore.nome, 70))}</Nm>`,
      ...(haIndirizzo
        ? [`          <PstlAdr>`, indirizzoXml(a.debitore, "            "), `          </PstlAdr>`]
        : []),
      `        </Dbtr>`,
      `        <DbtrAcct><Id><IBAN>${pulisciIban(a.debitore.iban)}</IBAN></Id></DbtrAcct>`,
      `        <RmtInf><Ustrd>${escapeXml(testoSepa(a.concepto, 140))}</Ustrd></RmtInf>`,
      `      </DrctDbtTxInf>`,
    ].join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${o.versione}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    `  <CstmrDrctDbtInitn>`,
    `    <GrpHdr>`,
    `      <MsgId>${escapeXml(testoSepa(o.msgId, 35))}</MsgId>`,
    `      <CreDtTm>${dataOraXml(o.creazione)}</CreDtTm>`,
    `      <NbOfTxs>${n}</NbOfTxs>`,
    `      <CtrlSum>${importoXml(totale)}</CtrlSum>`,
    `      <InitgPty>`,
    `        <Nm>${escapeXml(testoSepa(cred.nome, 70))}</Nm>`,
    `        <Id><OrgId><Othr><Id>${credId}</Id></Othr></OrgId></Id>`,
    `      </InitgPty>`,
    `    </GrpHdr>`,
    `    <PmtInf>`,
    `      <PmtInfId>${escapeXml(testoSepa(o.pmtInfId ?? o.msgId, 35))}</PmtInfId>`,
    `      <PmtMtd>DD</PmtMtd>`,
    `      <BtchBookg>${o.batchBooking ? "true" : "false"}</BtchBookg>`,
    `      <NbOfTxs>${n}</NbOfTxs>`,
    `      <CtrlSum>${importoXml(totale)}</CtrlSum>`,
    `      <PmtTpInf>`,
    `        <SvcLvl><Cd>SEPA</Cd></SvcLvl>`,
    `        <LclInstrm><Cd>CORE</Cd></LclInstrm>`,
    `        <SeqTp>${o.addebiti[0]?.seq ?? "RCUR"}</SeqTp>`,
    `      </PmtTpInf>`,
    `      <ReqdColltnDt>${ymd(o.dataAddebito)}</ReqdColltnDt>`,
    `      <Cdtr>`,
    `        <Nm>${escapeXml(testoSepa(cred.nome, 70))}</Nm>`,
    `        <PstlAdr>`,
    indirizzoXml(cred, "          "),
    `        </PstlAdr>`,
    `      </Cdtr>`,
    `      <CdtrAcct><Id><IBAN>${pulisciIban(cred.iban)}</IBAN></Id></CdtrAcct>`,
    `      <CdtrAgt>`,
    bicValido(bicCred)
      ? `        <FinInstnId><${tagBic}>${bicCred}</${tagBic}></FinInstnId>`
      : `        <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`,
    `      </CdtrAgt>`,
    `      <ChrgBr>SLEV</ChrgBr>`,
    `      <CdtrSchmeId>`,
    `        <Id><PrvtId><Othr><Id>${credId}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id>`,
    `      </CdtrSchmeId>`,
    ...tx,
    `    </PmtInf>`,
    `  </CstmrDrctDbtInitn>`,
    `</Document>`,
    ``,
  ].join("\n");
}

// Controlli prima di generare: tutto ciò che la banca rifiuterebbe.
export function problemiPain(o: OpzioniPain): string[] {
  const p: string[] = [];
  if (!identificadorAcreedorValido(o.creditore.identificador))
    p.push("Identificador de acreedor non valido (Configurazione › Abbonamenti)");
  if (!ibanValido(o.creditore.iban)) p.push("IBAN del creditore non valido");
  if (!o.addebiti.length) p.push("Nessun addebito da includere");
  const visti = new Set<string>();
  for (const a of o.addebiti) {
    const chi = testoSepa(a.debitore.nome, 70) || a.endToEndId;
    if (!ibanValido(a.debitore.iban)) p.push(`${chi}: IBAN non valido`);
    if (!(a.importo > 0)) p.push(`${chi}: importo zero`);
    if (!testoSepa(a.mandatoRef, 35)) p.push(`${chi}: manca il riferimento del mandato`);
    if (!(a.dataFirma instanceof Date) || isNaN(a.dataFirma.getTime())) p.push(`${chi}: manca la data di firma del mandato`);
    if (visti.has(a.endToEndId)) p.push(`${chi}: riferimento ${a.endToEndId} ripetuto`);
    visti.add(a.endToEndId);
  }
  return p;
}

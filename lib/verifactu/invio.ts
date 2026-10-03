import https from "node:https";
import fs from "node:fs";
import type { Ambiente } from "./registro";

// Invio dei registri al servizio web dell'AEAT. La connessione si autentica
// con il certificato elettronico dell'azienda (file .p12/.pfx):
//   VERIFACTU_CERT_PATH      percorso del file (sul computer)
//   VERIFACTU_CERT_BASE64    oppure il file in base64 (su Vercel)
//   VERIFACTU_CERT_PASSWORD  la sua password
const ENDPOINT: Record<Ambiente, string> = {
  prova: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  produzione: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
};

export function certificato(): { pfx: Buffer; passphrase: string } | null {
  const passphrase = process.env.VERIFACTU_CERT_PASSWORD ?? "";
  const b64 = process.env.VERIFACTU_CERT_BASE64?.trim();
  if (b64) return { pfx: Buffer.from(b64, "base64"), passphrase };
  const path = process.env.VERIFACTU_CERT_PATH?.trim();
  if (path && fs.existsSync(path)) return { pfx: fs.readFileSync(path), passphrase };
  return null;
}

export function spedisci(ambiente: Ambiente, xml: string): Promise<{ status: number; body: string }> {
  const cert = certificato();
  if (!cert) return Promise.reject(new Error("Certificato dell'azienda non configurato"));
  const url = new URL(ENDPOINT[ambiente]);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: url.host,
        path: url.pathname,
        method: "POST",
        pfx: cert.pfx,
        passphrase: cert.passphrase,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "Content-Length": Buffer.byteLength(xml),
          SOAPAction: '""',
        },
        timeout: 30_000,
      },
      (res) => {
        const pezzi: Buffer[] = [];
        res.on("data", (c: Buffer) => pezzi.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(pezzi).toString("utf8") }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("L'AEAT non ha risposto entro 30 secondi")));
    req.on("error", (e: NodeJS.ErrnoException) => {
      // I .p12 vecchi (cifratura RC2) non si aprono con OpenSSL 3
      if (/unsupported|mac verify|pkcs12|bad decrypt/i.test(e.message))
        reject(new Error(`Certificato non leggibile (password errata o formato vecchio): ${e.message}`));
      else reject(e);
    });
    req.end(xml);
  });
}

// ── Risposta ───────────────────────────────────────────────────────────────
export interface RigaRisposta {
  numSerie: string;
  operazione: "Alta" | "Anulacion" | "";
  stato: "Correcto" | "AceptadoConErrores" | "Incorrecto" | "";
  codiceErrore: string | null;
  descrizioneErrore: string | null;
  // Il registro c'era già (codice 3000): lo stato con cui l'AEAT lo ha
  duplicato: string | null;
  xml: string;
}
export interface RispostaAeat {
  errore: string | null; // messaggio rifiutato per intero (SoapFault)
  csv: string | null;
  attesa: number; // secondi prima del prossimo invio
  statoInvio: string;
  righe: RigaRisposta[];
}

const tag = (xml: string, nome: string) =>
  new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(xml)?.[1]?.trim() ?? null;
const deXml = (s: string | null) =>
  s === null
    ? null
    : s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");

export function leggiRisposta(body: string): RispostaAeat {
  // I prefissi dei namespace cambiano fra ambienti: si tolgono
  const xml = body.replace(/<(\/?)[\w.-]+:/g, "<$1");
  const fault = deXml(tag(xml, "faultstring"));
  if (fault) return { errore: fault, csv: null, attesa: 60, statoInvio: "", righe: [] };
  const righe = [...xml.matchAll(/<RespuestaLinea>([\s\S]*?)<\/RespuestaLinea>/g)].map((m) => {
    const r = m[1];
    return {
      numSerie: deXml(tag(r, "NumSerieFactura")) ?? "",
      operazione: (tag(r, "TipoOperacion") ?? "") as RigaRisposta["operazione"],
      stato: (tag(r, "EstadoRegistro") ?? "") as RigaRisposta["stato"],
      codiceErrore: tag(r, "CodigoErrorRegistro"),
      descrizioneErrore: deXml(tag(r, "DescripcionErrorRegistro")),
      duplicato: tag(r, "EstadoRegistroDuplicado"),
      xml: m[0],
    };
  });
  const statoInvio = tag(xml, "EstadoEnvio") ?? "";
  return {
    errore: statoInvio || righe.length ? null : "Risposta dell'AEAT non riconosciuta",
    csv: tag(xml, "CSV"),
    attesa: parseInt(tag(xml, "TiempoEsperaEnvio") ?? "60", 10) || 60,
    statoInvio,
    righe,
  };
}

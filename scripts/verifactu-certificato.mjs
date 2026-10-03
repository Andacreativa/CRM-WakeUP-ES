// Controlla che il certificato dell'azienda si apra e che l'AEAT lo accetti
// per la connessione. Non invia nessun registro.
// Nel file .env: VERIFACTU_CERT_PATH (file .p12/.pfx) oppure
// VERIFACTU_CERT_BASE64, e VERIFACTU_CERT_PASSWORD.
// Uso: node scripts/verifactu-certificato.mjs [--produzione]
import "dotenv/config";
import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";

const produzione = process.argv.includes("--produzione");
const host = produzione ? "www1.agenciatributaria.gob.es" : "prewww1.aeat.es";
const b64 = process.env.VERIFACTU_CERT_BASE64?.trim();
const path = process.env.VERIFACTU_CERT_PATH?.trim();
const passphrase = process.env.VERIFACTU_CERT_PASSWORD ?? "";

if (!b64 && !path) {
  console.log("Certificato non configurato: manca VERIFACTU_CERT_PATH (o VERIFACTU_CERT_BASE64) nel file .env.");
  process.exit(1);
}
if (!b64 && !fs.existsSync(path)) {
  console.log(`Il file del certificato non c'è: ${path}`);
  process.exit(1);
}
const pfx = b64 ? Buffer.from(b64, "base64") : fs.readFileSync(path);

try {
  tls.createSecureContext({ pfx, passphrase });
  console.log("1/2 Il certificato si apre con la password indicata.");
} catch (e) {
  console.log(`1/2 Il certificato NON si apre: ${e.message}`);
  console.log("    Password sbagliata, oppure file in un formato vecchio (va riesportato).");
  process.exit(1);
}

const req = https.request(
  { host, path: "/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP", method: "GET", pfx, passphrase, timeout: 20_000 },
  (res) => {
    const c = res.socket.getCertificate?.() ?? {};
    console.log(`2/2 Connessione a ${host} riuscita (risposta ${res.statusCode}): l'AEAT accetta il certificato.`);
    if (c.subject) console.log(`    Titolare: ${c.subject.CN ?? ""} · valido fino al ${c.valid_to ?? "?"}`);
    res.resume();
  },
);
req.on("timeout", () => req.destroy(new Error("nessuna risposta entro 20 secondi")));
req.on("error", (e) => {
  console.log(`2/2 Connessione a ${host} NON riuscita: ${e.message}`);
  process.exitCode = 1;
});
req.end();

import { createTransport } from "nodemailer";

// Posta in uscita dalla casella dell'azienda (Gmail / Google Workspace) via
// SMTP. Credenziali nelle variabili d'ambiente: SMTP_USER (indirizzo) e
// SMTP_PASS ("password per le app" di Google). Facoltative: SMTP_HOST,
// SMTP_PORT, SMTP_FROM. Senza credenziali l'invio resta spento.
const utente = () => (process.env.SMTP_USER ?? "").trim();
const password = () => (process.env.SMTP_PASS ?? "").replace(/\s+/g, "");

export const mailConfigurata = () => !!utente() && !!password();
export const mittenteMail = () => (process.env.SMTP_FROM ?? "").trim() || utente();

export async function inviaMail(m: {
  a: string;
  oggetto: string;
  testo: string;
  nomeMittente?: string;
  allegati?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  if (!mailConfigurata()) throw new Error("Posta non configurata");
  const porta = parseInt(process.env.SMTP_PORT ?? "", 10) || 465;
  const trasporto = createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: porta,
    secure: porta === 465,
    auth: { user: utente(), pass: password() },
  });
  await trasporto.sendMail({
    from: m.nomeMittente ? { name: m.nomeMittente, address: mittenteMail() } : mittenteMail(),
    to: m.a,
    subject: m.oggetto,
    text: m.testo,
    attachments: m.allegati,
  });
}

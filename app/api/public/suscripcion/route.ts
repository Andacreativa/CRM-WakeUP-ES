import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ABBONAMENTO_INCLUDE,
  ErroreAbbonamento,
  baseUrl,
  creaAbbonamento,
  firmaConToken,
  leggiDatiAbbonamento,
  leggiRichiestaPreventivo,
  listaPiani,
} from "@/lib/abbonamenti";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { inviaConfermaFirma, inviaRichiestaPreventivo } from "@/lib/abbonamenti-mail";
import { linguaValida, prodottoValido } from "@/components/abbonamenti/tipi";

export const runtime = "nodejs";

// Modulo pubblico di sottoscrizione (/suscripcion/...): senza sessione, il
// proxy lascia passare /api/public/. Protezioni: campo trappola, limite per
// IP, controlli sui dati. Niente dati di altri abbonamenti in uscita.

const ipDi = (request: Request) =>
  (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
  request.headers.get("x-real-ip") ||
  null;

// Limite per IP: 6 invii ogni 10 minuti (memoria del processo)
const tentativi = new Map<string, number[]>();
function troppiTentativi(ip: string | null) {
  if (!ip) return false;
  const ora = Date.now();
  const lista = (tentativi.get(ip) ?? []).filter((t) => ora - t < 10 * 60_000);
  lista.push(ora);
  tentativi.set(ip, lista);
  return lista.length > 6;
}

function datiPubbliciAbbonamento(a: {
  codice: string; prodotto: string; pianoNome: string; prezzo: number; tipoIva: string; iva: number; totale: number;
  intestatario: string; nif: string | null; email: string; telefono: string | null; via: string | null; cap: string | null;
  citta: string | null; provincia: string | null; paese: string; titolareConto: string; iban: string; bic: string | null;
  lingua: string; stato: string; tokenScadenza: Date | null;
}) {
  return {
    codice: a.codice, prodotto: a.prodotto, pianoNome: a.pianoNome, prezzo: a.prezzo, tipoIva: a.tipoIva, iva: a.iva,
    totale: a.totale, intestatario: a.intestatario, nif: a.nif, email: a.email, telefono: a.telefono, via: a.via,
    cap: a.cap, citta: a.citta, provincia: a.provincia, paese: a.paese, titolareConto: a.titolareConto, iban: a.iban,
    bic: a.bic, lingua: a.lingua, stato: a.stato, scaduto: !!a.tokenScadenza && a.tokenScadenza < new Date(),
  };
}

// Dati per il modulo: piani del prodotto, creditore, testi del contratto;
// con ?token= l'abbonamento da firmare (creato da Sales).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = (searchParams.get("token") || "").trim();
  const [cfg, , cred] = await getCreditore(prisma);
  const comune = {
    creditore: {
      nome: cred.nome, nif: cred.nif, identificador: cred.identificador, email: cred.email, citta: cred.citta,
      indirizzo: [cred.via, [cred.cap, cred.citta].filter(Boolean).join(" "), cred.provincia].filter(Boolean).join(", "),
    },
    giornoAddebito: cfg.giornoAddebito,
    inizioMeseSuccessivo: cfg.inizioMeseSuccessivo,
    contratto: { es: cfg.contrattoEs, it: cfg.contrattoIt, en: cfg.contrattoEn },
  };
  if (token) {
    const a = await prisma.abbonamento.findUnique({ where: { tokenFirma: token } });
    if (!a || a.deletedAt) return NextResponse.json({ error: "link_non_valido" }, { status: 404 });
    return NextResponse.json({ ...comune, prodotto: a.prodotto, piani: [], firma: datiPubbliciAbbonamento(a) });
  }
  const prodotto = searchParams.get("prodotto") || "";
  if (!prodottoValido(prodotto)) return NextResponse.json({ error: "prodotto_sconosciuto" }, { status: 404 });
  const piani = (await listaPiani(prisma, prodotto, true)).map((p) => ({
    codice: p.codice,
    nome: p.nome,
    descrizione: { es: p.descrizione, it: p.descrizioneIt, en: p.descrizioneEn },
    prezzo: p.prezzo,
    prezzoLibero: p.prezzoLibero,
    tipoIva: p.tipoIva,
  }));
  return NextResponse.json({ ...comune, prodotto, piani, firma: null });
}

// Piano a prezzo libero (Pro): niente firma né abbonamento, solo l'email
// all'agenzia. Se non parte il cliente deve saperlo: la richiesta non resta altrove.
async function richiestaPreventivo(body: Record<string, unknown>) {
  if (!prodottoValido(body.prodotto)) return NextResponse.json({ error: "prodotto_sconosciuto" }, { status: 404 });
  const piani = await listaPiani(prisma, body.prodotto, true);
  const piano = piani.find((p) => p.codice === body.pianoCodice && p.prezzoLibero);
  if (!piano) return NextResponse.json({ error: "piano_non_valido" }, { status: 400 });
  const { richiesta, errori } = leggiRichiestaPreventivo(body);
  if (errori.length) return NextResponse.json({ error: "dati", errori }, { status: 400 });
  const invio = await inviaRichiestaPreventivo({ ...richiesta, prodotto: body.prodotto, pianoNome: piano.nome });
  if (!invio.inviata) {
    console.error("[POST /api/public/suscripcion] preventivo non inviato:", invio.errore);
    return NextResponse.json({ error: "invio_fallito" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

// Firma: crea l'abbonamento (Base / Medium) oppure completa quello del link.
// Con tipo=preventivo manda la richiesta del piano Pro.
export async function POST(request: Request) {
  const ip = ipDi(request);
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (String(body.sitio_web ?? "").trim()) return NextResponse.json({ ok: true }); // trappola per i bot
    if (troppiTentativi(ip)) return NextResponse.json({ error: "troppi_tentativi" }, { status: 429 });
    if (body.tipo === "preventivo") return await richiestaPreventivo(body);
    if (body.accettoContratto !== true || body.accettoMandato !== true) {
      return NextResponse.json({ error: "consensi", errori: [] }, { status: 400 });
    }
    const { dati, errori } = leggiDatiAbbonamento(body, { conto: true });
    if (errori.length) return NextResponse.json({ error: "dati", errori }, { status: 400 });
    const firma = { ip, userAgent: request.headers.get("user-agent") };
    const [cfg, , cred] = await getCreditore(prisma);
    const token = String(body.token ?? "").trim();
    const base = baseUrl(request);
    const a = await prisma.$transaction(async (tx) => {
      if (token) {
        const esistente = await tx.abbonamento.findUnique({ where: { tokenFirma: token }, include: ABBONAMENTO_INCLUDE });
        if (!esistente || esistente.deletedAt) throw new ErroreAbbonamento("link_non_valido", 404);
        return firmaConToken(tx, esistente, dati, firma, { cfg, cred });
      }
      if (!prodottoValido(body.prodotto)) throw new ErroreAbbonamento("prodotto_sconosciuto", 404);
      return creaAbbonamento(
        tx,
        { prodotto: body.prodotto, pianoCodice: String(body.pianoCodice ?? ""), dati, origine: "modulo", firma },
        { cfg, cred },
      );
    });
    const invio = await inviaConfermaFirma(a, base);
    return NextResponse.json({
      ok: true,
      codice: a.codice,
      mandatoRef: a.mandatoRef,
      email: a.email,
      emailInviata: invio.cliente.inviata,
      lingua: linguaValida(a.lingua),
    });
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/public/suscripcion]", e);
    return NextResponse.json({ error: "errore_server" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ABBONAMENTO_INCLUDE,
  ErroreAbbonamento,
  baseUrl,
  creaAbbonamento,
  leggiDatiAbbonamento,
  serializzaAbbonamento,
} from "@/lib/abbonamenti";
import { getCreditore } from "@/lib/abbonamenti-impostazioni";
import { inviaConfermaFirma, inviaLinkFirma } from "@/lib/abbonamenti-mail";
import { prodottoValido } from "@/components/abbonamenti/tipi";

export const runtime = "nodejs";

// Lista abbonamenti con filtri (Sales › Abbonamenti)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prodotto = searchParams.get("prodotto") || "";
  const stato = searchParams.get("stato") || "";
  const vista = searchParams.get("vista") || "";
  const q = (searchParams.get("q") || "").trim();
  const where: Prisma.AbbonamentoWhereInput = {
    deletedAt: null,
    ...(prodotto ? { prodotto } : {}),
    ...(stato ? { stato } : {}),
    ...(vista === "da_firmare" ? { stato: "in_attesa" } : {}),
    ...(vista === "devoluciones" ? { addebiti: { some: { stato: "devuelto" } } } : {}),
    ...(q
      ? {
          OR: [
            { codice: { contains: q, mode: "insensitive" } },
            { intestatario: { contains: q, mode: "insensitive" } },
            { titolareConto: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { nif: { contains: q, mode: "insensitive" } },
            { mandatoRef: { contains: q, mode: "insensitive" } },
            { pianoNome: { contains: q, mode: "insensitive" } },
            { cliente: { nome: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const rows = await prisma.abbonamento.findMany({
    where,
    include: ABBONAMENTO_INCLUDE,
    orderBy: [{ createdAt: "desc" }],
  });
  const base = baseUrl(request);
  let out = rows.map((a) => serializzaAbbonamento(a, base));
  if (vista === "nuovi") {
    const limite = new Date(Date.now() - 30 * 86_400_000);
    out = out.filter((a) => a.createdAt >= limite);
  }
  return NextResponse.json(out);
}

// Nuovo abbonamento da Sales: «in attesa» con link di firma (Pro e prezzi
// concordati), oppure già firmato su carta (firmatoSuCarta + data).
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!prodottoValido(body.prodotto)) {
      return NextResponse.json({ error: "Scegli il prodotto" }, { status: 400 });
    }
    const suCarta = body.firmatoSuCarta === true;
    const { dati, errori } = leggiDatiAbbonamento(body, { conto: suCarta });
    if (errori.length) {
      return NextResponse.json({ error: "Dati non validi", errori }, { status: 400 });
    }
    const firmatoIl = suCarta && body.mandatoFirmatoIl ? new Date(String(body.mandatoFirmatoIl)) : new Date();
    if (isNaN(firmatoIl.getTime())) {
      return NextResponse.json({ error: "Data di firma non valida" }, { status: 400 });
    }
    const prezzo = body.prezzo === undefined || body.prezzo === null || body.prezzo === ""
      ? null
      : parseFloat(String(body.prezzo).replace(",", "."));
    if (prezzo !== null && !(prezzo >= 0)) {
      return NextResponse.json({ error: "Prezzo non valido" }, { status: 400 });
    }
    const dataInizio = body.dataInizio ? new Date(String(body.dataInizio)) : null;
    const [cfg, , cred] = await getCreditore(prisma);
    const a = await prisma.$transaction((tx) =>
      creaAbbonamento(
        tx,
        {
          prodotto: String(body.prodotto),
          pianoId: body.pianoId ? parseInt(String(body.pianoId), 10) : null,
          pianoCodice: body.pianoCodice ? String(body.pianoCodice) : null,
          prezzo,
          tipoIva: body.tipoIva ? String(body.tipoIva) : null,
          dati,
          origine: "manuale",
          note: body.note ? String(body.note) : null,
          dataInizio: dataInizio && !isNaN(dataInizio.getTime()) ? dataInizio : null,
          firma: suCarta ? { ip: null, userAgent: "firma su carta" } : null,
        },
        { cfg, cred, oggi: suCarta ? firmatoIl : new Date() },
      ),
    );
    const base = baseUrl(request);
    let invio = null;
    if (!suCarta && body.inviaLink !== false) invio = await inviaLinkFirma(a, base);
    if (suCarta && body.inviaConferma === true) invio = (await inviaConfermaFirma(a, base)).cliente;
    return NextResponse.json({ ...serializzaAbbonamento(a, base), invio });
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/abbonamenti]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

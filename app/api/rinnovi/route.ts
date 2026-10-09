import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  RINNOVO_INCLUDE,
  fatturazioneValida,
  proprietaValida,
  pulisciDominio,
  serializzaRinnovo,
  statoRinnovoValido,
} from "@/lib/rinnovi";

// Lista rinnovi con filtri; ordinata per scadenza. mese = mese di scadenza.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const num = (k: string) => {
    const v = searchParams.get(k);
    return v ? parseInt(v, 10) || 0 : 0;
  };
  const mese = num("mese");
  const clienteId = num("clienteId");
  const stato = searchParams.get("stato") || "";
  const vista = searchParams.get("vista") || "";
  const q = (searchParams.get("q") || "").trim();

  const where: Prisma.RinnovoSitoWhereInput = {
    deletedAt: null,
    ...(clienteId > 0 ? { clienteId } : {}),
    ...(stato ? { stato } : {}),
    ...(vista === "senza_cliente" ? { clienteId: null } : {}),
    ...(q
      ? {
          OR: [
            { dominio: { contains: q, mode: "insensitive" } },
            { nomeCliente: { contains: q, mode: "insensitive" } },
            { hosting: { contains: q, mode: "insensitive" } },
            { note: { contains: q, mode: "insensitive" } },
            { cliente: { nome: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.rinnovoSito.findMany({
    where,
    include: RINNOVO_INCLUDE,
    orderBy: [{ scadenza: "asc" }, { dominio: "asc" }],
  });
  let out = rows.map((r) => serializzaRinnovo(r));
  if (mese > 0) out = out.filter((r) => r.scadenza.getUTCMonth() + 1 === mese);
  if (vista === "da_fatturare") out = out.filter((r) => r.daFatturare);
  // I siti non attivi in fondo: le loro date vecchie non sono scadenze da seguire
  out.sort((a, b) => Number(a.stato === "non_attivo") - Number(b.stato === "non_attivo"));
  return NextResponse.json(out);
}

// Dati del form, in comune tra POST e PATCH.
export function datiRinnovo(body: Record<string, unknown>, parziale = false) {
  const ha = (k: string) => !parziale || body[k] !== undefined;
  const str = (k: string) => {
    const v = String(body[k] ?? "").trim();
    return v || null;
  };
  const data: Prisma.RinnovoSitoUncheckedUpdateInput = {};
  if (ha("dominio")) data.dominio = pulisciDominio(body.dominio);
  if (ha("clienteId")) data.clienteId = body.clienteId ? parseInt(String(body.clienteId), 10) : null;
  if (ha("nomeCliente")) data.nomeCliente = str("nomeCliente");
  if (ha("scadenza")) data.scadenza = body.scadenza ? new Date(String(body.scadenza)) : undefined;
  if (ha("importo")) {
    data.importo = Math.max(0, parseFloat(String(body.importo ?? "0").replace(",", ".")) || 0);
  }
  if (ha("fatturazione")) data.fatturazione = fatturazioneValida(body.fatturazione);
  if (ha("stato")) data.stato = statoRinnovoValido(body.stato);
  if (ha("hosting")) data.hosting = str("hosting");
  if (ha("proprieta")) data.proprieta = proprietaValida(body.proprieta);
  if (ha("accesso")) data.accesso = str("accesso");
  if (ha("note")) data.note = str("note");
  return data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = datiRinnovo(body);
    if (!data.dominio) {
      return NextResponse.json({ error: "Dominio obbligatorio" }, { status: 400 });
    }
    if (!data.scadenza || isNaN((data.scadenza as Date).getTime())) {
      return NextResponse.json({ error: "Scadenza obbligatoria" }, { status: 400 });
    }
    const doppio = await prisma.rinnovoSito.findUnique({
      where: { dominio: data.dominio as string },
    });
    if (doppio) {
      return NextResponse.json(
        { error: `${data.dominio} è già nei rinnovi${doppio.deletedAt ? " (eliminato)" : ""}` },
        { status: 409 },
      );
    }
    const r = await prisma.rinnovoSito.create({
      data: data as Prisma.RinnovoSitoUncheckedCreateInput,
      include: RINNOVO_INCLUDE,
    });
    return NextResponse.json(serializzaRinnovo(r));
  } catch (e) {
    console.error("[POST /api/rinnovi]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

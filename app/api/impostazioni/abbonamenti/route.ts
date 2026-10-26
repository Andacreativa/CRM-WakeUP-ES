import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCreditore, salvaImpostazioniAbbonamenti } from "@/lib/abbonamenti-impostazioni";
import { identificadorAcreedor, identificadorAcreedorValido } from "@/lib/sepa";
import { baseUrl } from "@/lib/abbonamenti";

// Impostazioni + creditore risolto (per mostrare i valori effettivi e
// l'identificador calcolato dal NIF)
export async function GET(request: Request) {
  const [cfg, fatt, cred] = await getCreditore(prisma);
  return NextResponse.json({
    cfg,
    creditore: cred,
    identificadorCalcolato: identificadorAcreedor(fatt.nif),
    identificadorValido: identificadorAcreedorValido(cred.identificador),
    base: baseUrl(request),
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const cfg = await salvaImpostazioniAbbonamenti(prisma, body ?? {});
    const [, fatt, cred] = await getCreditore(prisma);
    return NextResponse.json({
      cfg,
      creditore: cred,
      identificadorCalcolato: identificadorAcreedor(fatt.nif),
      identificadorValido: identificadorAcreedorValido(cred.identificador),
      base: baseUrl(request),
    });
  } catch (e) {
    console.error("[PUT /api/impostazioni/abbonamenti]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

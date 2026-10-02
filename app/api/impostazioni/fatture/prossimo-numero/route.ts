import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getImpostazioniFatture,
  prossimoNumeroFattura,
} from "@/lib/impostazioni";

// ?anno=2026 — con prefisso/formato/partenza/reset opzionali per l'anteprima
// di valori non ancora salvati.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const anno = parseInt(searchParams.get("anno") || "", 10) || new Date().getFullYear();
  const cfg = await getImpostazioniFatture(prisma);
  const prefisso = searchParams.get("prefisso");
  const formato = searchParams.get("formato");
  const partenza = searchParams.get("partenza");
  const reset = searchParams.get("reset");
  const override = {
    ...cfg,
    ...(prefisso !== null ? { numeroPrefisso: prefisso } : {}),
    ...(formato !== null && formato.includes("{N") ? { numeroFormato: formato } : {}),
    ...(partenza !== null ? { numeroPartenza: parseInt(partenza, 10) || 1 } : {}),
    ...(reset !== null ? { resetAnnuale: reset === "1" || reset === "true" } : {}),
  };
  const numero = await prossimoNumeroFattura(prisma, anno, override);
  return NextResponse.json({ numero, anno });
}

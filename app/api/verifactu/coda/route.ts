import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpostazioniFatture } from "@/lib/impostazioni";
import { ambienteAttivo, ErroreFattura, inviaCoda, statoCoda } from "@/lib/verifactu/catena";
import { certificato } from "@/lib/verifactu/invio";

// Stato dell'invio all'AEAT: modo, certificato, registri in coda, attesa
export async function GET() {
  const cfg = await getImpostazioniFatture(prisma);
  const base = { modo: cfg.vfModo, certificato: !!certificato() };
  try {
    const ambiente = ambienteAttivo(cfg);
    if (!ambiente) return NextResponse.json({ ...base, inCoda: 0, attesa: 0, errore: null });
    return NextResponse.json({ ...base, ...(await statoCoda(prisma, ambiente)) });
  } catch (e) {
    return NextResponse.json({
      ...base,
      inCoda: 0,
      attesa: 0,
      errore: e instanceof Error ? e.message : String(e),
    });
  }
}

// Manda i registri in coda (lo fa anche l'emissione; qui si riprova)
export async function POST() {
  try {
    const cfg = await getImpostazioniFatture(prisma);
    const ambiente = ambienteAttivo(cfg);
    if (!ambiente) return NextResponse.json({ inCoda: 0, inviati: 0, attesa: 0, errore: null });
    return NextResponse.json(await inviaCoda(prisma, cfg, ambiente));
  } catch (e) {
    const status = e instanceof ErroreFattura ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}

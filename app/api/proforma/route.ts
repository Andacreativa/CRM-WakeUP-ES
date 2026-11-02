import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpostazioniFatture, prossimoNumeroProforma } from "@/lib/impostazioni";
import { leggiDatiProforma } from "@/lib/proforma";

// Proforma (linguetta di Finance › Fatture). Tabella e numerazione loro:
// nessuna somma di fatturato le vede.
export async function GET(request: Request) {
  const anno = parseInt(new URL(request.url).searchParams.get("anno") || "", 10);
  const proforma = await prisma.proforma.findMany({
    where: anno > 0 ? { anno } : {},
    include: {
      cliente: true,
      fattura: { select: { id: true, numero: true, stato: true } },
    },
    orderBy: [{ data: "desc" }, { id: "desc" }],
  });
  return NextResponse.json(proforma);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { errori, dati } = leggiDatiProforma(body);
  if (errori.length) return NextResponse.json({ error: errori[0], errori }, { status: 400 });
  const cfg = await getImpostazioniFatture(prisma);
  // Il numero è il prossimo della serie: se due proforma nascono insieme,
  // la seconda trova il numero preso (indice unico) e prende il successivo
  for (let tentativo = 0; ; tentativo++) {
    const numero = await prossimoNumeroProforma(prisma, dati.anno, cfg);
    try {
      const p = await prisma.proforma.create({
        data: { ...dati, numero },
        include: { cliente: true, fattura: { select: { id: true, numero: true, stato: true } } },
      });
      return NextResponse.json(p);
    } catch (e) {
      const doppio = (e as { code?: string })?.code === "P2002";
      if (!doppio || tentativo >= 4) throw e;
    }
  }
}

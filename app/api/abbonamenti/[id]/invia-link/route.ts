import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ABBONAMENTO_INCLUDE, baseUrl, nuovoToken, serializzaAbbonamento } from "@/lib/abbonamenti";
import { inviaLinkFirma } from "@/lib/abbonamenti-mail";

export const runtime = "nodejs";

// (Ri)manda il link di firma; se il token manca o è scaduto ne fa uno nuovo
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let a = await prisma.abbonamento.findUnique({ where: { id: parseInt(id, 10) || 0 }, include: ABBONAMENTO_INCLUDE });
  if (!a || a.deletedAt) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  if (a.stato !== "in_attesa") return NextResponse.json({ error: "L'abbonamento è già firmato" }, { status: 409 });
  const oggi = new Date();
  if (!a.tokenFirma || !a.tokenScadenza || a.tokenScadenza < oggi) {
    a = await prisma.abbonamento.update({
      where: { id: a.id },
      data: { tokenFirma: nuovoToken(), tokenScadenza: new Date(oggi.getTime() + 30 * 86_400_000) },
      include: ABBONAMENTO_INCLUDE,
    });
  }
  const base = baseUrl(request);
  const invio = await inviaLinkFirma(a, base);
  return NextResponse.json({ ...serializzaAbbonamento(a, base), invio });
}

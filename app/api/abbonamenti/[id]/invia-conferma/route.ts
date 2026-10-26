import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ABBONAMENTO_INCLUDE, baseUrl } from "@/lib/abbonamenti";
import { inviaConfermaFirma } from "@/lib/abbonamenti-mail";

export const runtime = "nodejs";

// Rimanda al cliente contratto e mandato in PDF
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.abbonamento.findUnique({ where: { id: parseInt(id, 10) || 0 }, include: ABBONAMENTO_INCLUDE });
  if (!a || a.deletedAt) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  if (!a.mandatoFirmatoIl) return NextResponse.json({ error: "Mandato non ancora firmato" }, { status: 409 });
  const esito = await inviaConfermaFirma(a, baseUrl(request));
  return NextResponse.json(esito);
}

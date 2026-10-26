import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/abbonamenti";
import { DURATA_LINK_EMAIL, linkArea } from "@/lib/area-token";

export const runtime = "nodejs";

// Link all'area cliente per l'abbonato (7 giorni), da copiare o mandare a
// mano dalla scheda in Sales
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.abbonamento.findUnique({ where: { id: parseInt(id, 10) || 0 }, select: { email: true, lingua: true, deletedAt: true, mandatoFirmatoIl: true } });
  if (!a || a.deletedAt) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  if (!a.mandatoFirmatoIl) return NextResponse.json({ error: "L'area si apre dopo la firma del mandato" }, { status: 409 });
  return NextResponse.json({ link: await linkArea(baseUrl(request), a.email, a.lingua, DURATA_LINK_EMAIL), giorni: DURATA_LINK_EMAIL / 86_400 });
}

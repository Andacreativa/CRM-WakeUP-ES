import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEAD_INCLUDE } from "@/lib/lead";

// Collega (o scollega con clienteId null) il lead a un cliente esistente.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { clienteId?: number | null };
  const clienteId = body.clienteId ? Number(body.clienteId) : null;
  if (clienteId) {
    const c = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!c) return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
  }
  const lead = await prisma.lead.update({
    where: { id: parseInt(id, 10) },
    data: { clienteId },
    include: LEAD_INCLUDE,
  });
  return NextResponse.json(lead);
}

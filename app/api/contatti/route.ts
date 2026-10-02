import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  cliente: { select: { id: true, nome: true } },
  lead: { select: { id: true, codice: true, nome: true, azienda: true } },
};

// Referenti: ?clienteId= ?leadId= ?q=
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clienteId = parseInt(searchParams.get("clienteId") || "0", 10);
    const leadId = parseInt(searchParams.get("leadId") || "0", 10);
    const q = (searchParams.get("q") || "").trim();
    const contatti = await prisma.contatto.findMany({
      where: {
        ...(clienteId > 0 ? { clienteId } : {}),
        ...(leadId > 0 ? { leadId } : {}),
        ...(q
          ? {
              OR: [
                { nome: { contains: q, mode: "insensitive" } },
                { cognome: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { cliente: { nome: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: INCLUDE,
      orderBy: [{ principale: "desc" }, { nome: "asc" }],
    });
    return NextResponse.json(contatti);
  } catch (e) {
    console.error("[GET /api/contatti]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.nome?.trim()) {
      return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
    }
    const clienteId = body.clienteId ? parseInt(body.clienteId, 10) : null;
    const leadId = body.leadId ? parseInt(body.leadId, 10) : null;
    const principale = Boolean(body.principale);
    const contatto = await prisma.$transaction(async (tx) => {
      if (principale && clienteId) {
        await tx.contatto.updateMany({ where: { clienteId }, data: { principale: false } });
      }
      return tx.contatto.create({
        data: {
          nome: body.nome.trim(),
          cognome: body.cognome?.trim() || null,
          ruolo: body.ruolo?.trim() || null,
          email: body.email?.trim() || null,
          telefono: body.telefono?.trim() || null,
          note: body.note?.trim() || null,
          clienteId,
          leadId,
          principale,
          status: clienteId ? "acquisito" : "lead",
        },
        include: INCLUDE,
      });
    });
    return NextResponse.json(contatto);
  } catch (e) {
    console.error("[POST /api/contatti]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

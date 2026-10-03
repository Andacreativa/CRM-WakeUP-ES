import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };
const INCLUDE = {
  cliente: { select: { id: true, nome: true } },
  lead: { select: { id: true, codice: true, nome: true, azienda: true } },
};

// Scheda del contatto: dati e a chi è collegato
export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const contatto = await prisma.contatto.findUnique({
    where: { id: parseInt(id, 10) || 0 },
    include: {
      cliente: { select: { id: true, nome: true, paese: true, citta: true, email: true, telefono: true } },
      lead: { select: { id: true, codice: true, nome: true, azienda: true, stato: true } },
    },
  });
  if (!contatto) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json(contatto);
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const contattoId = parseInt(id, 10);
    const body = await request.json();
    const clienteId =
      body.clienteId !== undefined
        ? body.clienteId
          ? parseInt(body.clienteId, 10)
          : null
        : undefined;
    const contatto = await prisma.$transaction(async (tx) => {
      if (body.principale) {
        const current = await tx.contatto.findUnique({ where: { id: contattoId } });
        const cid = clienteId !== undefined ? clienteId : current?.clienteId;
        if (cid) {
          await tx.contatto.updateMany({
            where: { clienteId: cid, id: { not: contattoId } },
            data: { principale: false },
          });
        }
      }
      return tx.contatto.update({
        where: { id: contattoId },
        data: {
          ...(body.nome !== undefined && { nome: String(body.nome).trim() }),
          ...(body.cognome !== undefined && { cognome: body.cognome?.trim() || null }),
          ...(body.ruolo !== undefined && { ruolo: body.ruolo?.trim() || null }),
          ...(body.email !== undefined && { email: body.email?.trim() || null }),
          ...(body.telefono !== undefined && { telefono: body.telefono?.trim() || null }),
          ...(body.note !== undefined && { note: body.note?.trim() || null }),
          ...(clienteId !== undefined && { clienteId }),
          ...(body.leadId !== undefined && {
            leadId: body.leadId ? parseInt(body.leadId, 10) : null,
          }),
          ...(body.principale !== undefined && { principale: Boolean(body.principale) }),
        },
        include: INCLUDE,
      });
    });
    return NextResponse.json(contatto);
  } catch (e) {
    console.error("[PATCH /api/contatti/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await prisma.contatto.delete({ where: { id: parseInt(id, 10) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/contatti/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

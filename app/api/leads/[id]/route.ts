import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEAD_INCLUDE, isStatoLead } from "@/lib/lead";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      ...LEAD_INCLUDE,
      attivita: { orderBy: { data: "desc" } },
      contatti: { orderBy: [{ principale: "desc" }, { nome: "asc" }] },
      appunti: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await request.json();
    const lead = await prisma.lead.update({
      where: { id: parseInt(id, 10) },
      data: {
        ...(body.nome !== undefined && { nome: String(body.nome).trim() }),
        ...(body.azienda !== undefined && { azienda: body.azienda?.trim() || null }),
        ...(body.email !== undefined && { email: body.email?.trim() || null }),
        ...(body.telefono !== undefined && { telefono: body.telefono?.trim() || null }),
        ...(body.valore !== undefined && { valore: body.valore ? Number(body.valore) : null }),
        ...(body.stato !== undefined && isStatoLead(body.stato) && {
          stato: body.stato,
          stage: body.stato === "vinta" ? "vinto" : body.stato === "persa" ? "perso" : "nuovo",
        }),
        ...(body.fonte !== undefined && { fonte: body.fonte || null }),
        ...(body.fonteDettaglio !== undefined && { fonteDettaglio: body.fonteDettaglio?.trim() || null }),
        ...(body.responsabile !== undefined && { responsabile: body.responsabile?.trim() || null }),
        ...(body.qualifica !== undefined && { qualifica: body.qualifica }),
        ...(body.priorita !== undefined && { priorita: body.priorita }),
        ...(body.paese !== undefined && { paese: body.paese?.trim() || null }),
        ...(body.citta !== undefined && { citta: body.citta?.trim() || null }),
        ...(body.partitaIva !== undefined && { partitaIva: body.partitaIva?.trim() || null }),
        ...(body.sitoWeb !== undefined && { sitoWeb: body.sitoWeb?.trim() || null }),
        ...(body.settore !== undefined && { settore: body.settore?.trim() || null }),
        ...(body.prossimaAzione !== undefined && { prossimaAzione: body.prossimaAzione?.trim() || null }),
        ...(body.prossimaAzioneData !== undefined && {
          prossimaAzioneData: body.prossimaAzioneData ? new Date(body.prossimaAzioneData) : null,
        }),
        ...(body.note !== undefined && { note: body.note?.trim() || null }),
      },
      include: LEAD_INCLUDE,
    });
    return NextResponse.json(lead);
  } catch (e) {
    console.error("[PATCH /api/leads/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await prisma.lead.delete({ where: { id: parseInt(id, 10) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/leads/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

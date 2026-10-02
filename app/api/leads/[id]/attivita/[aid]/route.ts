import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// PATCH { completata } — completando l'azione in sospeso si pulisce anche
// la prossima azione del lead se coincide.
export async function PATCH(request: Request, { params }: Ctx) {
  const { id, aid } = await params;
  const leadId = parseInt(id, 10);
  const body = await request.json();
  const a = await prisma.attivitaLead.update({
    where: { id: parseInt(aid, 10) },
    data: { ...(body.completata !== undefined && { completata: Boolean(body.completata) }) },
  });
  if (body.completata) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (lead && lead.prossimaAzione === a.prossimaAzione) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { prossimaAzione: null, prossimaAzioneData: null },
      });
    }
  }
  return NextResponse.json(a);
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { aid } = await params;
  await prisma.attivitaLead.delete({ where: { id: parseInt(aid, 10) } });
  return NextResponse.json({ ok: true });
}

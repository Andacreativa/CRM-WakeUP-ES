import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEAD_INCLUDE } from "@/lib/lead";

// Converte il lead in cliente: crea il Cliente (o riusa quello collegato),
// sposta i referenti sul cliente e segna il lead come vinto/convertito.
// Rieseguibile: un lead già convertito restituisce il cliente esistente.
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id, 10);
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ error: "Lead non trovato" }, { status: 404 });

    const result = await prisma.$transaction(async (tx) => {
      let clienteId = lead.clienteId;
      if (!clienteId) {
        const nome = (lead.azienda || lead.nome).trim();
        const esistente = await tx.cliente.findFirst({
          where: { nome: { equals: nome, mode: "insensitive" } },
        });
        const cliente =
          esistente ??
          (await tx.cliente.create({
            data: {
              nome,
              paese: lead.paese || "Italia",
              email: lead.email,
              telefono: lead.telefono,
              partitaIva: lead.partitaIva,
              citta: lead.citta,
              note: lead.note ? `Da lead ${lead.codice ?? lead.id}: ${lead.note}` : null,
            },
          }));
        clienteId = cliente.id;
      }
      // Referenti del lead → referenti del cliente
      await tx.contatto.updateMany({
        where: { leadId, clienteId: null },
        data: { clienteId, status: "acquisito" },
      });
      // Se il cliente non ha un referente principale, lo diventa il primo
      const nRef = await tx.contatto.count({ where: { clienteId } });
      const nPrincipali = await tx.contatto.count({ where: { clienteId, principale: true } });
      if (nRef > 0 && nPrincipali === 0) {
        const primo = await tx.contatto.findFirst({ where: { clienteId }, orderBy: { id: "asc" } });
        if (primo) await tx.contatto.update({ where: { id: primo.id }, data: { principale: true } });
      }
      if (nRef === 0 && lead.azienda && lead.nome && lead.nome !== lead.azienda) {
        await tx.contatto.create({
          data: {
            nome: lead.nome,
            email: lead.email,
            telefono: lead.telefono,
            clienteId,
            leadId,
            principale: true,
            status: "acquisito",
          },
        });
      }
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: {
          clienteId,
          convertitoIl: lead.convertitoIl ?? new Date(),
          ...(lead.stato !== "persa" ? { stato: "vinta", stage: "vinto" } : {}),
        },
        include: LEAD_INCLUDE,
      });
      const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
      return { lead: updated, cliente };
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[POST /api/leads/[id]/converti]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

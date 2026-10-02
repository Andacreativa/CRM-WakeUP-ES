import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TIPI = ["chiamata", "email", "riunione", "whatsapp", "nota", "task"];
const ESITI = ["positivo", "neutro", "negativo"];

// Aggiunge un'attività e, se indicata, aggiorna la prossima azione del lead.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const leadId = parseInt(id, 10);
    const body = await request.json();
    const tipo = TIPI.includes(body.tipo) ? body.tipo : "nota";
    const esito = ESITI.includes(body.esito) ? body.esito : null;
    const prossimaAzione = body.prossimaAzione?.trim() || null;
    const prossimaAzioneData = body.prossimaAzioneData ? new Date(body.prossimaAzioneData) : null;
    if (!body.oggetto?.trim() && !body.descrizione?.trim()) {
      return NextResponse.json({ error: "Scrivi almeno un oggetto o una descrizione" }, { status: 400 });
    }
    const row = await prisma.$transaction(async (tx) => {
      const a = await tx.attivitaLead.create({
        data: {
          leadId,
          tipo,
          oggetto: body.oggetto?.trim() || null,
          descrizione: body.descrizione?.trim() || null,
          esito,
          prossimaAzione,
          prossimaAzioneData,
          data: body.data ? new Date(body.data) : new Date(),
        },
      });
      if (prossimaAzione || prossimaAzioneData) {
        await tx.lead.update({
          where: { id: leadId },
          data: { prossimaAzione, prossimaAzioneData },
        });
      }
      // Un lead "nuovo" che riceve un'attività di contatto passa a "contattato"
      if (["chiamata", "email", "riunione", "whatsapp"].includes(tipo)) {
        await tx.lead.updateMany({
          where: { id: leadId, stato: "nuovo" },
          data: { stato: "contattato" },
        });
      }
      return a;
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[POST /api/leads/[id]/attivita]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

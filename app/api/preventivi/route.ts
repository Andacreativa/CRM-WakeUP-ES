import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const preventivi = await prisma.preventivo.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(preventivi);
  } catch (e) {
    console.error("[GET /api/preventivi]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const vociArr: {
      servizio: string;
      descrizione: string;
      quantita: number;
      prezzoUnitario: number;
    }[] = body.voci || [];
    const subtotale = vociArr.reduce(
      (s, v) => s + v.quantita * v.prezzoUnitario,
      0,
    );
    const iva = body.iva ?? 21;
    const totale = subtotale * (1 + iva / 100);

    const feeCommerciale = body.feeCommerciale
      ? Number(body.feeCommerciale)
      : 0;

    const count = await prisma.preventivo.count();
    const anno = new Date().getFullYear();
    const numero = `PRE-${anno}-${String(count + 1).padStart(3, "0")}`;

    // Crea Contatto se non esiste già (cerca per email o nome)
    const existingContatto = await prisma.contatto.findFirst({
      where: body.emailCliente
        ? { email: body.emailCliente }
        : { nome: body.nomeCliente },
    });
    if (!existingContatto) {
      await prisma.contatto.create({
        data: {
          nome: body.nomeCliente,
          email: body.emailCliente || null,
          note: body.aziendaCliente ? `Azienda: ${body.aziendaCliente}` : null,
          status: "acquisito",
        },
      });
    }

    // Crea Lead in pipeline (stage proposta) se non esiste già per questo cliente
    const existingLead = await prisma.lead.findFirst({
      where: {
        OR: [
          body.emailCliente ? { email: body.emailCliente } : {},
          { nome: body.nomeCliente },
        ],
      },
    });

    let leadId: number | null = null;
    if (!existingLead) {
      const newLead = await prisma.lead.create({
        data: {
          nome: body.nomeCliente,
          azienda: body.aziendaCliente || null,
          email: body.emailCliente || null,
          valore: totale,
          stage: "proposta",
          note: `Preventivo ${numero}: ${body.oggetto}`,
        },
      });
      leadId = newLead.id;
    } else {
      await prisma.lead.update({
        where: { id: existingLead.id },
        data: { stage: "proposta", valore: totale },
      });
      leadId = existingLead.id;
    }

    const preventivo = await prisma.preventivo.create({
      data: {
        numero,
        nomeCliente: body.nomeCliente,
        emailCliente: body.emailCliente || null,
        aziendaCliente: body.aziendaCliente || null,
        azienda: body.azienda || "Spagna",
        oggetto: body.oggetto,
        voci: JSON.stringify(vociArr),
        iva,
        subtotale,
        totale,
        feeCommerciale,
        leadId,
        status: body.status || "attesa",
        note: body.note || null,
        condizioni: body.condizioni || null,
        dataScadenza: body.dataScadenza ? new Date(body.dataScadenza) : null,
        lingua: body.lingua || "it",
      },
    });

    return NextResponse.json(preventivo);
  } catch (e) {
    console.error("[POST /api/preventivi]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

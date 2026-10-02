import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nextCodiceLead } from "@/lib/lead";

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

    // Lead collegato: lo trova per email o nome/azienda, altrimenti lo crea.
    // Un preventivo inviato porta il lead a "opportunità" (se ancora aperto).
    const APERTI = ["nuovo", "contattato", "qualificato", "prospect", "opportunita"];
    const existingLead = await prisma.lead.findFirst({
      where: {
        OR: [
          ...(body.emailCliente ? [{ email: body.emailCliente }] : []),
          { nome: body.nomeCliente },
          ...(body.aziendaCliente ? [{ azienda: body.aziendaCliente }] : []),
        ],
      },
    });
    let leadId: number | null = null;
    if (!existingLead) {
      const newLead = await prisma.$transaction(async (tx) => {
        const codice = await nextCodiceLead(tx, new Date().getFullYear());
        return tx.lead.create({
          data: {
            codice,
            nome: body.nomeCliente,
            azienda: body.aziendaCliente || null,
            email: body.emailCliente || null,
            valore: totale,
            stato: "opportunita",
            stage: "proposta",
            fonte: "altro",
            note: `Preventivo ${numero}: ${body.oggetto}`,
          },
        });
      });
      leadId = newLead.id;
    } else {
      await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          valore: totale,
          ...(APERTI.includes(existingLead.stato) ? { stato: "opportunita", stage: "proposta" } : {}),
        },
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

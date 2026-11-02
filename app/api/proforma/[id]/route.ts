import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { leggiDatiProforma } from "@/lib/proforma";

const includi = {
  cliente: true,
  fattura: { select: { id: true, numero: true, stato: true } },
  commercialeRef: { select: { id: true, nome: true, cognome: true, email: true } },
} as const;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.proforma.findUnique({ where: { id: parseInt(id, 10) || 0 }, include: includi });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(p);
}

// Tre cose diverse, una per chiamata:
// - { stato: "annullata" | "aperta" }: annulla o ripristina (non si elimina:
//   resta per spiegare a cosa si riferiva un pagamento arrivato)
// - { inviata, dataInvio }: segnata come inviata (invio via Gmail nel browser)
// - i dati del modulo: solo finché è aperta. Diventata fattura non si tocca,
//   altrimenti il cliente avrebbe un documento diverso da quello fatturato.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proformaId = parseInt(id, 10) || 0;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const p = await prisma.proforma.findUnique({ where: { id: proformaId }, select: { stato: true, numero: true } });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.stato !== undefined) {
    const nuovo = body.stato === "annullata" ? "annullata" : body.stato === "aperta" ? "aperta" : null;
    if (!nuovo) return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    const da = nuovo === "annullata" ? "aperta" : "annullata";
    if (p.stato !== da) {
      return NextResponse.json(
        {
          error:
            p.stato === "convertita"
              ? `La proforma ${p.numero} è già diventata fattura: non si annulla.`
              : `La proforma ${p.numero} è già ${p.stato}.`,
        },
        { status: 409 },
      );
    }
    const agg = await prisma.proforma.update({
      where: { id: proformaId },
      data: { stato: nuovo, annullataIl: nuovo === "annullata" ? new Date() : null },
      include: includi,
    });
    return NextResponse.json(agg);
  }

  if (body.inviata !== undefined) {
    const agg = await prisma.proforma.update({
      where: { id: proformaId },
      data: {
        inviata: !!body.inviata,
        dataInvio: body.inviata ? (body.dataInvio ? new Date(String(body.dataInvio)) : new Date()) : null,
      },
      include: includi,
    });
    return NextResponse.json(agg);
  }

  if (p.stato !== "aperta") {
    return NextResponse.json(
      { error: `La proforma ${p.numero} è ${p.stato}: non si modifica più.` },
      { status: 409 },
    );
  }
  const { errori, dati } = leggiDatiProforma(body);
  if (errori.length) return NextResponse.json({ error: errori[0], errori }, { status: 400 });
  // Il numero resta quello assegnato alla nascita, anche cambiando la data
  const agg = await prisma.proforma.update({ where: { id: proformaId }, data: dati, include: includi });
  return NextResponse.json(agg);
}

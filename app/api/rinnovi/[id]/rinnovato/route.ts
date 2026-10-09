import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RINNOVO_INCLUDE, scadenzaSuccessiva, serializzaRinnovo } from "@/lib/rinnovi";

type Ctx = { params: Promise<{ id: string }> };

// «Rinnovato»: la scadenza avanza di un anno e si apre un ciclo nuovo.
export async function POST(_: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const before = await prisma.rinnovoSito.findUnique({ where: { id: parseInt(id, 10) } });
    if (!before || before.deletedAt) {
      return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    }
    const r = await prisma.rinnovoSito.update({
      where: { id: before.id },
      data: { scadenza: scadenzaSuccessiva(before.scadenza), rinnovatoIl: new Date() },
      include: RINNOVO_INCLUDE,
    });
    return NextResponse.json(serializzaRinnovo(r));
  } catch (e) {
    console.error("[POST /api/rinnovi/[id]/rinnovato]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RICHIESTA_INCLUDE, serializzaRichiesta } from "@/lib/richieste";

// Inverte un flag: validazione | emessa | incassata.
// Emessa e incassata si possono toccare a mano solo senza fattura collegata.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const richiestaId = parseInt(id, 10);
  const { flag } = (await request.json().catch(() => ({}))) as {
    flag?: string;
  };
  const before = await prisma.richiestaFattura.findUnique({
    where: { id: richiestaId },
  });
  if (!before || before.deletedAt) {
    return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  }

  let data: Record<string, unknown>;
  if (flag === "validazione") {
    const ok = before.validazione !== "ok";
    data = { validazione: ok ? "ok" : "in_attesa", validataIl: ok ? new Date() : null };
  } else if (flag === "emessa" || flag === "incassata") {
    if (before.fatturaId) {
      return NextResponse.json(
        { error: "Stato letto dalla fattura collegata: modificalo lì" },
        { status: 409 },
      );
    }
    if (flag === "emessa") {
      const v = !before.emessa;
      data = { emessa: v, emessaIl: v ? new Date() : null, ...(v ? {} : { incassata: false }) };
    } else {
      data = { incassata: !before.incassata };
    }
  } else {
    return NextResponse.json({ error: "Flag non valido" }, { status: 400 });
  }

  const r = await prisma.richiestaFattura.update({
    where: { id: richiestaId },
    data,
    include: RICHIESTA_INCLUDE,
  });
  return NextResponse.json(serializzaRichiesta(r));
}

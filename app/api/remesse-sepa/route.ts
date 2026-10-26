import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Storico delle remesse (senza l'XML: si scarica dalla sua route)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const anno = parseInt(searchParams.get("anno") || "", 10) || 0;
  const rows = await prisma.remessaSepa.findMany({
    where: anno ? { dataAddebito: { gte: new Date(Date.UTC(anno, 0, 1)), lt: new Date(Date.UTC(anno + 1, 0, 1)) } } : {},
    select: {
      id: true, codice: true, msgId: true, dataAddebito: true, numero: true, totale: true, versione: true,
      nomeFile: true, stato: true, inviataIl: true, incassataIl: true, note: true, createdAt: true,
      _count: { select: { addebiti: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json(rows);
}

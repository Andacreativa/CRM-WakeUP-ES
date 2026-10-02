import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Elenco delle importazioni con conteggio movimenti collegati
export async function GET() {
  try {
    const rows = await prisma.importBancario.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { movimenti: true } },
        movimenti: {
          where: { stato: { in: ["abbinato", "spesa_creata"] } },
          select: { id: true },
        },
      },
    });
    return NextResponse.json(
      rows.map(({ movimenti, _count, ...r }) => ({
        ...r,
        movimenti: _count.movimenti,
        collegati: movimenti.length,
      })),
    );
  } catch (e) {
    console.error("[GET /api/banca/importazioni]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { costruisciBoard } from "@/lib/banca-incasso";

// GET ?anno= — dati della board di riconciliazione: clienti con le fatture
// (e quanto è già incassato fuori banca) e bonifici con i collegamenti.
export async function GET(request: Request) {
  try {
    const anno = parseInt(new URL(request.url).searchParams.get("anno") || "0", 10) || 0;
    // Auto-riparazione: movimenti "abbinati" rimasti senza collegamenti tornano da rivedere
    await prisma.movimentoBancario.updateMany({
      where: { stato: { in: ["abbinato", "spesa_creata"] }, abbinamenti: { none: {} } },
      data: { stato: "da_abbinare" },
    });
    return NextResponse.json(await costruisciBoard(prisma, anno));
  } catch (e) {
    console.error("[GET /api/banca/board]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

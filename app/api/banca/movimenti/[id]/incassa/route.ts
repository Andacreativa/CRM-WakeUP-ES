import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ErroreIncasso, incassaMovimento } from "@/lib/banca-incasso";

type Ctx = { params: Promise<{ id: string }> };
const CATEGORIE_ALTRO = new Set(["cashback", "rimborso_tasse", "apporto_socio", "incasso_senza_fattura", "altro"]);

// POST { fatture: [{ id, importo? }], altroIngresso?: { categoria, descrizione? } }
// Incassa un bonifico su una o più fatture (vedi lib/banca-incasso.ts).
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await request.json();
    const fatture = Array.isArray(body.fatture)
      ? body.fatture.map((x: { id: unknown; importo?: unknown }) => ({
          id: parseInt(String(x.id), 10),
          importo: x.importo !== undefined && x.importo !== null ? Number(x.importo) : undefined,
        }))
      : [];
    const altroIngresso =
      body.altroIngresso && CATEGORIE_ALTRO.has(String(body.altroIngresso.categoria))
        ? { categoria: String(body.altroIngresso.categoria), descrizione: String(body.altroIngresso.descrizione ?? "") }
        : null;
    const mov = await incassaMovimento(prisma, parseInt(id, 10), { fatture, altroIngresso });
    return NextResponse.json({ ...mov, suggerimento: null, entrata: null });
  } catch (e) {
    if (e instanceof ErroreIncasso) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[POST /api/banca/movimenti/id/incassa]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pulisciPiva } from "@/lib/constants";
import { fornitoreDellaSpesa } from "@/lib/fornitori";

// Scheda fornitore: anagrafica, spese (abbinate per id o per nome, come la
// lista) e fatture caricate (senza il file).
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fornitoreId = parseInt(id, 10) || 0;
  const [fornitore, tutti, spese, fatture] = await Promise.all([
    prisma.fornitore.findUnique({ where: { id: fornitoreId } }),
    prisma.fornitore.findMany({ select: { id: true, nome: true } }),
    prisma.spesa.findMany({
      select: {
        id: true,
        fornitore: true,
        fornitoreId: true,
        categoria: true,
        descrizione: true,
        mese: true,
        anno: true,
        importo: true,
      },
      orderBy: [{ anno: "desc" }, { mese: "desc" }, { id: "desc" }],
    }),
    prisma.fatturaFornitore.findMany({
      where: { fornitoreId },
      select: {
        id: true,
        fileName: true,
        fileMimeType: true,
        fornitoreId: true,
        mese: true,
        anno: true,
        importo: true,
        dataFattura: true,
        createdAt: true,
      },
      orderBy: [{ anno: "desc" }, { mese: "desc" }],
    }),
  ]);
  if (!fornitore) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json({
    ...fornitore,
    spese: spese.filter((s) => fornitoreDellaSpesa(s, tutti)?.id === fornitoreId),
    fatture: fatture.map((f) => ({ ...f, fornitore: { nome: fornitore.nome } })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const fornitore = await prisma.fornitore.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.paese !== undefined && { paese: body.paese }),
        ...(body.email !== undefined && { email: body.email || null }),
        ...(body.telefono !== undefined && { telefono: body.telefono || null }),
        ...(body.partitaIva !== undefined && { partitaIva: pulisciPiva(body.partitaIva) }),
        ...(body.via !== undefined && { via: body.via || null }),
        ...(body.cap !== undefined && { cap: body.cap || null }),
        ...(body.citta !== undefined && { citta: body.citta || null }),
        ...(body.provincia !== undefined && {
          provincia: body.provincia || null,
        }),
        ...(body.note !== undefined && { note: body.note || null }),
      },
    });
    return NextResponse.json(fornitore);
  } catch (e) {
    console.error("[PATCH /api/fornitori/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.fornitore.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/fornitori/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

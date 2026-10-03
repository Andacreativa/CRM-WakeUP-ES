import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Scheda dell'ingresso: dati, fattura collegata, movimento bancario
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await prisma.altroIngresso.findUnique({
    where: { id: parseInt(id, 10) || 0 },
    include: {
      fattura: { select: { id: true, numero: true, cliente: { select: { nome: true } } } },
      abbinamentiBancari: {
        select: {
          importo: true,
          movimento: {
            select: { id: true, dataContabile: true, concetto: true, beneficiario: true, osservazioni: true, importo: true },
          },
        },
      },
    },
  });
  if (!row) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const row = await prisma.altroIngresso.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.fonte !== undefined && { fonte: body.fonte }),
        ...(body.categoria !== undefined && { categoria: body.categoria || "altro" }),
        ...(body.azienda !== undefined && { azienda: body.azienda }),
        ...(body.aziendaNota !== undefined && {
          aziendaNota: body.aziendaNota || null,
        }),
        ...(body.descrizione !== undefined && {
          descrizione: body.descrizione || null,
        }),
        ...(body.mese !== undefined && { mese: body.mese }),
        ...(body.anno !== undefined && { anno: body.anno }),
        ...(body.importo !== undefined && {
          importo: parseFloat(body.importo) || 0,
        }),
        ...(body.incassato !== undefined && {
          incassato: Boolean(body.incassato),
        }),
        ...(body.dataIncasso !== undefined && {
          dataIncasso: body.dataIncasso ? new Date(body.dataIncasso) : null,
        }),
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[PATCH /api/altri-ingressi/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // il movimento bancario collegato torna da abbinare
    const movimenti = await prisma.abbinamentoBancario.findMany({
      where: { altroIngressoId: parseInt(id) },
      select: { movimentoId: true },
    });
    await prisma.altroIngresso.delete({ where: { id: parseInt(id) } });
    for (const { movimentoId } of movimenti) {
      const resto = await prisma.abbinamentoBancario.count({ where: { movimentoId } });
      if (!resto) {
        await prisma.movimentoBancario.update({ where: { id: movimentoId }, data: { stato: "da_abbinare" } });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/altri-ingressi/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

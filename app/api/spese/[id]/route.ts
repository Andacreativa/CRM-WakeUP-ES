import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fornitoreDellaSpesa } from "@/lib/fornitori";
import { allineaRegistroSpesa } from "@/lib/registro";

// Scheda della spesa: dati, fornitore in anagrafica, da dove nasce (registro
// pagamenti, fattura) e movimento bancario collegato.
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [spesa, fornitori] = await Promise.all([
    prisma.spesa.findUnique({
      where: { id: parseInt(id, 10) || 0 },
      include: {
        fattura: { select: { id: true, numero: true, cliente: { select: { nome: true } } } },
        pagamentoMensile: {
          select: {
            voce: true,
            anno: true,
            mese: true,
            dipendente: { select: { id: true, nome: true, cognome: true } },
          },
        },
        abbinamentiBancari: {
          select: {
            importo: true,
            movimento: {
              select: { id: true, dataContabile: true, concetto: true, beneficiario: true, osservazioni: true, importo: true },
            },
          },
        },
      },
    }),
    prisma.fornitore.findMany({ select: { id: true, nome: true, paese: true } }),
  ]);
  if (!spesa) return NextResponse.json({ error: "Non trovata" }, { status: 404 });
  return NextResponse.json({ ...spesa, fornitoreAnagrafica: fornitoreDellaSpesa(spesa, fornitori) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const spesa = await prisma.spesa.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.azienda !== undefined && { azienda: body.azienda }),
      ...(body.aziendaNota !== undefined && { aziendaNota: body.aziendaNota }),
      ...(body.fornitore !== undefined && { fornitore: body.fornitore }),
      ...(body.fornitoreId !== undefined && {
        fornitoreId: body.fornitoreId ? Number(body.fornitoreId) : null,
      }),
      ...(body.categoria !== undefined && { categoria: body.categoria }),
      ...(body.descrizione !== undefined && { descrizione: body.descrizione }),
      ...(body.note !== undefined && { note: body.note }),
      ...(body.ricevutaPath !== undefined && {
        ricevutaPath: body.ricevutaPath,
      }),
      ...(body.mese !== undefined && { mese: body.mese }),
      ...(body.anno !== undefined && { anno: body.anno }),
      ...(body.importo !== undefined && { importo: parseFloat(body.importo) }),
    },
  });
  await allineaRegistroSpesa(prisma, spesa.id);
  return NextResponse.json(spesa);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const spesa = await prisma.spesa.findUnique({ where: { id: parseInt(id) } });
  if (spesa?.ricevutaPath) {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "public", spesa.ricevutaPath);
    await fs.unlink(filePath).catch(() => {});
  }
  // I movimenti bancari collegati restano senza abbinamento: tornano da rivedere
  const movimenti = await prisma.abbinamentoBancario.findMany({
    where: { spesaId: parseInt(id) },
    select: { movimentoId: true },
  });
  await prisma.spesa.delete({ where: { id: parseInt(id) } });
  for (const { movimentoId } of movimenti) {
    const resto = await prisma.abbinamentoBancario.count({ where: { movimentoId } });
    if (!resto) {
      await prisma.movimentoBancario.update({ where: { id: movimentoId }, data: { stato: "da_abbinare" } });
    }
  }
  return NextResponse.json({ ok: true });
}

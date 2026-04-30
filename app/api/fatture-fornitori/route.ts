import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const annoParam = searchParams.get("anno");
    const meseParam = searchParams.get("mese");
    const where: { anno?: number; mese?: number } = {};
    if (annoParam) where.anno = parseInt(annoParam, 10);
    if (meseParam) where.mese = parseInt(meseParam, 10);

    const fatture = await prisma.fatturaFornitore.findMany({
      where,
      include: { fornitore: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(fatture);
  } catch (e) {
    console.error("[GET /api/fatture-fornitori]", e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.fileName || !body.filePath || !body.fornitoreId || !body.mese) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti" },
        { status: 400 },
      );
    }
    const fattura = await prisma.fatturaFornitore.create({
      data: {
        fileName: body.fileName,
        filePath: body.filePath,
        fornitoreId: parseInt(body.fornitoreId, 10),
        mese: parseInt(body.mese, 10),
        anno: parseInt(body.anno, 10) || new Date().getFullYear(),
        importo: parseFloat(body.importo) || 0,
      },
      include: { fornitore: true },
    });
    return NextResponse.json(fattura);
  } catch (e) {
    console.error("[POST /api/fatture-fornitori]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

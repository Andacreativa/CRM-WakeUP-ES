import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const annoParam = searchParams.get("anno");
    const anno = annoParam ? parseInt(annoParam) : null;
    const azienda = searchParams.get("azienda") || undefined;

    const fatture = await prisma.fattura.findMany({
      where: {
        contrattoId: { not: null },
        ...(anno && anno > 0 ? { anno } : {}),
        ...(azienda ? { azienda } : {}),
      },
      include: {
        cliente: true,
        contratto: true,
        acconti: { orderBy: { data: "desc" } },
      },
      orderBy: [
        { anno: "desc" },
        { data: "desc" },
        { mese: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(fatture);
  } catch (e) {
    console.error("[GET /api/contratti/fatture]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

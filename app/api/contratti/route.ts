import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nextContrattoNumero } from "@/lib/contratto-numero";

export async function GET() {
  try {
    const contratti = await prisma.contratto.findMany({
      include: { cliente: true, preventivo: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(contratti);
  } catch (e) {
    console.error("[GET /api/contratti]", e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = body.dataDecorrenza
      ? new Date(body.dataDecorrenza)
      : new Date();
    const numero =
      body.numero || (await nextContrattoNumero(data.getFullYear()));
    const importoMensile = parseFloat(body.importoMensile);
    const numeroRate = parseInt(body.numeroRate, 10) || 6;

    // Una tantum: somma di (quantita × prezzoUnitario) per le voci con tipo "una_tantum"
    let unaTantum = 0;
    try {
      const voci: Array<{
        quantita?: number;
        prezzoUnitario?: number;
        tipo?: string;
      }> = JSON.parse(body.voci || "[]");
      unaTantum = voci
        .filter((v) => v.tipo === "una_tantum")
        .reduce(
          (s, v) =>
            s + (Number(v.quantita) || 1) * (Number(v.prezzoUnitario) || 0),
          0,
        );
    } catch {}

    const contratto = await prisma.contratto.create({
      data: {
        numero,
        preventivoId: body.preventivoId ?? null,
        clienteId: body.clienteId ?? null,
        nomeClienteFallback: body.nomeClienteFallback || null,
        rappresentanteLegale: body.rappresentanteLegale || "",
        dataDecorrenza: data,
        durataMesi: parseInt(body.durataMesi, 10) || 6,
        importoMensile,
        numeroRate,
        totaleContratto: importoMensile * numeroRate + unaTantum,
        oggetto: body.oggetto || "",
        voci: body.voci || "[]",
        lingua: body.lingua || "it",
        status: body.status || "bozza",
        note: body.note || null,
      },
      include: { cliente: true, preventivo: true },
    });
    return NextResponse.json(contratto);
  } catch (e) {
    console.error("[POST /api/contratti]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

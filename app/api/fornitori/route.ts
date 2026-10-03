import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { paeseDaPiva, pulisciPiva } from "@/lib/constants";

export async function GET() {
  try {
    const fornitori = await prisma.fornitore.findMany({
      orderBy: { nome: "asc" },
    });
    return NextResponse.json(fornitori);
  } catch (e) {
    console.error("[GET /api/fornitori]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!String(body.nome ?? "").trim()) {
      return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
    }
    const fornitore = await prisma.fornitore.create({
      data: {
        nome: String(body.nome ?? "").trim(),
        // senza paese (es. fornitore creato dalla fattura caricata) lo si
        // ricava dalla P.IVA/NIF
        paese: body.paese || paeseDaPiva(body.partitaIva) || "Spagna",
        email: body.email || null,
        telefono: body.telefono || null,
        partitaIva: pulisciPiva(body.partitaIva),
        via: body.via || null,
        cap: body.cap || null,
        citta: body.citta || null,
        provincia: body.provincia || null,
        note: body.note || null,
      },
    });
    return NextResponse.json(fornitore);
  } catch (e) {
    console.error("[POST /api/fornitori]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

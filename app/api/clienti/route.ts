import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pulisciPiva } from "@/lib/constants";

export async function GET(request: Request) {
  // ?min=1: solo i campi per tendine e controllo doppioni
  if (new URL(request.url).searchParams.get("min")) {
    const min = await prisma.cliente.findMany({
      select: { id: true, nome: true, paese: true, partitaIva: true, email: true, smh: true },
      orderBy: { nome: "asc" },
    });
    return NextResponse.json(min);
  }
  const clienti = await prisma.cliente.findMany({
    include: {
      fatture: {
        where: { origine: { not: "sales" }, annullata: false, stato: "emessa" },
        select: {
          importo: true,
          pagato: true,
          anno: true,
          mese: true,
          data: true,
          acconti: { select: { importo: true } },
        },
      },
      _count: { select: { contatti: true, contratti: true } },
    },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(clienti);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
  }
  const cliente = await prisma.cliente.create({
    data: {
      nome: body.nome.trim(),
      paese: body.paese || "Italia",
      email: body.email || null,
      telefono: body.telefono || null,
      partitaIva: pulisciPiva(body.partitaIva),
      smh: body.smh === true,
      via: body.via || null,
      cap: body.cap || null,
      citta: body.citta || null,
      provincia: body.provincia || null,
      iban: body.iban || null,
      tipoImposta: body.tipoImposta || "IGIC Exenta",
      note: body.note || null,
    },
  });
  return NextResponse.json(cliente);
}

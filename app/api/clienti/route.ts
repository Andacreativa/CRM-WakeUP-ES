import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncClienteToContatto } from "@/lib/cliente-contatto-sync";

export async function GET() {
  const clienti = await prisma.cliente.findMany({
    include: { fatture: true },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(clienti);
}

export async function POST(request: Request) {
  const body = await request.json();
  const cliente = await prisma.cliente.create({
    data: {
      nome: body.nome,
      paese: body.paese || "Italia",
      email: body.email || null,
      telefono: body.telefono || null,
      partitaIva: body.partitaIva || null,
      via: body.via || null,
      cap: body.cap || null,
      citta: body.citta || null,
      provincia: body.provincia || null,
      iban: body.iban || null,
      tipoImposta: body.tipoImposta || "IGIC Exenta",
      note: body.note || null,
    },
  });
  try {
    await syncClienteToContatto(prisma, cliente);
  } catch (e) {
    console.error("[POST /api/clienti] sync contatto:", e);
  }
  return NextResponse.json(cliente);
}

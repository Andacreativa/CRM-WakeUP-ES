import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pulisciPiva } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

// Scheda cliente: anagrafica, fatture, richieste, contratti, referenti, lead.
export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const cliente = await prisma.cliente.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      fatture: {
        where: { origine: { not: "sales" }, annullata: false, stato: "emessa" },
        orderBy: [{ anno: "desc" }, { mese: "desc" }, { id: "desc" }],
        select: {
          id: true,
          numero: true,
          data: true,
          mese: true,
          anno: true,
          importo: true,
          iva: true,
          pagato: true,
          scadenza: true,
          acconti: { select: { importo: true } },
        },
      },
      richiesteFattura: {
        where: { deletedAt: null },
        orderBy: [{ anno: "desc" }, { mese: "desc" }],
        select: {
          id: true,
          codice: true,
          descrizione: true,
          totale: true,
          mese: true,
          anno: true,
          validazione: true,
          emessa: true,
          fatturaId: true,
        },
      },
      contratti: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          numero: true,
          oggetto: true,
          status: true,
          importoMensile: true,
          numeroRate: true,
          totaleContratto: true,
          dataDecorrenza: true,
        },
      },
      contatti: { orderBy: [{ principale: "desc" }, { nome: "asc" }] },
      leads: {
        orderBy: { createdAt: "desc" },
        select: { id: true, codice: true, nome: true, azienda: true, stato: true, convertitoIl: true },
      },
    },
  });
  if (!cliente) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json(cliente);
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await request.json();
  const cliente = await prisma.cliente.update({
    where: { id: parseInt(id, 10) },
    data: {
      ...(body.nome !== undefined && { nome: body.nome }),
      ...(body.paese !== undefined && { paese: body.paese }),
      ...(body.email !== undefined && { email: body.email || null }),
      ...(body.telefono !== undefined && { telefono: body.telefono || null }),
      ...(body.partitaIva !== undefined && { partitaIva: pulisciPiva(body.partitaIva) }),
      ...(body.smh !== undefined && { smh: body.smh === true }),
      ...(body.via !== undefined && { via: body.via || null }),
      ...(body.cap !== undefined && { cap: body.cap || null }),
      ...(body.citta !== undefined && { citta: body.citta || null }),
      ...(body.provincia !== undefined && { provincia: body.provincia || null }),
      ...(body.iban !== undefined && { iban: body.iban || null }),
      ...(body.tipoImposta !== undefined && {
        tipoImposta: body.tipoImposta || "IGIC Exenta",
      }),
      ...(body.note !== undefined && { note: body.note || null }),
    },
  });
  return NextResponse.json(cliente);
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.cliente.delete({ where: { id: parseInt(id, 10) } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const dipendente = await prisma.dipendente.update({
      where: { id: parseInt(id) },
      data: {
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.cognome !== undefined && { cognome: body.cognome || null }),
        ...(body.ruolo !== undefined && { ruolo: body.ruolo || null }),
        ...(body.dataNascita !== undefined && {
          dataNascita: body.dataNascita ? new Date(body.dataNascita) : null,
        }),
        ...(body.dni !== undefined && { dni: body.dni || null }),
        ...(body.nie !== undefined && { nie: body.nie || null }),
        ...(body.numSS !== undefined && { numSS: body.numSS || null }),
        ...(body.via !== undefined && { via: body.via || null }),
        ...(body.cap !== undefined && { cap: body.cap || null }),
        ...(body.citta !== undefined && { citta: body.citta || null }),
        ...(body.provincia !== undefined && {
          provincia: body.provincia || null,
        }),
        ...(body.paese !== undefined && { paese: body.paese || null }),
        ...(body.telefono !== undefined && { telefono: body.telefono || null }),
        ...(body.email !== undefined && { email: body.email || null }),
        ...(body.iban !== undefined && { iban: body.iban || null }),
        ...(body.fotoPath !== undefined && {
          fotoPath: body.fotoPath || null,
        }),
        ...(body.nettoBustaPaga !== undefined && {
          nettoBustaPaga: parseFloat(body.nettoBustaPaga) || 0,
        }),
        ...(body.irpf !== undefined && { irpf: parseFloat(body.irpf) || 0 }),
        ...(body.irpfImporto !== undefined && {
          irpfImporto: parseFloat(body.irpfImporto) || 0,
        }),
        ...(body.seguridadSocial !== undefined && {
          seguridadSocial: parseFloat(body.seguridadSocial) || 0,
        }),
        ...(body.tipo !== undefined && {
          tipo: ["dipendente", "socio_dipendente", "commerciale"].includes(body.tipo)
            ? body.tipo
            : "dipendente",
        }),
        ...(body.percentualeCommissione !== undefined && {
          percentualeCommissione: parseFloat(body.percentualeCommissione) || 0,
        }),
        ...(body.rimborsiMensili !== undefined && {
          rimborsiMensili: parseFloat(body.rimborsiMensili) || 0,
        }),
        ...(body.benefitMensili !== undefined && {
          benefitMensili: parseFloat(body.benefitMensili) || 0,
        }),
        ...(body.attivo !== undefined && { attivo: Boolean(body.attivo) }),
      },
    });
    return NextResponse.json(dipendente);
  } catch (e) {
    console.error("[PATCH /api/dipendenti/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // Cancella anche le spese collegate ai pagamenti (vecchio e nuovo registro)
    const dipendenteId = parseInt(id);
    const [vecchi, nuovi] = await Promise.all([
      prisma.pagamentoDipendente.findMany({ where: { dipendenteId } }),
      prisma.pagamentoMensile.findMany({ where: { dipendenteId } }),
    ]);
    const spesaIds = [...vecchi, ...nuovi]
      .map((p) => p.spesaId)
      .filter((x): x is number => x !== null);
    if (spesaIds.length) {
      await prisma.spesa.deleteMany({ where: { id: { in: spesaIds } } });
    }
    await prisma.dipendente.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/dipendenti/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pulisciPiva } from "@/lib/constants";
import { LEAD_INCLUDE, STATI_APERTI, isStatoLead, nextCodiceLead } from "@/lib/lead";

// ?stato= ?q= ?fonte= ?responsabile= ?aperti=1
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const stato = searchParams.get("stato") || "";
    const fonte = searchParams.get("fonte") || "";
    const responsabile = searchParams.get("responsabile") || "";
    const aperti = searchParams.get("aperti") === "1";
    const q = (searchParams.get("q") || "").trim();
    const where: Prisma.LeadWhereInput = {
      ...(stato ? { stato } : {}),
      ...(aperti ? { stato: { in: STATI_APERTI } } : {}),
      ...(fonte ? { fonte } : {}),
      ...(responsabile ? { responsabile } : {}),
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              { azienda: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { citta: { contains: q, mode: "insensitive" } },
              { codice: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const leads = await prisma.lead.findMany({
      where,
      include: {
        ...LEAD_INCLUDE,
        attivita: {
          where: { completata: false, prossimaAzioneData: { not: null } },
          orderBy: { prossimaAzioneData: "asc" },
          take: 1,
          select: { id: true, prossimaAzione: true, prossimaAzioneData: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(leads);
  } catch (e) {
    console.error("[GET /api/leads]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nome = String(body.nome ?? body.azienda ?? "").trim();
    if (!nome) {
      return NextResponse.json({ error: "Nome o azienda obbligatori" }, { status: 400 });
    }
    const stato = isStatoLead(body.stato) ? body.stato : "nuovo";
    const lead = await prisma.$transaction(async (tx) => {
      const codice = await nextCodiceLead(tx, new Date().getFullYear());
      return tx.lead.create({
        data: {
          codice,
          nome,
          azienda: body.azienda?.trim() || null,
          email: body.email?.trim() || null,
          telefono: body.telefono?.trim() || null,
          valore: body.valore ? Number(body.valore) : null,
          stato,
          stage: stato === "vinta" ? "vinto" : stato === "persa" ? "perso" : "nuovo",
          fonte: body.fonte || null,
          fonteDettaglio: body.fonteDettaglio?.trim() || null,
          responsabile: body.responsabile?.trim() || null,
          qualifica: ["fredda", "tiepida", "calda"].includes(body.qualifica) ? body.qualifica : "fredda",
          priorita: ["bassa", "media", "alta"].includes(body.priorita) ? body.priorita : "media",
          paese: body.paese?.trim() || null,
          citta: body.citta?.trim() || null,
          partitaIva: pulisciPiva(body.partitaIva),
          sitoWeb: body.sitoWeb?.trim() || null,
          settore: body.settore?.trim() || null,
          prossimaAzione: body.prossimaAzione?.trim() || null,
          prossimaAzioneData: body.prossimaAzioneData ? new Date(body.prossimaAzioneData) : null,
          clienteId: body.clienteId ? parseInt(body.clienteId, 10) : null,
          note: body.note?.trim() || null,
        },
        include: LEAD_INCLUDE,
      });
    });
    return NextResponse.json(lead);
  } catch (e) {
    console.error("[POST /api/leads]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

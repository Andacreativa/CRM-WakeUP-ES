import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };
const CANALI = ["email", "telefono", "whatsapp", "altro"];

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const rows = await prisma.sollecito.findMany({
    where: { fatturaId: parseInt(id, 10) },
    orderBy: { data: "desc" },
  });
  return NextResponse.json(rows);
}

// Registra un sollecito (l'email la manda il programma di posta dell'utente,
// come in Northstar: qui resta solo la traccia).
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const fatturaId = parseInt(id, 10);
  const body = (await request.json().catch(() => ({}))) as {
    canale?: string;
    nota?: string;
  };
  const fattura = await prisma.fattura.findUnique({ where: { id: fatturaId } });
  if (!fattura) return NextResponse.json({ error: "Fattura non trovata" }, { status: 404 });
  const canale = CANALI.includes(body.canale ?? "") ? body.canale! : "email";
  const row = await prisma.sollecito.create({
    data: { fatturaId, canale, nota: body.nota?.trim().slice(0, 500) || null },
  });
  const totale = await prisma.sollecito.count({ where: { fatturaId } });
  return NextResponse.json({ ...row, totale });
}

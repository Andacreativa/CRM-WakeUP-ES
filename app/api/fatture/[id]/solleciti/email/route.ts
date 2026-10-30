import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpostazioniFatture } from "@/lib/impostazioni";
import { messaggioSollecito } from "@/lib/fattura-pdf";
import { residuo } from "@/lib/fatture";
import { inviaMail, mailConfigurata } from "@/lib/mail";

export const runtime = "nodejs";

// Manda il sollecito dalla casella aziendale e ne lascia la traccia, solo se
// l'invio riesce.
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!mailConfigurata()) {
    return NextResponse.json({ error: "Posta non configurata" }, { status: 501 });
  }
  const { id } = await params;
  const fattura = await prisma.fattura.findUnique({
    where: { id: parseInt(id, 10) || 0 },
    include: { cliente: true, acconti: true },
  });
  if (!fattura) return NextResponse.json({ error: "Fattura non trovata" }, { status: 404 });
  if (fattura.pagato || fattura.annullata || residuo(fattura, true) <= 0) {
    return NextResponse.json({ error: "La fattura non ha nulla da saldare" }, { status: 400 });
  }
  const cfg = await getImpostazioniFatture(prisma);
  const msg = messaggioSollecito(fattura, cfg);
  if (!msg) {
    return NextResponse.json({ error: "Il cliente non ha un indirizzo email" }, { status: 400 });
  }
  try {
    await inviaMail({
      a: msg.a,
      oggetto: msg.oggetto,
      testo: msg.testo,
      html: msg.html,
      nomeMittente: cfg.ragioneSociale,
    });
  } catch (e) {
    console.error("[POST /api/fatture/[id]/solleciti/email]", e);
    return NextResponse.json(
      { error: `Invio non riuscito: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
  await prisma.sollecito.create({ data: { fatturaId: fattura.id, canale: "email" } });
  const totale = await prisma.sollecito.count({ where: { fatturaId: fattura.id } });
  return NextResponse.json({ ok: true, a: msg.a, totale });
}

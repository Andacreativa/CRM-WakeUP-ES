import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpostazioniFatture } from "@/lib/impostazioni";
import { messaggioFattura } from "@/lib/fattura-pdf";
import { inviaMail, mailConfigurata } from "@/lib/mail";

export const runtime = "nodejs";

// Manda la fattura al cliente dalla casella aziendale, con il PDF allegato
// (lo genera il browser e lo passa qui in base64), e la segna come inviata.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!mailConfigurata()) {
    return NextResponse.json({ error: "Posta non configurata" }, { status: 501 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { pdf?: string; filename?: string };
  if (!body.pdf || body.pdf.length > 8_000_000) {
    return NextResponse.json({ error: "PDF mancante o troppo grande" }, { status: 400 });
  }
  const fattura = await prisma.fattura.findUnique({
    where: { id: parseInt(id, 10) || 0 },
    include: { cliente: true },
  });
  if (!fattura) return NextResponse.json({ error: "Fattura non trovata" }, { status: 404 });
  const cfg = await getImpostazioniFatture(prisma);
  const msg = messaggioFattura(fattura, cfg);
  if (!msg) {
    return NextResponse.json({ error: "Il cliente non ha un indirizzo email" }, { status: 400 });
  }
  try {
    await inviaMail({
      a: msg.a,
      oggetto: msg.oggetto,
      testo: msg.testo,
      nomeMittente: cfg.ragioneSociale,
      allegati: [
        {
          filename: (body.filename || `fattura_${fattura.numero ?? fattura.id}.pdf`).replace(/[^\w.-]+/g, "_"),
          content: Buffer.from(body.pdf, "base64"),
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    console.error("[POST /api/fatture/[id]/email]", e);
    return NextResponse.json(
      { error: `Invio non riuscito: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
  const dataInvio = new Date();
  await prisma.fattura.update({
    where: { id: fattura.id },
    data: { inviata: true, dataInvio },
  });
  return NextResponse.json({ ok: true, a: msg.a, dataInvio });
}

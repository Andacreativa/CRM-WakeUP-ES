import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpostazioniFatture } from "@/lib/impostazioni";
import { messaggioProforma } from "@/lib/proforma-pdf";
import { nomeFileProforma } from "@/lib/proforma";
import { inviaMail, mailConfigurata } from "@/lib/mail";

export const runtime = "nodejs";

// Manda la proforma al cliente dalla casella aziendale, con il PDF allegato
// (lo genera il browser e lo passa qui in base64), e la segna come inviata.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!mailConfigurata()) {
    return NextResponse.json({ error: "Posta non configurata" }, { status: 501 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { pdf?: string };
  if (!body.pdf || body.pdf.length > 8_000_000) {
    return NextResponse.json({ error: "PDF mancante o troppo grande" }, { status: 400 });
  }
  const p = await prisma.proforma.findUnique({
    where: { id: parseInt(id, 10) || 0 },
    include: { cliente: true },
  });
  if (!p) return NextResponse.json({ error: "Proforma non trovata" }, { status: 404 });
  if (p.stato === "annullata") {
    return NextResponse.json({ error: "La proforma è annullata" }, { status: 409 });
  }
  const cfg = await getImpostazioniFatture(prisma);
  const msg = messaggioProforma(p, cfg);
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
      allegati: [
        { filename: nomeFileProforma(p), content: Buffer.from(body.pdf, "base64"), contentType: "application/pdf" },
      ],
    });
  } catch (e) {
    console.error("[POST /api/proforma/[id]/email]", e);
    return NextResponse.json(
      { error: `Invio non riuscito: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
  const dataInvio = new Date();
  await prisma.proforma.update({ where: { id: p.id }, data: { inviata: true, dataInvio } });
  return NextResponse.json({ ok: true, a: msg.a, dataInvio });
}

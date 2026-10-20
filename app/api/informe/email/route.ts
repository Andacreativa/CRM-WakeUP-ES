import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compilaTesto, getImpostazioniFatture } from "@/lib/impostazioni";
import { inviaMail, mailConfigurata } from "@/lib/mail";

export const runtime = "nodejs";

// Manda l'informe al commercialista dalla casella aziendale: PDF ed Excel li
// genera il browser e li passa qui in base64, come per l'email della fattura.
export async function POST(request: Request) {
  if (!mailConfigurata()) {
    return NextResponse.json({ error: "Posta non configurata" }, { status: 501 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    periodo?: string;
    nomeFile?: string;
    pdf?: string;
    xlsx?: string;
  };
  if (!body.pdf || !body.xlsx || body.pdf.length + body.xlsx.length > 16_000_000) {
    return NextResponse.json({ error: "Allegati mancanti o troppo grandi" }, { status: 400 });
  }
  const cfg = await getImpostazioniFatture(prisma);
  const a = cfg.commercialistaEmail.trim();
  if (!a) {
    return NextResponse.json(
      { error: "Manca l'email del commercialista: si imposta in Configurazione › Fatturazione › Commercialista" },
      { status: 400 },
    );
  }
  const v = {
    periodo: body.periodo ?? "",
    azienda: cfg.ragioneSociale,
    nombre: cfg.commercialistaNome.trim() || "",
  };
  const nome = (body.nomeFile || "informe").replace(/[^\w.-]+/g, "_");
  try {
    await inviaMail({
      a,
      oggetto: compilaTesto(cfg.informeOggetto, v),
      testo: compilaTesto(cfg.informeTesto, v),
      nomeMittente: cfg.ragioneSociale,
      allegati: [
        { filename: `${nome}.pdf`, content: Buffer.from(body.pdf, "base64"), contentType: "application/pdf" },
        {
          filename: `${nome}.xlsx`,
          content: Buffer.from(body.xlsx, "base64"),
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });
  } catch (e) {
    console.error("[POST /api/informe/email]", e);
    return NextResponse.json(
      { error: `Invio non riuscito: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, a });
}

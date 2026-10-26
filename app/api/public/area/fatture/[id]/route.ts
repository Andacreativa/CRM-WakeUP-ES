import { prisma } from "@/lib/prisma";
import { whereArea } from "@/lib/abbonamenti-area";
import { pdfFatturaServer } from "@/lib/pdf-server";
import { emailArea } from "@/lib/area-token";

export const runtime = "nodejs";

// PDF di una fattura: solo se nasce da un addebito di un abbonamento del
// cliente loggato ed è emessa (niente bozze, niente annullate)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const email = await emailArea(request);
  if (!email) return new Response("Non autorizzato", { status: 401 });
  try {
    const { id } = await params;
    const fatturaId = parseInt(id, 10) || 0;
    const ad = await prisma.addebitoSepa.findFirst({
      where: { fatturaId, abbonamento: whereArea(email), fattura: { stato: "emessa", annullata: false } },
      select: { id: true },
    });
    if (!ad) return new Response("Non trovata", { status: 404 });
    const pdf = await pdfFatturaServer(prisma, fatturaId);
    if (!pdf) return new Response("Non trovata", { status: 404 });
    return new Response(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.nomeFile}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[GET /api/public/area/fatture/[id]]", e);
    return new Response("Errore", { status: 500 });
  }
}

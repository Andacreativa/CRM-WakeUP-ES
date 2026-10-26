import { prisma } from "@/lib/prisma";
import { abbonamentoArea } from "@/lib/abbonamenti-area";
import { ErroreAbbonamento } from "@/lib/abbonamenti";
import { pdfMandato } from "@/lib/abbonamenti-mail";
import { emailArea } from "@/lib/area-token";

export const runtime = "nodejs";

// PDF contratto + mandato dell'abbonamento del cliente loggato
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const email = await emailArea(request);
  if (!email) return new Response("Non autorizzato", { status: 401 });
  try {
    const { id } = await params;
    const a = await abbonamentoArea(prisma, parseInt(id, 10) || 0, email);
    const pdf = await pdfMandato(a);
    return new Response(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.nomeFile}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ErroreAbbonamento) return new Response("Non trovato", { status: e.status });
    console.error("[GET /api/public/area/abbonamenti/[id]/mandato]", e);
    return new Response("Errore", { status: 500 });
  }
}

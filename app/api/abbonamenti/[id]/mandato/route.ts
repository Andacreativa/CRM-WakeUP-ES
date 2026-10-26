import { prisma } from "@/lib/prisma";
import { ABBONAMENTO_INCLUDE } from "@/lib/abbonamenti";
import { pdfMandato } from "@/lib/abbonamenti-mail";

export const runtime = "nodejs";

// PDF contratto + mandato (anche prima della firma: anteprima)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.abbonamento.findUnique({ where: { id: parseInt(id, 10) || 0 }, include: ABBONAMENTO_INCLUDE });
  if (!a || a.deletedAt) return new Response("Non trovato", { status: 404 });
  const pdf = await pdfMandato(a);
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.nomeFile}"`,
      "Cache-Control": "no-store",
    },
  });
}

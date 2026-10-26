import { prisma } from "@/lib/prisma";

// Scarica il fichero XML da caricare in BBVA
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await prisma.remessaSepa.findUnique({ where: { id: parseInt(id, 10) || 0 }, select: { xml: true, nomeFile: true } });
  if (!r) return new Response("Non trovata", { status: 404 });
  return new Response(r.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${r.nomeFile}"`,
      "Cache-Control": "no-store",
    },
  });
}

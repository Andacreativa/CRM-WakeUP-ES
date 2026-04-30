import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const f = await prisma.fatturaFornitore.findUnique({
    where: { id: parseInt(id, 10) },
  });
  if (!f) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Se ha filePath legacy senza fileData, redirect al path
  if (!f.fileData) {
    if (f.filePath) {
      return NextResponse.redirect(
        new URL(f.filePath, "http://localhost").toString().replace("http://localhost", ""),
        302,
      );
    }
    return NextResponse.json({ error: "Nessun file associato" }, { status: 404 });
  }
  const buffer = Buffer.from(f.fileData, "base64");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": f.fileMimeType || "application/octet-stream",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(f.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await prisma.documento.findUnique({
    where: { id: parseInt(id, 10) },
  });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const buffer = Buffer.from(doc.fileData, "base64");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": doc.fileMimeType,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.documento.delete({ where: { id: parseInt(id, 10) } });
  return NextResponse.json({ ok: true });
}

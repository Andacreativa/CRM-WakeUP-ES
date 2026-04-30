import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const fattura = await prisma.fatturaFornitore.findUnique({
    where: { id: parseInt(id, 10) },
  });
  if (fattura?.filePath) {
    try {
      const fullPath = path.join(
        process.cwd(),
        "public",
        fattura.filePath.replace(/^\//, ""),
      );
      await unlink(fullPath);
    } catch (e) {
      console.warn("[DELETE fattura-fornitore] file unlink failed:", e);
    }
  }
  await prisma.fatturaFornitore.delete({
    where: { id: parseInt(id, 10) },
  });
  return NextResponse.json({ ok: true });
}

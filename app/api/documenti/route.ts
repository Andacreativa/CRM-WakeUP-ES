import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab"); // "azienda" | "soci"
    const where =
      tab === "soci"
        ? { socio: { not: null } }
        : tab === "azienda"
          ? { socio: null, categoria: { not: null } }
          : {};
    const docs = await prisma.documento.findMany({
      where,
      orderBy: { dataCaricamento: "desc" },
      omit: { fileData: true },
    });
    return NextResponse.json(docs);
  } catch (e) {
    console.error("[GET /api/documenti]", e);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Atteso multipart/form-data" },
        { status: 400 },
      );
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const nome = (formData.get("nome") as string | null) || null;
    const categoria = (formData.get("categoria") as string | null) || null;
    const socio = (formData.get("socio") as string | null) || null;

    if (!file) {
      return NextResponse.json({ error: "Nessun file" }, { status: 400 });
    }
    if (!nome) {
      return NextResponse.json({ error: "Nome mancante" }, { status: 400 });
    }
    if (!categoria) {
      return NextResponse.json(
        { error: "Categoria mancante" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileData = buffer.toString("base64");

    const doc = await prisma.documento.create({
      data: {
        nome,
        categoria,
        socio,
        fileName: file.name,
        fileData,
        fileMimeType: file.type || "application/octet-stream",
      },
      omit: { fileData: true },
    });
    return NextResponse.json(doc);
  } catch (e) {
    console.error("[POST /api/documenti]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

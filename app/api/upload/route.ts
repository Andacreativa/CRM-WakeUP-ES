import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let stage = "init";
  try {
    stage = "parse-formdata";
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "Nessun file ricevuto", stage },
        { status: 400 },
      );
    }

    console.log(
      `[upload] file="${file.name}" size=${file.size} type="${file.type}"`,
    );

    stage = "encode-base64";
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileData = buffer.toString("base64");

    stage = "db-insert";
    const doc = await prisma.documento.create({
      data: {
        fileName: file.name,
        fileData,
        fileMimeType: file.type || "application/octet-stream",
      },
      select: { id: true, fileName: true, fileMimeType: true },
    });

    const url = `/api/documenti/${doc.id}/file`;
    console.log(`[upload] ✓ DB doc #${doc.id} → ${url}`);
    return NextResponse.json({ path: url, id: doc.id, storage: "db" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[upload] ERRORE stage=${stage}:`, msg);
    return NextResponse.json({ error: msg, stage }, { status: 500 });
  }
}

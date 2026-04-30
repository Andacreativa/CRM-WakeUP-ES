import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const annoParam = searchParams.get("anno");
    const meseParam = searchParams.get("mese");
    const where: { anno?: number; mese?: number } = {};
    if (annoParam) where.anno = parseInt(annoParam, 10);
    if (meseParam) where.mese = parseInt(meseParam, 10);

    const fatture = await prisma.fatturaFornitore.findMany({
      where,
      include: { fornitore: true },
      orderBy: [{ anno: "desc" }, { mese: "desc" }, { createdAt: "desc" }],
    });

    if (fatture.length === 0) {
      return NextResponse.json(
        { error: "Nessuna fattura corrispondente al filtro" },
        { status: 404 },
      );
    }

    const zip = new JSZip();
    const used = new Set<string>();

    for (const f of fatture) {
      if (!f.fileData) continue;

      const meseLabel = `${String(f.mese).padStart(2, "0")}-${MESI[f.mese - 1] ?? f.mese}`;
      const folder = zip.folder(`${f.anno}/${meseLabel}`)!;

      const dot = f.fileName.lastIndexOf(".");
      const base = dot >= 0 ? f.fileName.slice(0, dot) : f.fileName;
      const ext = dot >= 0 ? f.fileName.slice(dot) : "";
      let name = f.fileName;
      let i = 1;
      while (used.has(`${f.anno}/${meseLabel}/${name}`)) {
        name = `${base} (${i})${ext}`;
        i++;
      }
      used.add(`${f.anno}/${meseLabel}/${name}`);

      folder.file(name, Buffer.from(f.fileData, "base64"));
    }

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const today = new Date().toISOString().slice(0, 10);
    const filterLabel = meseParam
      ? `${MESI[parseInt(meseParam, 10) - 1] ?? meseParam}-${annoParam ?? today}`
      : annoParam
        ? `Anno-${annoParam}`
        : "Tutte";
    const zipName = `Fatture-Fornitori-${filterLabel}-${today}.zip`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(zipName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/fatture-fornitori/zip] errore:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

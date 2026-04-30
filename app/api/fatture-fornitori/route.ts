import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  let stage = "init";
  try {
    stage = "parse-url";
    const { searchParams } = new URL(request.url);
    const annoParam = searchParams.get("anno");
    const meseParam = searchParams.get("mese");
    const where: { anno?: number; mese?: number } = {};
    if (annoParam) where.anno = parseInt(annoParam, 10);
    if (meseParam) where.mese = parseInt(meseParam, 10);

    stage = "db-query";
    const fatture = await prisma.fatturaFornitore.findMany({
      where,
      include: { fornitore: true },
      orderBy: [{ anno: "desc" }, { mese: "desc" }, { createdAt: "desc" }],
      omit: { fileData: true },
    });
    return NextResponse.json(fatture);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as { code: unknown }).code
        : null;
    console.error(`[GET /api/fatture-fornitori] stage=${stage} code=${code}:`, msg);
    if (e instanceof Error && e.stack) console.error(e.stack);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  let stage = "init";
  try {
    stage = "read-headers";
    const ct = request.headers.get("content-type") || "";
    console.log(
      `[fatture-fornitori POST] start content-type="${ct}" length=${request.headers.get("content-length") ?? "?"}`,
    );

    if (ct.includes("multipart/form-data")) {
      stage = "parse-formdata";
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const fornitoreId = formData.get("fornitoreId") as string | null;
      const mese = formData.get("mese") as string | null;
      const anno = formData.get("anno") as string | null;
      const importo = formData.get("importo") as string | null;
      const dataFatturaStr = formData.get("dataFattura") as string | null;

      console.log(
        `[fatture-fornitori POST] formData: file=${file ? `"${file.name}" (${file.size} bytes, ${file.type})` : "null"} fornitoreId=${fornitoreId} mese=${mese} anno=${anno} importo=${importo}`,
      );

      if (!file) {
        return NextResponse.json(
          { error: "Nessun file ricevuto", stage },
          { status: 400 },
        );
      }
      if (!fornitoreId) {
        return NextResponse.json(
          { error: "fornitoreId mancante", stage },
          { status: 400 },
        );
      }
      if (!mese) {
        return NextResponse.json(
          { error: "mese mancante", stage },
          { status: 400 },
        );
      }

      stage = "read-bytes";
      const arrayBuf = await file.arrayBuffer();
      console.log(`[fatture-fornitori POST] arrayBuffer ok (${arrayBuf.byteLength} bytes)`);

      stage = "base64-encode";
      const fileData = Buffer.from(arrayBuf).toString("base64");
      console.log(
        `[fatture-fornitori POST] base64 encoded (${fileData.length} chars)`,
      );

      stage = "db-create";
      const fattura = await prisma.fatturaFornitore.create({
        data: {
          fileName: file.name,
          fileData,
          fileMimeType: file.type || "application/octet-stream",
          filePath: null,
          fornitoreId: parseInt(fornitoreId, 10),
          mese: parseInt(mese, 10),
          anno:
            (anno ? parseInt(anno, 10) : null) || new Date().getFullYear(),
          importo: importo ? parseFloat(importo) || 0 : 0,
          dataFattura: dataFatturaStr ? new Date(dataFatturaStr) : null,
        },
        include: { fornitore: true },
        omit: { fileData: true },
      });
      console.log(
        `[fatture-fornitori POST] ✓ DB record #${fattura.id} created`,
      );
      return NextResponse.json(fattura);
    }

    // JSON legacy
    stage = "parse-json";
    const body = await request.json();
    if (!body.fileName || !body.fornitoreId || !body.mese) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti", stage },
        { status: 400 },
      );
    }
    stage = "db-create-json";
    const fattura = await prisma.fatturaFornitore.create({
      data: {
        fileName: body.fileName,
        filePath: body.filePath || null,
        fileData: body.fileData || null,
        fileMimeType: body.fileMimeType || null,
        fornitoreId: parseInt(body.fornitoreId, 10),
        mese: parseInt(body.mese, 10),
        anno: parseInt(body.anno, 10) || new Date().getFullYear(),
        importo: parseFloat(body.importo) || 0,
        dataFattura: body.dataFattura ? new Date(body.dataFattura) : null,
      },
      include: { fornitore: true },
      omit: { fileData: true },
    });
    return NextResponse.json(fattura);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as { code: unknown }).code
        : null;
    const meta =
      e && typeof e === "object" && "meta" in e
        ? (e as { meta: unknown }).meta
        : null;
    console.error(
      `[POST /api/fatture-fornitori] ERRORE stage=${stage} code=${code}:`,
      msg,
    );
    if (meta) console.error(`[POST /api/fatture-fornitori] meta:`, meta);
    if (stack) console.error(stack);
    return NextResponse.json(
      { error: msg, stage, code, meta },
      { status: 500 },
    );
  }
}

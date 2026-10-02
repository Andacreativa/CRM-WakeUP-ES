import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  REGOLE_BANCA_DEFAULT,
  getImpostazioniBanca,
  salvaImpostazioniBanca,
} from "@/lib/banca";

export async function GET() {
  try {
    const imp = await getImpostazioniBanca(prisma);
    return NextResponse.json({ ...imp, regoleDefault: REGOLE_BANCA_DEFAULT });
  } catch (e) {
    console.error("[GET /api/banca/impostazioni]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PUT { regole?, memoria? }
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const imp = await salvaImpostazioniBanca(prisma, {
      ...(body.regole !== undefined && { regole: body.regole }),
      ...(body.memoria !== undefined && { memoria: body.memoria }),
    });
    return NextResponse.json({ ...imp, regoleDefault: REGOLE_BANCA_DEFAULT });
  } catch (e) {
    console.error("[PUT /api/banca/impostazioni]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

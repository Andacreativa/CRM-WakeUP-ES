import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getImpostazioniFatture,
  salvaImpostazioniFatture,
} from "@/lib/impostazioni";

export async function GET() {
  return NextResponse.json(await getImpostazioniFatture(prisma));
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const saved = await salvaImpostazioniFatture(prisma, body ?? {});
    return NextResponse.json(saved);
  } catch (e) {
    console.error("[PUT /api/impostazioni/fatture]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

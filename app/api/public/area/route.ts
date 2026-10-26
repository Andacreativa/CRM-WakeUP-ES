import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { datiArea } from "@/lib/abbonamenti-area";
import { emailArea } from "@/lib/area-token";

export const runtime = "nodejs";

// Area cliente: i dati del cliente loggato (cookie «area»). Il proxy lascia
// passare /api/public/; qui conta solo il token.
export async function GET(request: Request) {
  const email = await emailArea(request);
  if (!email) return NextResponse.json({ error: "accesso" }, { status: 401 });
  try {
    return NextResponse.json(await datiArea(prisma, email), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[GET /api/public/area]", e);
    return NextResponse.json({ error: "errore" }, { status: 500 });
  }
}

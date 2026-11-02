import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prossimoNumeroProforma } from "@/lib/impostazioni";

// ?anno=2026 — il numero che prenderà la prossima proforma (lo assegna il
// salvataggio: qui è solo da mostrare nel modulo)
export async function GET(request: Request) {
  const anno =
    parseInt(new URL(request.url).searchParams.get("anno") || "", 10) || new Date().getFullYear();
  return NextResponse.json({ numero: await prossimoNumeroProforma(prisma, anno), anno });
}

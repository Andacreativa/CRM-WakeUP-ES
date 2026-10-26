import { NextResponse } from "next/server";
import { AREA_COOKIE, COOKIE_AREA_OPTIONS } from "@/lib/area-token";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AREA_COOKIE, "", { ...COOKIE_AREA_OPTIONS, maxAge: 0 });
  return res;
}

import { NextResponse } from "next/server";
import {
  checkCredentials,
  signSession,
  SESSION_COOKIE,
  COOKIE_OPTIONS,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username e password obbligatori" },
      { status: 400 },
    );
  }
  const ok = checkCredentials(username, password);
  if (!ok) {
    return NextResponse.json(
      { error: "Credenziali non valide" },
      { status: 401 },
    );
  }
  const token = await signSession(ok);
  const res = NextResponse.json({ ok: true, username: ok });
  res.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
  return res;
}

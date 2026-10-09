import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  // /login e API auth sempre accessibili; chi è già loggato salta il login
  if (pathname === "/login") {
    if (session) {
      const url = req.nextUrl.clone();
      url.pathname = "/finance";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }
  // I cron di Vercel non hanno la sessione: la route controlla CRON_SECRET
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  if (session) return NextResponse.next();

  // Per richieste API non autenticate → 401 JSON, niente redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pagine HTML → redirect a /login con next= per tornare dopo
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + (search || ""))}`;
  return NextResponse.redirect(url);
}

// Match tutto tranne asset Next/static, immagini in /public, favicon.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|otf|map)$).*)",
  ],
};

import { base64UrlToBytes, bytesToBase64Url, hmac, timingSafeEqual } from "@/lib/auth";

// Area cliente degli abbonamenti (/suscripcion/area): accesso senza
// password con token firmati HMAC (stesso segreto della sessione, prefisso
// diverso: un token dell'area non vale come sessione e viceversa). Niente
// tabelle: il token porta email, scopo e scadenza.
//  - "link": arriva per email (accesso chiesto dal modulo, 60 minuti) o
//    dentro le email delle fatture (7 giorni); /api/public/area/entra lo
//    scambia con il cookie di sessione
//  - "sessione": cookie HTTP-only valido 24 ore

export const AREA_COOKIE = "area";
export const DURATA_LINK_ACCESSO = 60 * 60;
export const DURATA_LINK_EMAIL = 7 * 86_400;
export const DURATA_SESSIONE = 24 * 3600;

export type ScopoArea = "link" | "sessione";
interface PayloadArea {
  e: string;
  s: ScopoArea;
  exp: number; // unix seconds
}

const PREFISSO = "area.";

export async function creaTokenArea(email: string, scopo: ScopoArea, durataSec: number): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET non impostato");
  const payload: PayloadArea = {
    e: email.trim().toLowerCase(),
    s: scopo,
    exp: Math.floor(Date.now() / 1000) + durataSec,
  };
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, PREFISSO + body)}`;
}

export async function leggiTokenArea(token: string | null | undefined, scopo: ScopoArea): Promise<{ email: string } | null> {
  if (!token) return null;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!timingSafeEqual(sig, await hmac(secret, PREFISSO + body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as PayloadArea;
    if (typeof p?.e !== "string" || p.s !== scopo || typeof p.exp !== "number") return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: p.e };
  } catch {
    return null;
  }
}

// Link che entra nell'area: scambia il token con il cookie di sessione
export async function linkArea(base: string, email: string, lingua: string, durataSec = DURATA_LINK_EMAIL) {
  const t = await creaTokenArea(email, "link", durataSec);
  return `${base}/api/public/area/entra?t=${encodeURIComponent(t)}&lang=${encodeURIComponent(lingua)}`;
}

export function cookieArea(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const parte of raw.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === AREA_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

// Email del cliente loggato nell'area, dal cookie; null = non loggato
export async function emailArea(request: Request): Promise<string | null> {
  const t = await leggiTokenArea(cookieArea(request), "sessione");
  return t?.email ?? null;
}

export const COOKIE_AREA_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: DURATA_SESSIONE,
  secure: process.env.NODE_ENV === "production",
};

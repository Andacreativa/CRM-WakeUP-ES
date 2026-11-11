import { NextResponse } from "next/server";
import { verificaCertificato } from "@/lib/verifactu/invio";

// Verifica del certificato dall'ambiente in cui gira l'app: si apre con la
// password? l'AEAT lo accetta? Non invia registri. ?ambiente=prova per
// l'ambiente di prova dell'AEAT; senza, quello vero.
export async function GET(request: Request) {
  const ambiente = new URL(request.url).searchParams.get("ambiente") === "prova" ? "prova" : "produzione";
  return NextResponse.json(await verificaCertificato(ambiente));
}

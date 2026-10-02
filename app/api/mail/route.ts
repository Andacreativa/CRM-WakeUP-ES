import { NextResponse } from "next/server";
import { mailConfigurata, mittenteMail } from "@/lib/mail";

// Dice all'interfaccia se l'invio dalla casella aziendale è acceso.
export async function GET() {
  const configurata = mailConfigurata();
  return NextResponse.json({ configurata, mittente: configurata ? mittenteMail() : null });
}

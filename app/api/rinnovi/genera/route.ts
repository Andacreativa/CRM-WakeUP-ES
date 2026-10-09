import { NextResponse } from "next/server";
import { generaRichiesteInScadenza } from "@/lib/rinnovi";

// Bottone «Genera richieste»: stessa cosa del cron, a mano.
export async function POST() {
  try {
    return NextResponse.json(await generaRichiesteInScadenza());
  } catch (e) {
    console.error("[POST /api/rinnovi/genera]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { regoleRicorrenze } from "@/lib/richieste";

// Regole delle ricorrenze per il modulo delle richieste: passo e tetto delle
// rate di ogni ricorrenza standard e limiti del passo libero («Ogni N mesi»).
// Il tetto si calcola solo qui (lib/richieste.ts): il modulo non lo riscrive.
export async function GET() {
  return NextResponse.json(regoleRicorrenze());
}

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

// Traduce le righe di un documento (descrizioni delle voci di una richiesta
// di fattura, scritte in italiano) nella lingua del PDF. Le fatture emesse
// vanno al commercialista e all'AEAT: devono essere in spagnolo. Il modale
// mostra il risultato e l'utente lo rivede prima di creare la fattura.
const LINGUE: Record<string, string> = { es: "spagnolo (castigliano)", en: "inglese" };

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { testi?: unknown; lingua?: string };
    const lingua = body.lingua === "en" ? "en" : "es";
    const testi = (Array.isArray(body.testi) ? body.testi : []).map((t) => String(t ?? "").trim());
    if (!testi.length) return NextResponse.json({ testi: [] });
    if (testi.length > 50 || testi.some((t) => t.length > 1000)) {
      return NextResponse.json({ error: "Troppe righe o righe troppo lunghe" }, { status: 400 });
    }
    const apiKey = process.env.LEO_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Traduzione non configurata (manca la chiave API)" }, { status: 501 });
    }

    const anthropic = new Anthropic({ apiKey });
    const resp = await anthropic.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { testi: { type: "array", items: { type: "string" } } },
            required: ["testi"],
            additionalProperties: false,
          },
        },
      },
      system: `Traduci in ${LINGUE[lingua]} le descrizioni delle righe di una fattura di un'agenzia di pubblicità spagnola, scritte in italiano. Tono commerciale formale. Lascia invariati numeri, percentuali, importi, nomi propri, marchi, nomi di prodotti e indirizzi web. Una riga già nella lingua richiesta resta com'è. Rispondi con lo stesso numero di righe, nello stesso ordine, senza aggiungere nulla.`,
      messages: [{ role: "user", content: JSON.stringify({ testi }) }],
    });
    if (resp.stop_reason === "refusal") {
      return NextResponse.json({ error: "Traduzione non disponibile per questo testo" }, { status: 502 });
    }
    const testo = resp.content.find((c) => c.type === "text");
    const parsed = JSON.parse(testo?.type === "text" ? testo.text : "{}") as { testi?: unknown };
    const out = Array.isArray(parsed.testi) ? parsed.testi.map((t) => String(t ?? "").trim()) : [];
    if (out.length !== testi.length) {
      return NextResponse.json({ error: "Traduzione incompleta" }, { status: 502 });
    }
    // Una riga tradotta vuota non sostituisce l'originale
    return NextResponse.json({ testi: out.map((t, i) => t || testi[i]) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/traduci-righe]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

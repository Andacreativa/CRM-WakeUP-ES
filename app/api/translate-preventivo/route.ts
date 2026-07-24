import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Voce {
  servizio: string;
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
  tipo?: string;
}

interface Body {
  targetLang: "es" | "en";
  oggetto: string;
  condizioni?: string | null;
  note?: string | null;
  voci: Voce[];
}

const LANG_NAME: Record<string, string> = {
  es: "Spanish (Castilian)",
  en: "English",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const targetLang = body.targetLang;
    if (targetLang !== "es" && targetLang !== "en") {
      return NextResponse.json(
        { error: "targetLang deve essere 'es' o 'en'" },
        { status: 400 },
      );
    }
    const apiKey = process.env.LEO_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "LEO_API_KEY (o ANTHROPIC_API_KEY) non configurata" },
        { status: 500 },
      );
    }

    // Voci sensibili alla traduzione: solo servizio + descrizione
    const vociInput = (body.voci ?? []).map((v, i) => ({
      i,
      servizio: v.servizio || "",
      descrizione: v.descrizione || "",
    }));

    const payload = {
      oggetto: body.oggetto || "",
      condizioni: body.condizioni || "",
      note: body.note || "",
      voci: vociInput,
    };

    const prompt = `Sei un traduttore professionale specializzato in documenti commerciali italiani. Traduci il seguente contenuto in ${LANG_NAME[targetLang]}. Mantieni:
- Toni formali e commerciali coerenti con la lingua target
- Nomi propri, brand, importi, numeri, prezzi immutati
- Struttura, punteggiatura, capoversi e a-capo (newline) del testo originale
- Nessuna aggiunta di commenti, spiegazioni o note

Rispondi SOLO con un JSON valido con esattamente questa struttura:
{
  "oggetto": "...",
  "condizioni": "...",
  "note": "...",
  "voci": [ { "i": 0, "servizio": "...", "descrizione": "..." }, ... ]
}

Se un campo di input è vuoto ("") restituisci "" (stringa vuota). L'array "voci" DEVE avere lo stesso numero di elementi dell'input e mantenere gli stessi indici "i".

Input JSON:
${JSON.stringify(payload, null, 2)}`;

    const anthropic = new Anthropic({ apiKey });
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = resp.content.find((c) => c.type === "text");
    const rawText = textBlock?.type === "text" ? textBlock.text : "";
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: "Risposta non in formato JSON", raw: rawText },
        { status: 500 },
      );
    }
    const parsed = JSON.parse(match[0]) as {
      oggetto: string;
      condizioni: string;
      note: string;
      voci: { i: number; servizio: string; descrizione: string }[];
    };

    // Ricostruisce array voci completo (mantiene quantita/prezzoUnitario/tipo dall'input)
    const vociOut = (body.voci ?? []).map((v, i) => {
      const t = parsed.voci?.find((x) => x.i === i);
      return {
        ...v,
        servizio: t?.servizio ?? v.servizio,
        descrizione: t?.descrizione ?? v.descrizione,
      };
    });

    return NextResponse.json({
      oggetto: parsed.oggetto ?? body.oggetto,
      condizioni: parsed.condizioni ?? body.condizioni ?? "",
      note: parsed.note ?? body.note ?? "",
      voci: vociOut,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[translate-preventivo]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

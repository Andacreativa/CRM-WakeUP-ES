import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const CATEGORIE = [
  "Stipendio",
  "Seguridad Social",
  "Tasse",
  "Carta Aziendale",
  "Costi Aziendali",
  "Software",
  "Commercialista",
  "Fornitori",
  "Soci",
  "Costi Bancari",
  "Altro",
];

const PROMPT = `Estrai da questo scontrino/fattura i seguenti dati:
- fornitore: nome del fornitore o venditore
- categoria: scegli ESATTAMENTE UNA tra queste opzioni: ${CATEGORIE.join(", ")}
- importo: importo totale pagato, come numero decimale (solo il numero, es. 25.50)
- data: data del documento, formato DD/MM/YYYY

Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo né markdown:
{"fornitore": "...", "categoria": "...", "importo": 0.00, "data": "DD/MM/YYYY"}`;

type ExtractedData = {
  fornitore: string | null;
  categoria: string | null;
  importo: number | null;
  data: string | null;
};

export async function POST(request: Request) {
  const apiKey = process.env.LEO_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LEO_API_KEY (o ANTHROPIC_API_KEY) non configurata nel server" },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: "Nessun file ricevuto" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mediaType = file.type;

  const isPdf = mediaType === "application/pdf";
  const isImage = /^image\/(jpeg|png|gif|webp)$/.test(mediaType);
  if (!isPdf && !isImage) {
    return NextResponse.json(
      { error: `Formato non supportato: ${mediaType}` },
      { status: 400 },
    );
  }

  const anthropic = new Anthropic({ apiKey });

  const fileBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: base64,
        },
      };

  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: PROMPT }],
        },
      ],
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
    const parsed = JSON.parse(match[0]) as ExtractedData;
    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extract-ricevuta] errore:", msg);
    return NextResponse.json(
      { error: `Errore estrazione: ${msg}` },
      { status: 500 },
    );
  }
}

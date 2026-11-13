import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// Legge un preventivo (PDF o immagine) e lo trasforma nei campi del modulo
// «Nuovo preventivo»: voci sintetizzate al massimo con gli importi del
// documento, cliente, oggetto, condizioni. Il risultato precompila il form,
// l'utente controlla e salva.

const Voce = z.object({
  servizio: z.string().describe("Nome brevissimo della voce, massimo 4 parole"),
  descrizione: z.string().describe("Dettaglio in massimo 8 parole, senza ripetere il servizio"),
  tipo: z.enum(["mensile", "una_tantum"]),
  quantita: z.number().describe("Numero di unità o di mesi; 1 se non indicato"),
  prezzoUnitario: z.number().describe("Prezzo unitario imponibile, come nel documento"),
});

const Estratto = z.object({
  oggetto: z.string().describe("Titolo breve del preventivo, massimo 8 parole"),
  nomeCliente: z.string().nullable().describe("Persona di riferimento; se manca, il nome dell'azienda"),
  aziendaCliente: z.string().nullable().describe("Ragione sociale o nome della struttura"),
  emailCliente: z.string().nullable(),
  lingua: z.enum(["it", "es", "en"]).describe("Lingua del documento"),
  ivaPercento: z.number().nullable().describe("Solo se il documento indica una percentuale di IVA/IGIC"),
  dataScadenza: z.string().nullable().describe("Data di validità dell'offerta in formato YYYY-MM-DD, solo se esplicita"),
  condizioni: z
    .string()
    .nullable()
    .describe("Condizioni commerciali del documento riassunte in massimo 5 righe brevi, una per riga"),
  noteInterne: z
    .string()
    .nullable()
    .describe("Massimo 3 righe: voci opzionali o non incluse nel totale, tempi di consegna, fasi successive"),
  voci: z.array(Voce).min(1),
});
export type PreventivoEstratto = z.infer<typeof Estratto>;

const SYSTEM = `Leggi preventivi e offerte commerciali (PDF o immagine) e compila i campi del modulo preventivo di un CRM.

Regole:
- Tra le voci metti SOLO quelle comprese nel totale del documento. Le voci opzionali, «da quotare», di una fase successiva o escluse dal totale non vanno tra le voci: elencale in una riga di noteInterne con il loro prezzo se c'è.
- Sintetizza al massimo: servizio in massimo 4 parole, descrizione in massimo 8 parole. Niente elenchi di attività.
- Gli importi sono quelli del documento, imponibili (senza IVA). Se una voce indica quantità × prezzo unitario, rispettale; altrimenti quantita = 1 e prezzoUnitario = importo della voce.
- tipo = "mensile" solo per canoni ricorrenti (quantita = numero di mesi se indicato, altrimenti 1); tutto il resto è "una_tantum".
- oggetto: tipo di lavoro e cliente, es. «Restyling sito web — Residence Bibione».
- nomeCliente: la persona a cui è indirizzato (es. «alla c.a. di …»); se non c'è, il nome dell'azienda. aziendaCliente: la ragione sociale o la struttura.
- ivaPercento e dataScadenza solo se il documento li riporta esplicitamente, altrimenti null.
- condizioni: pagamento, revisioni incluse, esclusioni e tempi, in massimo 5 righe brevi, una per riga, nella lingua del documento; null se il documento non ne ha.
- Rispondi nella lingua del documento.`;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.LEO_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "LEO_API_KEY (o ANTHROPIC_API_KEY) non configurata" }, { status: 500 });
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Nessun file" }, { status: 400 });

    const mediaType = file.type;
    const isPdf = mediaType === "application/pdf";
    const isImage = /^image\/(jpeg|png|gif|webp)$/.test(mediaType);
    if (!isPdf && !isImage) {
      return NextResponse.json({ error: `Formato non supportato: ${mediaType || "sconosciuto"}` }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File troppo grande (massimo 20 MB)" }, { status: 400 });
    }
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const fileBlock: Anthropic.ContentBlockParam = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64,
          },
        };

    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(Estratto) },
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: `Compila il modulo preventivo da questo documento («${file.name}»).` }],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Il documento non è stato letto (richiesta rifiutata)" }, { status: 422 });
    }
    const estratto = response.parsed_output;
    if (!estratto) {
      return NextResponse.json({ error: "Risposta non leggibile, riprova" }, { status: 502 });
    }
    return NextResponse.json(estratto);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extract-preventivo]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

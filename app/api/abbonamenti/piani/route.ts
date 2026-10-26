import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listaPiani } from "@/lib/abbonamenti";
import { prodottoValido, tipoIvaValido } from "@/components/abbonamenti/tipi";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prodotto = searchParams.get("prodotto") || undefined;
  return NextResponse.json(await listaPiani(prisma, prodotto, searchParams.get("attivi") === "1"));
}

// Salva i piani (Configurazione › Abbonamenti): aggiorna quelli con id,
// crea quelli nuovi. Nome, prezzo e attivo si cambiano; il codice no.
export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => [])) as Record<string, unknown>[];
    if (!Array.isArray(body)) return NextResponse.json({ error: "Formato non valido" }, { status: 400 });
    for (const p of body) {
      const prezzo = parseFloat(String(p.prezzo ?? "0").replace(",", "."));
      const data = {
        nome: String(p.nome ?? "").trim().slice(0, 60),
        descrizione: String(p.descrizione ?? "").trim().slice(0, 400) || null,
        prezzo: Number.isFinite(prezzo) && prezzo >= 0 ? Math.round(prezzo * 100) / 100 : 0,
        prezzoLibero: p.prezzoLibero === true,
        tipoIva: tipoIvaValido(p.tipoIva),
        attivo: p.attivo !== false,
        ordine: parseInt(String(p.ordine ?? "0"), 10) || 0,
      };
      if (!data.nome) return NextResponse.json({ error: "Ogni piano ha bisogno di un nome" }, { status: 400 });
      if (p.id) {
        await prisma.pianoAbbonamento.update({ where: { id: parseInt(String(p.id), 10) }, data });
      } else {
        if (!prodottoValido(p.prodotto)) return NextResponse.json({ error: "Prodotto non valido" }, { status: 400 });
        const codice = String(p.codice ?? data.nome).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
        if (!codice) return NextResponse.json({ error: "Codice del piano mancante" }, { status: 400 });
        await prisma.pianoAbbonamento.create({ data: { ...data, prodotto: p.prodotto, codice } });
      }
    }
    return NextResponse.json(await listaPiani(prisma));
  } catch (e) {
    console.error("[PUT /api/abbonamenti/piani]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

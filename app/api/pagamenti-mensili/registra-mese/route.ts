import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  VOCI,
  importoDefault,
  nomeCompleto,
  vociDiTipo,
} from "@/lib/dipendenti";

// Registra in blocco, per tutte le persone attive, le voci del mese non
// ancora registrate che hanno un importo di default maggiore di zero.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const anno = parseInt(body.anno, 10);
    const mese = parseInt(body.mese, 10);
    if (!anno || !mese) {
      return NextResponse.json({ error: "Anno e mese obbligatori" }, { status: 400 });
    }
    const persone = await prisma.dipendente.findMany({ where: { attivo: true } });
    const esistenti = await prisma.pagamentoMensile.findMany({
      where: { anno, mese },
      select: { dipendenteId: true, voce: true },
    });
    const giaFatte = new Set(esistenti.map((e) => `${e.dipendenteId}:${e.voce}`));
    const data = new Date();
    let creati = 0;

    await prisma.$transaction(async (tx) => {
      for (const d of persone) {
        for (const voce of vociDiTipo(d.tipo)) {
          if (VOCI[voce].auto || VOCI[voce].multiplo) continue;
          if (giaFatte.has(`${d.id}:${voce}`)) continue;
          const importo = Math.round(importoDefault(d, voce) * 100) / 100;
          if (importo <= 0) continue;
          const spesa = await tx.spesa.create({
            data: {
              azienda: "Spagna",
              fornitore: nomeCompleto(d),
              categoria: VOCI[voce].categoria,
              descrizione: `${VOCI[voce].label} — ${nomeCompleto(d)}`,
              mese,
              anno,
              importo,
            },
          });
          await tx.pagamentoMensile.create({
            data: { dipendenteId: d.id, anno, mese, voce, importo, data, spesaId: spesa.id },
          });
          creati++;
        }
      }
    });
    return NextResponse.json({ creati });
  } catch (e) {
    console.error("[POST /api/pagamenti-mensili/registra-mese]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

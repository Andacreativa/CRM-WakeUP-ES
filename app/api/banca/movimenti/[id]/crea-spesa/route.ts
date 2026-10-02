import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CATEGORIE_SPESA, AZIENDE } from "@/lib/constants";
import { INCLUDE_MOVIMENTO, imparaBanca, meseAnno } from "@/lib/banca";

type Ctx = { params: Promise<{ id: string }> };

// POST { categoria, fornitore, fornitoreId?, descrizione?, azienda?,
//        mese?, anno?, impara? }: crea la Spesa dal movimento (uscita) e
// la collega. Con impara (default true) memorizza categoria/fornitore
// per il beneficiario.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const movId = parseInt(id, 10);
    const body = await request.json();
    const mov = await prisma.movimentoBancario.findUnique({
      where: { id: movId },
      include: { abbinamenti: true },
    });
    if (!mov) return NextResponse.json({ error: "Movimento non trovato" }, { status: 404 });
    if (mov.importo >= 0) {
      return NextResponse.json({ error: "Solo le uscite diventano spese" }, { status: 400 });
    }
    if (mov.stato !== "da_abbinare" || mov.abbinamenti.length) {
      return NextResponse.json({ error: "Movimento già gestito" }, { status: 409 });
    }
    const categoria = String(body.categoria ?? "");
    const fornitore = String(body.fornitore ?? "").trim();
    if (!CATEGORIE_SPESA.includes(categoria)) {
      return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });
    }
    if (!fornitore) {
      return NextResponse.json({ error: "Fornitore mancante" }, { status: 400 });
    }
    const def = meseAnno(mov.dataContabile);
    const mese = parseInt(body.mese, 10) || def.mese;
    const anno = parseInt(body.anno, 10) || def.anno;
    const azienda = AZIENDE.includes(body.azienda) ? body.azienda : "Spagna";
    const dataIt = mov.dataContabile.toLocaleDateString("it-IT", { timeZone: "UTC" });
    // Rimborsi e benefit a una persona in anagrafica entrano anche nel registro
    const voceRegistro =
      categoria === "Rimborsi" ? "rimborsi" : categoria === "Benefit" ? "benefit" : null;
    const dipendenteId = voceRegistro ? parseInt(body.dipendenteId, 10) || 0 : 0;
    if (dipendenteId) {
      const d = await prisma.dipendente.findUnique({ where: { id: dipendenteId } });
      if (!d) return NextResponse.json({ error: "Persona non trovata" }, { status: 404 });
    }

    const aggiornato = await prisma.$transaction(async (tx) => {
      const spesa = await tx.spesa.create({
        data: {
          azienda,
          fornitore,
          fornitoreId: body.fornitoreId ? Number(body.fornitoreId) : null,
          categoria,
          descrizione: String(body.descrizione ?? "").trim() || null,
          note: `Da estratto conto BBVA del ${dataIt}`,
          mese,
          anno,
          importo: Math.abs(mov.importo),
        },
      });
      await tx.abbinamentoBancario.create({
        data: { movimentoId: mov.id, spesaId: spesa.id, importo: spesa.importo },
      });
      if (voceRegistro && dipendenteId) {
        await tx.pagamentoMensile.create({
          data: {
            dipendenteId,
            anno,
            mese,
            voce: voceRegistro,
            importo: spesa.importo,
            data: mov.dataContabile,
            note: String(body.descrizione ?? "").trim() || mov.osservazioni || null,
            spesaId: spesa.id,
          },
        });
      }
      return tx.movimentoBancario.update({
        where: { id: mov.id },
        data: { stato: "spesa_creata" },
        include: INCLUDE_MOVIMENTO,
      });
    });
    if (body.impara !== false) {
      await imparaBanca(prisma, mov.beneficiario, { categoria, fornitore });
    }
    return NextResponse.json({ ...aggiornato, suggerimento: null });
  } catch (e) {
    console.error("[POST /api/banca/movimenti/id/crea-spesa]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

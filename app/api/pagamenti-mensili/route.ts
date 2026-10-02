import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VOCI, isVoce, nomeCompleto } from "@/lib/dipendenti";

const INCLUDE = {
  dipendente: {
    select: { id: true, nome: true, cognome: true, tipo: true },
  },
  fattura: { select: { id: true, numero: true, cliente: { select: { nome: true } } } },
};

// Registro pagamenti: ?anno= (obbligatorio) &mese= (opzionale) &dipendenteId=
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const anno = parseInt(searchParams.get("anno") || "0", 10);
  const mese = parseInt(searchParams.get("mese") || "0", 10);
  const dipendenteId = parseInt(searchParams.get("dipendenteId") || "0", 10);
  const rows = await prisma.pagamentoMensile.findMany({
    where: {
      ...(anno > 0 ? { anno } : {}),
      ...(mese > 0 ? { mese } : {}),
      ...(dipendenteId > 0 ? { dipendenteId } : {}),
    },
    include: INCLUDE,
    orderBy: [{ anno: "asc" }, { mese: "asc" }, { dipendenteId: "asc" }],
  });
  return NextResponse.json(rows);
}

// Registra (o aggiorna) una voce per persona/mese e crea la Spesa collegata.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dipendenteId = parseInt(body.dipendenteId, 10);
    const anno = parseInt(body.anno, 10);
    const mese = parseInt(body.mese, 10);
    const voce = body.voce;
    const importo = Math.round((parseFloat(body.importo) || 0) * 100) / 100;
    if (!dipendenteId || !anno || !mese || !isVoce(voce)) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }
    if (VOCI[voce].auto) {
      return NextResponse.json(
        { error: "Le commissioni nascono dalle fatture incassate" },
        { status: 409 },
      );
    }
    if (importo <= 0) {
      return NextResponse.json({ error: "Importo non valido" }, { status: 400 });
    }
    const d = await prisma.dipendente.findUnique({ where: { id: dipendenteId } });
    if (!d) return NextResponse.json({ error: "Persona non trovata" }, { status: 404 });

    const data = body.data ? new Date(body.data) : new Date();
    const note = body.note?.trim() || null;
    const descrizione = `${VOCI[voce].label} — ${nomeCompleto(d)}`;

    const row = await prisma.$transaction(async (tx) => {
      const esistente = await tx.pagamentoMensile.findFirst({
        where: { dipendenteId, anno, mese, voce },
      });
      if (esistente) {
        if (esistente.spesaId) {
          await tx.spesa.update({
            where: { id: esistente.spesaId },
            data: { importo, descrizione, fornitore: nomeCompleto(d) },
          });
        }
        return tx.pagamentoMensile.update({
          where: { id: esistente.id },
          data: { importo, data, note },
          include: INCLUDE,
        });
      }
      const spesa = await tx.spesa.create({
        data: {
          azienda: "Spagna",
          fornitore: nomeCompleto(d),
          categoria: VOCI[voce].categoria,
          descrizione,
          mese,
          anno,
          importo,
        },
      });
      return tx.pagamentoMensile.create({
        data: { dipendenteId, anno, mese, voce, importo, data, note, spesaId: spesa.id },
        include: INCLUDE,
      });
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[POST /api/pagamenti-mensili]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

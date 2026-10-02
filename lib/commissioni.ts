import type { Prisma, PrismaClient } from "@prisma/client";
import { nomeCompleto } from "./dipendenti";

type Db = PrismaClient | Prisma.TransactionClient;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Allinea la commissione di una fattura: la ricrea da zero quando la fattura
// è incassata e ha un commerciale con percentuale, altrimenti la rimuove.
// La commissione è una riga del registro pagamenti (voce "commissioni") con
// la sua Spesa in categoria "Commissioni", entrambe legate alla fattura.
export async function syncCommissioneFattura(db: Db, fatturaId: number) {
  const f = await db.fattura.findUnique({
    where: { id: fatturaId },
    include: {
      cliente: { select: { nome: true } },
      commercialeRef: true,
    },
  });
  if (!f) return;

  const esistenti = await db.pagamentoMensile.findMany({
    where: { fatturaId, voce: "commissioni" },
  });
  const spesaIds = esistenti
    .map((p) => p.spesaId)
    .filter((x): x is number => x !== null);
  if (spesaIds.length) {
    await db.spesa.deleteMany({ where: { id: { in: spesaIds } } });
  }
  if (esistenti.length) {
    await db.pagamentoMensile.deleteMany({
      where: { fatturaId, voce: "commissioni" },
    });
  }

  const d = f.commercialeRef;
  if (!f.pagato || !d || d.percentualeCommissione <= 0) return;

  const importo = round2((f.importo * d.percentualeCommissione) / 100);
  if (importo <= 0) return;

  const spesa = await db.spesa.create({
    data: {
      azienda: f.azienda || "Spagna",
      fornitore: nomeCompleto(d),
      categoria: "Commissioni",
      descrizione: `Commissione ${d.percentualeCommissione}% su fattura ${
        f.numero ?? `#${f.id}`
      }${f.cliente ? ` — ${f.cliente.nome}` : ""}`,
      mese: f.mese,
      anno: f.anno,
      importo,
      fatturaId: f.id,
    },
  });
  await db.pagamentoMensile.create({
    data: {
      dipendenteId: d.id,
      anno: f.anno,
      mese: f.mese,
      voce: "commissioni",
      importo,
      data: new Date(),
      spesaId: spesa.id,
      fatturaId: f.id,
    },
  });
}

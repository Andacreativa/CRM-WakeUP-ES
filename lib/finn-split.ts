import type { PrismaClient } from "@prisma/client";

interface SplitFattura {
  id: number;
  importo: number;
  mese: number;
  anno: number;
  pagato: boolean;
  cliente?: { nome: string } | null;
}

// "finn" non esiste più: Finn è un commerciale in anagrafica
// (Fattura.commercialeId → commissione automatica, vedi lib/commissioni.ts).
export type SplitType = "anda" | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const getSplitType = (
  commerciale: string | null | undefined,
): SplitType => {
  const c = (commerciale ?? "").toLowerCase().trim();
  if (c.includes("anda")) return "anda";
  return null;
};

export const isFinnRitenuta = (a: {
  fonte?: string | null;
  descrizione?: string | null;
}) => a.fonte === "Finn" && a.descrizione === "Ritenuta spese gestione Anda";

export async function applySplit(
  prisma: PrismaClient,
  f: SplitFattura,
  type: SplitType,
) {
  if (type === "anda") return applyAndaSplit(prisma, f);
}

export async function applyAndaSplit(prisma: PrismaClient, f: SplitFattura) {
  const halfShare = round2(f.importo * 0.425);
  const clienteNome = f.cliente?.nome ?? null;

  await prisma.spesa.create({
    data: {
      azienda: "Spagna",
      fornitore: "Leonardo Mestre",
      categoria: "Soci",
      descrizione: clienteNome,
      mese: f.mese,
      anno: f.anno,
      importo: halfShare,
      fatturaId: f.id,
    },
  });

  await prisma.spesa.create({
    data: {
      azienda: "Spagna",
      fornitore: "Lorenzo Vanghetti",
      categoria: "Soci",
      descrizione: clienteNome,
      mese: f.mese,
      anno: f.anno,
      importo: halfShare,
      fatturaId: f.id,
    },
  });
}

export async function deleteSplitForFattura(
  prisma: PrismaClient,
  fatturaId: number,
) {
  const altri = await prisma.altroIngresso.deleteMany({
    where: { fatturaId },
  });
  const spese = await prisma.spesa.deleteMany({
    where: { fatturaId },
  });
  return { altri: altri.count, spese: spese.count };
}

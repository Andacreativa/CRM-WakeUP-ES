import type { PrismaClient } from "@prisma/client";

interface SplitFattura {
  id: number;
  importo: number;
  mese: number;
  anno: number;
  pagato: boolean;
  cliente?: { nome: string } | null;
}

export type SplitType = "finn" | "anda" | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const getSplitType = (
  commerciale: string | null | undefined,
): SplitType => {
  const c = (commerciale ?? "").toLowerCase().trim();
  if (c.includes("finn")) return "finn";
  if (c.includes("anda")) return "anda";
  return null;
};

export const isFinnCommerciale = (commerciale: string | null | undefined) =>
  getSplitType(commerciale) === "finn";

export const isFinnRitenuta = (a: {
  fonte?: string | null;
  descrizione?: string | null;
}) => a.fonte === "Finn" && a.descrizione === "Ritenuta spese gestione Anda";

export async function applySplit(
  prisma: PrismaClient,
  f: SplitFattura,
  type: SplitType,
) {
  if (type === "finn") return applyFinnSplit(prisma, f);
  if (type === "anda") return applyAndaSplit(prisma, f);
}

export async function applyFinnSplit(prisma: PrismaClient, f: SplitFattura) {
  const quota15 = round2(f.importo * 0.15);
  const quota85 = round2(f.importo * 0.85);
  const clienteNome = f.cliente?.nome ?? null;

  await prisma.altroIngresso.create({
    data: {
      fonte: "Finn",
      azienda: "Spagna",
      aziendaNota: null,
      descrizione: "Ritenuta spese gestione Anda",
      mese: f.mese,
      anno: f.anno,
      importo: quota15,
      incassato: true,
      dataIncasso: new Date(),
      fatturaId: f.id,
    },
  });

  await prisma.spesa.create({
    data: {
      azienda: "Spagna",
      fornitore: "Finn Kalbhenn",
      categoria: "Soci",
      descrizione: clienteNome,
      mese: f.mese,
      anno: f.anno,
      importo: quota85,
      fatturaId: f.id,
    },
  });
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

// Alias retro-compatibile
export const deleteFinnSplitForFattura = deleteSplitForFattura;

export async function deleteAllFinnSplits(prisma: PrismaClient) {
  const altri = await prisma.altroIngresso.deleteMany({
    where: {
      OR: [
        { fatturaId: { not: null } },
        { fonte: "Finn", descrizione: "Ritenuta spese gestione Anda" },
      ],
    },
  });
  const spese = await prisma.spesa.deleteMany({
    where: {
      OR: [
        { fatturaId: { not: null } },
        { fornitore: "Finn Kalbhenn", categoria: "Soci" },
      ],
    },
  });
  return { altri: altri.count, spese: spese.count };
}

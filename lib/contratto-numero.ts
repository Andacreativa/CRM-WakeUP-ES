import { prisma } from "./prisma";

export async function nextContrattoNumero(anno: number): Promise<string> {
  const prefix = `CON-${anno}-`;
  const all = await prisma.contratto.findMany({
    where: { numero: { startsWith: prefix } },
    select: { numero: true },
  });
  let max = 0;
  for (const c of all) {
    const n = parseInt(c.numero.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

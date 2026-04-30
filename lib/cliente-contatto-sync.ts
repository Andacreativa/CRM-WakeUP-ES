import type { PrismaClient } from "@prisma/client";

interface SharedFields {
  nome: string;
  paese?: string | null;
  email?: string | null;
  telefono?: string | null;
  partitaIva?: string | null;
  via?: string | null;
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
  note?: string | null;
}

const sharedData = (s: SharedFields) => ({
  paese: s.paese || "Italia",
  email: s.email ?? null,
  telefono: s.telefono ?? null,
  partitaIva: s.partitaIva ?? null,
  via: s.via ?? null,
  cap: s.cap ?? null,
  citta: s.citta ?? null,
  provincia: s.provincia ?? null,
  note: s.note ?? null,
});

// Cliente (Finance) → Contatto (Sales)
export async function syncClienteToContatto(
  prisma: PrismaClient,
  cliente: SharedFields,
) {
  const matched = await prisma.contatto.findFirst({
    where: { nome: { equals: cliente.nome, mode: "insensitive" } },
  });
  if (matched) {
    await prisma.contatto.update({
      where: { id: matched.id },
      data: sharedData(cliente),
    });
    return { action: "updated" as const, id: matched.id };
  }
  const created = await prisma.contatto.create({
    data: {
      nome: cliente.nome,
      ...sharedData(cliente),
      status: "lead",
    },
  });
  return { action: "created" as const, id: created.id };
}

// Contatto (Sales) → Cliente (Finance)
export async function syncContattoToCliente(
  prisma: PrismaClient,
  contatto: SharedFields,
) {
  const matched = await prisma.cliente.findFirst({
    where: { nome: { equals: contatto.nome, mode: "insensitive" } },
  });
  if (matched) {
    await prisma.cliente.update({
      where: { id: matched.id },
      data: sharedData(contatto),
    });
    return { action: "updated" as const, id: matched.id };
  }
  const created = await prisma.cliente.create({
    data: {
      nome: contatto.nome,
      ...sharedData(contatto),
    },
  });
  return { action: "created" as const, id: created.id };
}

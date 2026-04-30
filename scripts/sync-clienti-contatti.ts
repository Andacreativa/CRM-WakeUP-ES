import { prisma } from "../lib/prisma";
import {
  syncClienteToContatto,
  syncContattoToCliente,
} from "../lib/cliente-contatto-sync";

async function main() {
  const clienti = await prisma.cliente.findMany({
    orderBy: { id: "asc" },
  });
  const contatti = await prisma.contatto.findMany({
    orderBy: { id: "asc" },
  });

  console.log(
    `Stato iniziale: ${clienti.length} clienti, ${contatti.length} contatti\n`,
  );

  let contattiCreated = 0;
  let contattiUpdated = 0;
  for (const c of clienti) {
    const r = await syncClienteToContatto(prisma, c);
    if (r.action === "created") contattiCreated++;
    else contattiUpdated++;
  }
  console.log(
    `Cliente → Contatto: ${contattiCreated} creati, ${contattiUpdated} aggiornati`,
  );

  let clientiCreated = 0;
  let clientiUpdated = 0;
  for (const c of contatti) {
    const r = await syncContattoToCliente(prisma, c);
    if (r.action === "created") clientiCreated++;
    else clientiUpdated++;
  }
  console.log(
    `Contatto → Cliente: ${clientiCreated} creati, ${clientiUpdated} aggiornati`,
  );

  const finalClienti = await prisma.cliente.count();
  const finalContatti = await prisma.contatto.count();
  console.log(
    `\nStato finale: ${finalClienti} clienti, ${finalContatti} contatti`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

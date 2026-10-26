import AreaCliente from "@/components/suscripcion/AreaCliente";
import { linguaValida } from "@/components/abbonamenti/tipi";

// /suscripcion/area: area cliente degli abbonati (fatture, abbonamento,
// conto). Senza cookie mostra il modulo «mandami il link di accesso».
export default async function AreaPage({ searchParams }: { searchParams: Promise<{ lang?: string; err?: string }> }) {
  const sp = await searchParams;
  return <AreaCliente linguaIniziale={sp.lang ? linguaValida(sp.lang) : null} errore={sp.err ?? null} />;
}

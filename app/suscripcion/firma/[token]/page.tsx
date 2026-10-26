import FormSuscripcion from "@/components/suscripcion/FormSuscripcion";
import { linguaValida } from "@/components/abbonamenti/tipi";

// /suscripcion/firma/<token>: l'abbonamento creato da Sales, da firmare
export default async function FirmaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  return <FormSuscripcion prodotto={null} linguaIniziale={sp.lang ? linguaValida(sp.lang) : null} pianoIniziale={null} token={token} />;
}

import { notFound } from "next/navigation";
import FormSuscripcion from "@/components/suscripcion/FormSuscripcion";
import { linguaValida, prodottoValido } from "@/components/abbonamenti/tipi";

// /suscripcion/boogo?plan=medium&lang=es
export default async function SuscripcionPage({
  params,
  searchParams,
}: {
  params: Promise<{ prodotto: string }>;
  searchParams: Promise<{ plan?: string; lang?: string }>;
}) {
  const { prodotto } = await params;
  const sp = await searchParams;
  if (!prodottoValido(prodotto)) notFound();
  return <FormSuscripcion prodotto={prodotto} linguaIniziale={linguaValida(sp.lang)} pianoIniziale={sp.plan ?? null} token={null} />;
}

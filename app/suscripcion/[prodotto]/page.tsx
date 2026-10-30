import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FormSuscripcion from "@/components/suscripcion/FormSuscripcion";
import { MARCHI_PRODOTTO, linguaValida, prodottoValido } from "@/components/abbonamenti/tipi";

// Icona del prodotto nella scheda del browser, al posto di quella del CRM
export async function generateMetadata({ params }: { params: Promise<{ prodotto: string }> }): Promise<Metadata> {
  const { prodotto } = await params;
  const icona = MARCHI_PRODOTTO[prodotto]?.icona;
  return icona ? { icons: { icon: icona } } : {};
}

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

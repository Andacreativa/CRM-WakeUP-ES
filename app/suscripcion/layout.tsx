import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Suscripción",
  robots: { index: false, follow: false },
};

// Pagine pubbliche (senza sessione né sidebar): modulo di sottoscrizione
// degli abbonamenti e firma dal link.
export default function SuscripcionLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f6f7fb] text-gray-900">{children}</div>;
}

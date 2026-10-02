import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  async redirects() {
    return [
      // Dopo il login si entra direttamente nella dashboard
      { source: "/", destination: "/finance", permanent: false },
      // Vecchi indirizzi: clienti, fornitori e contatti ora stanno nel CRM
      { source: "/finance/clienti", destination: "/crm/clienti", permanent: false },
      { source: "/finance/fornitori", destination: "/crm/fornitori", permanent: false },
      { source: "/sales/contatti", destination: "/crm/contatti", permanent: false },
      // La vecchia pagina "fatture da contratto" è sostituita dalle richieste
      { source: "/sales/contratti/fatture", destination: "/sales/richieste", permanent: false },
    ];
  },
};

export default nextConfig;

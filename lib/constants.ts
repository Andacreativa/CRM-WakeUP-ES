export const MESI = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

export const CATEGORIE_SPESA = [
  "Stipendio",
  "Seguridad Social",
  "Tasse",
  "Carta Aziendale",
  "Costi Aziendali",
  "Software",
  "Commercialista",
  "Fornitori",
  "Soci",
  "Costi Bancari",
  "Ufficio",
  "Altro",
];

export const AZIENDE = ["Spagna", "Italia", "Altro"];

export const AZIENDA_COLORI: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Spagna: { bg: "#ef4444", text: "#ffffff", border: "#ef4444" },
  Italia: { bg: "#22c55e", text: "#ffffff", border: "#22c55e" },
  Altro: { bg: "#f8f9fc", text: "#64748b", border: "#e2e8f0" },
};

export const PAESI = [
  "Italia",
  "Spagna",
  "Francia",
  "Germania",
  "Portogallo",
  "Regno Unito",
  "Altro",
];

// Palette pastello per i badge categoria. Colori morbidi da usare come sfondo
// solido con testo scuro (vedi CATEGORIA_TEXT).
export const CATEGORIE_COLORI: Record<string, string> = {
  Stipendio: "#BDE3F5", // azzurro chiaro
  "Seguridad Social": "#FFAAAA", // rosso pastello
  "Carta Aziendale": "#B8F0C8", // verde menta
  Software: "#D4BBEE", // viola chiaro
  Soci: "#FFF0A0", // giallo pastello
  Commercialista: "#FFD6D6", // rosa chiaro
  "Costi Bancari": "#E0E0E0", // grigio chiaro
  Fornitori: "#D4E8A0", // verde oliva chiaro
  Tasse: "#FFC9A0", // pesca pastello (non specificato, coerente)
  "Costi Aziendali": "#C8E6F0", // azzurro tenue (non specificato)
  Ufficio: "#FFE0B0", // ambra pastello
  Altro: "#EDEDED", // grigio neutro
};

// Testo scuro uniforme per i badge categoria — leggibile su tutti i pastel.
export const CATEGORIA_TEXT = "#1f2937";

// Versioni sature delle categorie per grafici (pie/bar). I pastel di
// CATEGORIE_COLORI sono pensati per badge — troppo chiari su fette grandi.
export const CATEGORIE_COLORI_CHART: Record<string, string> = {
  Stipendio: "#5BB8E8",
  "Seguridad Social": "#FF6B6B",
  "Carta Aziendale": "#4DD68C",
  Software: "#9B6ED4",
  Soci: "#F5D020",
  Commercialista: "#FF9999",
  "Costi Bancari": "#AAAAAA",
  Fornitori: "#8DB84A",
  Tasse: "#FF9940",
  "Costi Aziendali": "#5BA9D8",
  Ufficio: "#F5A623",
  Altro: "#B0B0B0",
};

export const BRAND = "#e8308a";

export const TIPO_IMPOSTA_OPTIONS = ["IGIC Exenta", "IGIC 7%"];

// Formato europeo: punto separatore migliaia, virgola decimale, sempre 2 decimali (es. "3.250,00 €")
// Implementazione manuale per evitare problemi con dati locali ICU ridotti su Node.
export function fmt(n: number | null | undefined): string {
  const value = Number(n) || 0;
  const negative = value < 0;
  const abs = Math.abs(value);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  // Non-breaking space per evitare che il simbolo € vada a capo su colonne strette
  return `${negative ? "-" : ""}${intWithSep},${decPart} €`;
}

// Anni disponibili dal 2024 all'anno corrente, ordine decrescente
const ANNO_CORRENTE = new Date().getFullYear();
const ANNO_MIN = 2024;
export const ANNI = Array.from(
  { length: Math.max(1, ANNO_CORRENTE - ANNO_MIN + 1) },
  (_, i) => ANNO_CORRENTE - i,
);

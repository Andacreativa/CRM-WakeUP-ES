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
  "Rimborsi",
  "Benefit",
  "Commissioni",
  "Altro",
];

export const AZIENDE = ["Spagna", "Italia", "Altro"];

// Categorie degli altri ingressi (entrate non da fattura)
export const CATEGORIE_INGRESSO: { value: string; label: string }[] = [
  { value: "cashback", label: "Cashback" },
  { value: "rimborso_tasse", label: "Rimborso tasse" },
  { value: "apporto_socio", label: "Apporto socio" },
  { value: "incasso_senza_fattura", label: "Incasso senza fattura" },
  { value: "ritenuta_commerciale", label: "Ritenuta commerciale" },
  { value: "altro", label: "Altro" },
];
export const CATEGORIA_INGRESSO_LABEL: Record<string, string> =
  Object.fromEntries(CATEGORIE_INGRESSO.map((c) => [c.value, c.label]));

export const AZIENDA_COLORI: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Spagna: { bg: "#ef4444", text: "#ffffff", border: "#ef4444" },
  Italia: { bg: "#22c55e", text: "#ffffff", border: "#22c55e" },
  Altro: { bg: "#f8f9fc", text: "#64748b", border: "#e2e8f0" },
};

// Paese = sede della controparte (cliente, fornitore, lead). Il codice è
// il prefisso della partita IVA europea (IT, ES…): scegliendo il paese nei
// form il campo P.IVA/NIF lo prende da solo.
export const PAESI_CODICE: Record<string, string> = {
  Italia: "IT",
  Spagna: "ES",
  Francia: "FR",
  Germania: "DE",
  Portogallo: "PT",
  "Regno Unito": "GB",
  Irlanda: "IE",
  "Paesi Bassi": "NL",
  Belgio: "BE",
  Lussemburgo: "LU",
  Austria: "AT",
  // fuori dal sistema IVA europeo: nessun prefisso
  Svizzera: "",
  "Stati Uniti": "",
  Altro: "",
};
export const PAESI = Object.keys(PAESI_CODICE);

// Paese per i filtri a chip: Italia, Spagna, il resto in "Altri"
export const paeseGruppo = (p: string | null | undefined) =>
  p === "Italia" || p === "Spagna" ? p : "Altri";

// Prefisso della P.IVA al cambio di paese: vuoto → solo il codice;
// prefisso del paese di prima → sostituito; numero senza prefisso → il
// codice va davanti. Fuori dall'UE senza codice (Altro) si toglie solo
// il prefisso vecchio. Non tocca un numero che ha già il prefisso giusto.
export function prefissaPiva(
  piva: string | null | undefined,
  paese: string,
  paesePrima?: string | null,
): string {
  const codice = PAESI_CODICE[paese] ?? "";
  const prima = paesePrima ? (PAESI_CODICE[paesePrima] ?? "") : "";
  const v = String(piva ?? "").trim();
  const codici = Object.values(PAESI_CODICE).filter(Boolean);
  if (!v || codici.includes(v.toUpperCase())) return codice;
  if (codice && v.toUpperCase().startsWith(codice)) return v;
  const resto = prima && v.toUpperCase().startsWith(prima) ? v.slice(prima.length) : v;
  return codice + resto;
}

// Prefisso ripetuto: nel campo c'è già "IT" e si incolla "IT0123…"
export const unisciPrefisso = (piva: string) => piva.replace(/^([A-Za-z]{2})\1(?=[A-Za-z0-9]{8})/, "$1");

// P.IVA da salvare: senza spazi, in maiuscolo; il solo prefisso ("IT")
// lasciato dal form vale come campo vuoto.
export function pulisciPiva(piva: unknown): string | null {
  const v = unisciPrefisso(String(piva ?? "").replace(/\s+/g, "").toUpperCase());
  if (!v || /^[A-Z]{0,2}$/.test(v)) return null;
  return v;
}

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
  Rimborsi: "#C9F0E8", // acqua pastello
  Benefit: "#E6D8F5", // lilla pastello
  Commissioni: "#FBD5E8", // rosa pastello
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
  Rimborsi: "#2BB5A0",
  Benefit: "#A77BE0",
  Commissioni: "#E8308A",
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

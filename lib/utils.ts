import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Ricerca testuale dei filtri: vero se la query (ignorando maiuscole e spazi
// ai bordi) compare in almeno uno dei campi. Query vuota = tutto passa.
export function matchQ(q: string, ...campi: (string | number | null | undefined)[]) {
  const s = q.trim().toLowerCase();
  return !s || campi.some((v) => String(v ?? "").toLowerCase().includes(s));
}

// Scrivere da Gmail nel browser con la casella aziendale, così il mittente non
// dipende dal programma di posta del computer. authuser sceglie l'account
// quando nel browser ce n'è più di uno.
const CASELLA_AZIENDALE = "info@andacreativa.com";
export function linkGmail(a: string, oggetto = "", testo = "") {
  return (
    `https://mail.google.com/mail/?authuser=${CASELLA_AZIENDALE}&view=cm&fs=1` +
    `&to=${encodeURIComponent(a)}&su=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(testo)}`
  );
}

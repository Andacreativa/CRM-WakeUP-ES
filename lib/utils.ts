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

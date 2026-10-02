// Filtri e pagina di una lista, ricordati mentre si apre una scheda: al
// ritorno la lista si ritrova dov'era. Vive nella sessione del browser e si
// consuma alla prima lettura.
export function ricordaLista(chiave: string, stato: Record<string, unknown>) {
  try {
    sessionStorage.setItem(chiave, JSON.stringify(stato));
  } catch {
    /* sessionStorage non disponibile */
  }
}

export function riprendiLista<T extends Record<string, unknown>>(chiave: string): Partial<T> | null {
  try {
    const s = sessionStorage.getItem(chiave);
    if (!s) return null;
    sessionStorage.removeItem(chiave);
    return JSON.parse(s) as Partial<T>;
  } catch {
    return null;
  }
}

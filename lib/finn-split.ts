// Ritenute storiche sulle commissioni di Finn ("Ritenuta spese gestione
// Anda"): altri ingressi solo contabili, visibili ma mai sommati.
// La vecchia ripartizione per fattura (quote soci 42,5 % a testa) è stata
// tolta il 2026-10-03: il dividendo non si calcola per fattura.
const FONTI_FINN = new Set(["Finn", "Finn Kalbhenn"]);

export const isFinnRitenuta = (a: {
  fonte?: string | null;
  descrizione?: string | null;
}) => FONTI_FINN.has(a.fonte ?? "") && a.descrizione === "Ritenuta spese gestione Anda";

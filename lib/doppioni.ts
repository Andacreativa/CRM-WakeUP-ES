// Confronto tra anagrafiche (clienti, fornitori): lo usano il controllo
// doppioni dei form e l'import delle fatture, che così non crea un cliente
// nuovo per «ASD JUDO AZZANESE» quando c'è già «Judo Azzanese».

// Forme societarie e parole che non distinguono due ragioni sociali
const FORME = new Set([
  "srl", "srls", "sas", "snc", "spa", "sl", "slu", "sa", "scp", "ltd", "limited", "di", "de", "e", "c",
  "sociedad", "limitada", "societa", "responsabilita", "unipersonale",
  "asd", "ssd", "ssdrl", "ssdarl", "aps", "ets", "odv", "onlus",
  "associazione", "sportiva", "dilettantistica",
]);

// Nome confrontabile: minuscolo, senza accenti, punteggiatura e forma
// societaria («A.S.D.» e «S.r.l.» valgono come «asd» e «srl»).
export const normNome = (s: string | null | undefined) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !FORME.has(t))
    .join(" ");

// P.IVA confrontabile: senza prefisso paese e senza simboli
export const normPiva = (s: string | null | undefined) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(IT|ES|FR|DE|PT|GB|IE|NL|BE|LU|AT|PIVA)(?=[A-Z0-9]{8,})/, "");

type Anagrafica = { id: number; nome: string; partitaIva: string | null; email?: string | null };

// Anagrafiche già presenti simili a quella che si sta scrivendo: stesso
// nome (anche senza forma societaria), stessa P.IVA o stessa email.
export function trovaDoppioni<T extends Anagrafica>(
  f: { nome: string; partitaIva: string; email: string },
  elenco: T[],
  escludiId?: number,
): { c: T; motivo: string }[] {
  const n = normNome(f.nome);
  const p = normPiva(f.partitaIva);
  const e = f.email.trim().toLowerCase();
  const out: { c: T; motivo: string }[] = [];
  for (const c of elenco) {
    if (c.id === escludiId) continue;
    const cn = normNome(c.nome);
    if (p.length >= 8 && normPiva(c.partitaIva) === p) out.push({ c, motivo: "stessa P.IVA" });
    else if (e && (c.email ?? "").trim().toLowerCase() === e) out.push({ c, motivo: "stessa email" });
    else if (n.length >= 4 && cn && (cn === n || (cn.length >= 4 && (cn.includes(n) || n.includes(cn)))))
      out.push({ c, motivo: "nome simile" });
  }
  return out.slice(0, 5);
}

// Stessa anagrafica senza dubbi (per gli abbinamenti automatici): stessa
// P.IVA, oppure stesso nome a meno di maiuscole, punteggiatura e forma
// societaria. Il «nome simile» di trovaDoppioni qui non basta.
export function trovaStessa<T extends Anagrafica>(
  piva: string | null | undefined,
  nome: string | null | undefined,
  elenco: T[],
): T | null {
  const p = normPiva(piva);
  if (p.length >= 8) {
    const c = elenco.find((x) => normPiva(x.partitaIva) === p);
    if (c) return c;
  }
  const n = normNome(nome);
  if (n.length < 3) return null;
  return elenco.find((x) => normNome(x.nome) === n) ?? null;
}

// Spese ↔ fornitore in anagrafica. La Spesa ha il fornitore come testo (e
// a volte fornitoreId): ogni spesa va a UN solo fornitore, così "Google" e
// "Google Cloud EMEA Limited" non contano due volte la stessa spesa.

export const normFornitore = (s: string | null | undefined) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,'`"()\-_/&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface FornitoreMin {
  id: number;
  nome: string;
}
interface SpesaMin {
  fornitore: string;
  fornitoreId?: number | null;
}

// Fornitore di una spesa: prima l'id, poi il nome uguale, poi il nome più
// lungo contenuto nell'altro (almeno 4 lettere).
export function fornitoreDellaSpesa<F extends FornitoreMin>(
  s: SpesaMin,
  fornitori: F[],
  indice?: Map<string, F>,
): F | null {
  if (s.fornitoreId) {
    const f = fornitori.find((x) => x.id === s.fornitoreId);
    if (f) return f;
  }
  const n = normFornitore(s.fornitore);
  if (!n) return null;
  const esatto = indice ? indice.get(n) : fornitori.find((f) => normFornitore(f.nome) === n);
  if (esatto) return esatto;
  let meglio: F | null = null;
  let lung = 0;
  for (const f of fornitori) {
    const k = normFornitore(f.nome);
    if (k.length < 4) continue;
    if ((n.includes(k) || k.includes(n)) && k.length > lung) {
      meglio = f;
      lung = k.length;
    }
  }
  return meglio;
}

// Spese raggruppate per fornitore (id → spese)
export function spesePerFornitore<F extends FornitoreMin, S extends SpesaMin>(
  spese: S[],
  fornitori: F[],
): Map<number, S[]> {
  const indice = new Map(fornitori.map((f) => [normFornitore(f.nome), f]));
  const out = new Map<number, S[]>();
  for (const s of spese) {
    const f = fornitoreDellaSpesa(s, fornitori, indice);
    if (!f) continue;
    const arr = out.get(f.id) ?? [];
    arr.push(s);
    out.set(f.id, arr);
  }
  return out;
}

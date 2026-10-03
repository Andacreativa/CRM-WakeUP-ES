// Spese ↔ registro pagamenti dei dipendenti. Una spesa di categoria
// Rimborsi, Benefit o Commissioni intestata a una persona in anagrafica
// (fornitore = nome e cognome) è anche una riga del suo registro, che sia
// nata dalla banca o inserita a mano in Spese.
import type { Prisma, PrismaClient } from "@prisma/client";
import { nomeCompleto } from "./dipendenti";

type Db = PrismaClient | Prisma.TransactionClient;

export const VOCE_DA_CATEGORIA: Record<string, "rimborsi" | "benefit" | "commissioni"> = {
  Rimborsi: "rimborsi",
  Benefit: "benefit",
  Commissioni: "commissioni",
};
const VOCI_A_MANO = new Set(Object.values(VOCE_DA_CATEGORIA));

const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Persona del fornitore: nome e cognome uguali, oppure il solo nome se in
// anagrafica c'è una sola persona con quel nome ("Finn" → Finn Kalbhenn).
export async function personaDelFornitore(db: Db, fornitore: string) {
  const persone = await db.dipendente.findMany({ select: { id: true, nome: true, cognome: true } });
  const f = norm(fornitore);
  if (!f) return null;
  const completa = persone.find((p) => norm(nomeCompleto(p)) === f);
  if (completa) return completa;
  const soloNome = persone.filter((p) => norm(p.nome) === f);
  return soloNome.length === 1 ? soloNome[0] : null;
}

// Allinea il registro alla spesa appena salvata:
// - categoria del registro + persona riconosciuta, senza riga → la crea;
// - riga già presente → importo e mese seguono la spesa (e la voce, se la
//   riga è a mano e la categoria resta del registro);
// - riga a mano (non nata da fattura) e categoria non più del registro →
//   la riga si toglie.
// Le commissioni nate da una fattura restano gestite dalla fattura.
export async function allineaRegistroSpesa(db: Db, spesaId: number) {
  const spesa = await db.spesa.findUnique({
    where: { id: spesaId },
    include: { pagamentoMensile: true },
  });
  if (!spesa) return;
  const voce = VOCE_DA_CATEGORIA[spesa.categoria];
  const pm = spesa.pagamentoMensile;
  if (pm) {
    const aMano = !pm.fatturaId && VOCI_A_MANO.has(pm.voce as "rimborsi");
    if (aMano && !voce) {
      await db.pagamentoMensile.delete({ where: { id: pm.id } });
      return;
    }
    await db.pagamentoMensile.update({
      where: { id: pm.id },
      data: {
        importo: spesa.importo,
        anno: spesa.anno,
        mese: spesa.mese,
        ...(aMano && voce ? { voce } : {}),
      },
    });
    return;
  }
  if (!voce) return;
  const persona = await personaDelFornitore(db, spesa.fornitore);
  if (!persona) return;
  await db.pagamentoMensile.create({
    data: {
      dipendenteId: persona.id,
      anno: spesa.anno,
      mese: spesa.mese,
      voce,
      importo: spesa.importo,
      note: spesa.descrizione,
      spesaId: spesa.id,
    },
  });
  // il fornitore resta sempre con nome e cognome
  const completo = nomeCompleto(persona);
  if (spesa.fornitore !== completo) {
    await db.spesa.update({ where: { id: spesa.id }, data: { fornitore: completo } });
  }
}

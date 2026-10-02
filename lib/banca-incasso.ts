// Riconciliazione entrate, lato server: dati della board (clienti → fatture,
// bonifici con i loro collegamenti), incasso di un bonifico su una o più
// fatture (acconti con la data del movimento) e scollegamento. Usato dalle
// API /api/banca/board/* e /api/banca/movimenti/[id]/*.
import type { PrismaClient } from "@prisma/client";
import {
  INCLUDE_MOVIMENTO,
  NOTA_BANCA,
  NOTA_GIA_INCASSATA,
  caricaContestoEntrate,
  centesimi,
  dopoCambioIncasso,
  meseAnno,
  pulisci,
  suggerisciEntrata,
} from "./banca";
import type { SuggerimentoEntrata } from "./banca-shared";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Board ───────────────────────────────────────────────────────────
export interface FatturaBoard {
  id: number;
  numero: string | null;
  data: string | null; // data fattura o primo del mese
  mese: number;
  anno: number;
  importo: number;
  azienda: string;
  incassatoFuori: number; // acconti registrati a mano (non dalla banca)
  pagato: boolean;
  manuale: boolean; // segnata incassata a mano senza acconti: si può ancora collegare il bonifico (acconto retroattivo)
}
export interface ClienteBoard {
  id: number | null;
  nome: string;
  fatture: FatturaBoard[];
}
export interface LinkBoard {
  fatturaId: number;
  importo: number;
}
export interface DocumentoBoard {
  id: number;
  data: string;
  valore: number;
  label: string; // mittente
  details: string; // concetto · osservazioni
  links: LinkBoard[];
  escluso: boolean;
  altro: { id: number; categoria: string | null; importo: number } | null; // registrato come altro ingresso
  hint: string | null; // cliente riconosciuto dal mittente/causale
  proposta: SuggerimentoEntrata | null; // solo per i movimenti ancora da abbinare
}

export async function costruisciBoard(prisma: PrismaClient, anno: number) {
  const anni = anno > 0 ? [anno] : [];
  const [fatture, movimenti, ctx] = await Promise.all([
    prisma.fattura.findMany({
      where: { ...(anno > 0 ? { anno: { in: [anno - 1, anno] } } : {}), origine: { not: "sales" } },
      include: {
        cliente: { select: { id: true, nome: true } },
        acconti: { select: { id: true, importo: true } },
        abbinamentiBancari: { select: { accontoId: true, importo: true } },
      },
      orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
    }),
    prisma.movimentoBancario.findMany({
      where: {
        importo: { gt: 0 },
        ...(anno > 0
          ? { dataContabile: { gte: new Date(Date.UTC(anno, 0, 1)), lt: new Date(Date.UTC(anno + 1, 0, 1)) } }
          : {}),
      },
      include: INCLUDE_MOVIMENTO,
      orderBy: [{ dataContabile: "desc" }, { id: "desc" }],
    }),
    caricaContestoEntrate(prisma, anni.length ? anni : [new Date().getFullYear()]),
  ]);

  const perCliente = new Map<string, ClienteBoard>();
  for (const f of fatture) {
    const nome = f.cliente?.nome ?? "Senza cliente";
    const accontiBanca = new Set(f.abbinamentiBancari.map((a) => a.accontoId).filter((x): x is number => x !== null));
    const incassatoFuori = f.acconti.filter((a) => !accontiBanca.has(a.id)).reduce((t, a) => t + a.importo, 0);
    const coperturaBanca = f.abbinamentiBancari.reduce((t, a) => t + a.importo, 0);
    const c = perCliente.get(nome) ?? { id: f.cliente?.id ?? null, nome, fatture: [] };
    c.fatture.push({
      id: f.id,
      numero: f.numero,
      data: (f.data ?? new Date(Date.UTC(f.anno, f.mese - 1, 1))).toISOString(),
      mese: f.mese,
      anno: f.anno,
      importo: f.importo,
      azienda: f.azienda,
      // segnata incassata a mano: quello che la banca non copre è stato incassato "fuori"
      incassatoFuori: f.pagato ? Math.max(incassatoFuori, r2(f.importo - coperturaBanca)) : incassatoFuori,
      pagato: f.pagato,
      manuale: f.pagato && incassatoFuori === 0 && coperturaBanca === 0,
    });
    perCliente.set(nome, c);
  }
  const clienti = Array.from(perCliente.values()).sort((a, b) => a.nome.localeCompare(b.nome, "it"));

  const documenti: DocumentoBoard[] = movimenti.map((m) => {
    const links: LinkBoard[] = m.abbinamenti
      .filter((a) => a.fatturaId !== null)
      .map((a) => ({ fatturaId: a.fatturaId!, importo: a.importo }));
    const altroLink = m.abbinamenti.find((a) => a.altroIngresso);
    const proposta = m.stato === "da_abbinare" ? suggerisciEntrata(m, ctx) : null;
    const top = proposta?.candidati[0];
    return {
      id: m.id,
      data: m.dataContabile.toISOString(),
      valore: m.importo,
      label: pulisci(m.beneficiario) || pulisci(m.concetto),
      details: [m.beneficiario ? m.concetto : null, m.osservazioni].map(pulisci).filter(Boolean).join(" · "),
      links,
      escluso: m.stato === "escluso",
      altro: altroLink?.altroIngresso
        ? { id: altroLink.altroIngresso.id, categoria: altroLink.altroIngresso.categoria, importo: altroLink.importo }
        : null,
      hint: top && top.motivi.includes("cliente") ? top.cliente : null,
      proposta,
    };
  });
  return { clienti, documenti };
}

// ─── Incasso ─────────────────────────────────────────────────────────
export interface RichiestaIncasso {
  fatture: { id: number; importo?: number }[];
  altroIngresso?: { categoria: string; descrizione?: string } | null;
}
export class ErroreIncasso extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function incassaMovimento(prisma: PrismaClient, movId: number, richiesta: RichiestaIncasso) {
  const mov = await prisma.movimentoBancario.findUnique({ where: { id: movId }, include: { abbinamenti: true } });
  if (!mov) throw new ErroreIncasso("Movimento non trovato", 404);
  if (mov.importo <= 0) throw new ErroreIncasso("Solo le entrate si incassano");
  if (mov.stato !== "da_abbinare") throw new ErroreIncasso("Movimento già gestito", 409);
  const giaAssegnato = mov.abbinamenti.reduce((t, a) => t + a.importo, 0);
  let resta = r2(mov.importo - giaAssegnato);
  if (resta <= 0) throw new ErroreIncasso("Il bonifico è già tutto assegnato", 409);

  const richieste = richiesta.fatture.filter((r) => r.id > 0);
  const altro = richiesta.altroIngresso ?? null;
  if (!richieste.length && !altro) throw new ErroreIncasso("Indica almeno una fattura o un altro ingresso");

  const fatture = richieste.length
    ? await prisma.fattura.findMany({
        where: { id: { in: richieste.map((r) => r.id) } },
        include: { acconti: { select: { importo: true } }, abbinamentiBancari: { select: { movimentoId: true, importo: true } } },
      })
    : [];
  if (fatture.length !== richieste.length) throw new ErroreIncasso("Fattura non trovata", 404);

  const quote: { fatturaId: number; importo: number; primaPagato: boolean; giaIncassata: boolean }[] = [];
  for (const r of richieste) {
    const f = fatture.find((x) => x.id === r.id)!;
    const incassato = f.acconti.reduce((t, a) => t + a.importo, 0);
    const coperturaBanca = f.abbinamentiBancari.reduce((t, a) => t + a.importo, 0);
    const giaIncassata = f.pagato && incassato === 0 && coperturaBanca === 0;
    const residuo = giaIncassata ? f.importo : Math.max(0, f.importo - incassato);
    let importo = r.importo !== undefined && r.importo > 0 ? Math.min(r.importo, residuo) : residuo;
    importo = r2(Math.min(importo, resta));
    if (importo <= 0) continue;
    quote.push({ fatturaId: f.id, importo, primaPagato: f.pagato, giaIncassata });
    resta = r2(resta - importo);
  }
  if (richieste.length && !quote.length) throw new ErroreIncasso("Le fatture scelte non hanno residuo da incassare", 409);
  const quotaAltro = altro && resta > 0 ? resta : 0;
  if (altro && quotaAltro <= 0 && !quote.length) throw new ErroreIncasso("Niente da registrare come altro ingresso", 409);

  const descrizioneMov = [mov.concetto, mov.beneficiario, mov.osservazioni].map(pulisci).filter(Boolean).join(" · ");
  const { mese, anno } = meseAnno(mov.dataContabile);
  const cambiati: { fatturaId: number; primaPagato: boolean }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const q of quote) {
      const acconto = await tx.acconto.create({
        data: {
          fatturaId: q.fatturaId,
          importo: q.importo,
          data: mov.dataContabile,
          metodoPagamento: "Bonifico",
          note: `${NOTA_BANCA} #${mov.id}${q.giaIncassata ? ` · ${NOTA_GIA_INCASSATA}` : ""} · ${descrizioneMov}`.slice(0, 500),
        },
      });
      await tx.abbinamentoBancario.create({
        data: { movimentoId: mov.id, fatturaId: q.fatturaId, accontoId: acconto.id, importo: q.importo },
      });
      if (!q.primaPagato) {
        const f = await tx.fattura.findUnique({ where: { id: q.fatturaId }, include: { acconti: { select: { importo: true } } } });
        const tot = f!.acconti.reduce((t, a) => t + a.importo, 0);
        if (centesimi(tot) + 5 >= centesimi(f!.importo)) {
          await tx.fattura.update({ where: { id: q.fatturaId }, data: { pagato: true, metodo: f!.metodo ?? "Bonifico" } });
          cambiati.push({ fatturaId: q.fatturaId, primaPagato: false });
        }
      }
    }
    if (altro && quotaAltro > 0) {
      const ai = await tx.altroIngresso.create({
        data: {
          fonte: pulisci(mov.beneficiario) || pulisci(mov.concetto) || "Banca",
          categoria: altro.categoria,
          azienda: "Spagna",
          descrizione: pulisci(altro.descrizione) || descrizioneMov.slice(0, 200) || null,
          mese,
          anno,
          importo: quotaAltro,
          incassato: true,
          dataIncasso: mov.dataContabile,
        },
      });
      await tx.abbinamentoBancario.create({ data: { movimentoId: mov.id, altroIngressoId: ai.id, importo: quotaAltro } });
      resta = 0;
    }
    await tx.movimentoBancario.update({
      where: { id: mov.id },
      data: {
        stato: resta <= 0.009 ? "abbinato" : "da_abbinare",
        nota: resta > 0.009 ? `Residuo da assegnare: ${resta.toFixed(2)} €` : null,
      },
    });
  });
  for (const c of cambiati) await dopoCambioIncasso(prisma, c.fatturaId, c.primaPagato);
  return prisma.movimentoBancario.findUnique({ where: { id: mov.id }, include: INCLUDE_MOVIMENTO });
}

// ─── Scollega (tutto il movimento, o una sola fattura) ──────────────
// Gli acconti e gli altri ingressi nati dal collegamento spariscono con
// esso; la fattura torna "in attesa" solo se l'incasso da banca era l'unico
// (quelle già segnate incassate a mano restano tali).
export async function scollegaMovimento(prisma: PrismaClient, movId: number, fatturaId?: number) {
  const link = await prisma.abbinamentoBancario.findMany({
    where: { movimentoId: movId, ...(fatturaId ? { fatturaId } : {}) },
    include: { acconto: { select: { id: true, fatturaId: true, note: true } } },
  });
  const accontiIds = link.map((l) => l.accontoId).filter((x): x is number => x !== null);
  const altriIds = link.map((l) => l.altroIngressoId).filter((x): x is number => x !== null);
  const fattureIds = Array.from(new Set(link.map((l) => l.fatturaId).filter((x): x is number => x !== null)));
  const giaIncassate = new Set(link.filter((l) => l.acconto?.note?.includes(NOTA_GIA_INCASSATA)).map((l) => l.fatturaId));
  const cambiate: { fatturaId: number; primaPagato: boolean }[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.abbinamentoBancario.deleteMany({ where: { id: { in: link.map((l) => l.id) } } });
    if (accontiIds.length) await tx.acconto.deleteMany({ where: { id: { in: accontiIds } } });
    if (altriIds.length) await tx.altroIngresso.deleteMany({ where: { id: { in: altriIds } } });
    for (const fid of fattureIds) {
      if (giaIncassate.has(fid)) continue;
      const f = await tx.fattura.findUnique({ where: { id: fid }, include: { acconti: { select: { importo: true } } } });
      if (!f || !f.pagato) continue;
      const tot = f.acconti.reduce((t, a) => t + a.importo, 0);
      if (centesimi(tot) + 5 < centesimi(f.importo)) {
        await tx.fattura.update({ where: { id: fid }, data: { pagato: false } });
        cambiate.push({ fatturaId: fid, primaPagato: true });
      }
    }
    const restanti = await tx.abbinamentoBancario.findMany({ where: { movimentoId: movId } });
    const mov = await tx.movimentoBancario.findUnique({ where: { id: movId } });
    const assegnato = restanti.reduce((t, a) => t + a.importo, 0);
    const resta = mov ? r2(mov.importo - assegnato) : 0;
    await tx.movimentoBancario.update({
      where: { id: movId },
      data: { stato: "da_abbinare", nota: restanti.length && resta > 0.009 ? `Residuo da assegnare: ${resta.toFixed(2)} €` : null },
    });
  });
  for (const c of cambiate) await dopoCambioIncasso(prisma, c.fatturaId, c.primaPagato);
  return prisma.movimentoBancario.findUnique({ where: { id: movId }, include: INCLUDE_MOVIMENTO });
}

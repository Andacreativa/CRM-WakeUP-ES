// Banca → registro pagamenti dei dipendenti. Riconosce nei movimenti in
// uscita i pagamenti delle persone e li divide in righe del registro:
// - nomina («Nomina Leonardo Mestre - Marzo 2026»): stipendio della persona,
//   mese dal testo (se quel mese è già pagato, il mese della data);
// - TGSS: Seguridad Social della persona con quell'importo, mese dell'addebito;
// - addebito Metropolitan: una sola spesa (Ufficio, come la fattura) che paga
//   i benefit delle persone, divisi in parti uguali, mese dell'addebito;
// - AEAT a gennaio/aprile/luglio/ottobre: una sola spesa Tasse (l'addebito)
//   che paga l'IRPF del trimestre prima, per persona e mese.
// Stipendio e Seguridad Social hanno la loro spesa per riga; benefit e IRPF
// no: il costo sta nella spesa unica (in Spese, Bilancio e Informe resta una
// riga sola). Le righe già nel registro e non ancora viste in banca si
// collegano; le altre si creano alla conferma.
import type { Prisma, PrismaClient } from "@prisma/client";
import { nomeCompleto, vociDiTipo, type Voce } from "./dipendenti";
import { CATEGORIE_SPESA, fmt } from "./constants";
import type { CoperturaRegistro, PropostaRegistro, RigaRegistroBanca, VoceRegistroBanca } from "./banca-shared";

type Db = PrismaClient | Prisma.TransactionClient;

// Fornitore che paga i benefit delle persone (una fattura per tutti)
export const BENEFIT_RE = /METROPOLITAN/i;

export interface PersonaRegistro {
  id: number;
  nome: string;
  tipo: string;
  attivo: boolean;
  seguridadSocial: number;
  irpfImporto: number;
  benefitMensili: number;
}
export interface RigaRegistroCtx {
  id: number;
  dipendenteId: number;
  voce: string;
  anno: number;
  mese: number;
  importo: number;
  spesaId: number | null;
  coperturaId: number | null;
  inBanca: boolean; // la sua spesa (o la spesa unica che la paga) è collegata alla banca
}
export interface ContestoRegistro {
  persone: PersonaRegistro[];
  righe: RigaRegistroCtx[];
  // righe del registro già proposte a un movimento precedente
  usate: Set<number>;
  // persona:voce:anno:mese già pagati in banca (o proposti prima)
  occupati: Set<string>;
}

const VOCI_UNICHE = new Set(["stipendio", "seguridad", "irpf", "benefit"]);
const chiave = (dip: number, voce: string, anno: number, mese: number) => `${dip}:${voce}:${anno}:${mese}`;
const cent = (n: number) => Math.round(Math.abs(n) * 100);

export async function caricaContestoRegistro(db: Db, anni: number[]): Promise<ContestoRegistro> {
  const conBanca = { select: { _count: { select: { abbinamentiBancari: true } } } } as const;
  const [persone, righe] = await Promise.all([
    db.dipendente.findMany({
      select: {
        id: true,
        nome: true,
        cognome: true,
        tipo: true,
        attivo: true,
        seguridadSocial: true,
        irpfImporto: true,
        benefitMensili: true,
      },
      orderBy: { id: "asc" },
    }),
    anni.length
      ? db.pagamentoMensile.findMany({
          where: { anno: { in: anni }, voce: { in: ["stipendio", "seguridad", "irpf", "benefit", "rimborsi"] } },
          select: {
            id: true,
            dipendenteId: true,
            voce: true,
            anno: true,
            mese: true,
            importo: true,
            spesaId: true,
            spesaCoperturaId: true,
            spesa: conBanca,
            spesaCopertura: conBanca,
          },
          orderBy: [{ anno: "asc" }, { mese: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const ctx: ContestoRegistro = {
    persone: persone.map((p) => ({
      id: p.id,
      nome: nomeCompleto(p),
      tipo: p.tipo,
      attivo: p.attivo,
      seguridadSocial: p.seguridadSocial,
      irpfImporto: p.irpfImporto,
      benefitMensili: p.benefitMensili,
    })),
    righe: righe.map((r) => ({
      id: r.id,
      dipendenteId: r.dipendenteId,
      voce: r.voce,
      anno: r.anno,
      mese: r.mese,
      importo: r.importo,
      spesaId: r.spesaId,
      coperturaId: r.spesaCoperturaId,
      inBanca:
        (r.spesa?._count.abbinamentiBancari ?? 0) > 0 || (r.spesaCopertura?._count.abbinamentiBancari ?? 0) > 0,
    })),
    usate: new Set(),
    occupati: new Set(),
  };
  for (const r of ctx.righe) {
    if (r.inBanca && VOCI_UNICHE.has(r.voce)) ctx.occupati.add(chiave(r.dipendenteId, r.voce, r.anno, r.mese));
  }
  return ctx;
}

const MESI_NOMI: Record<string, number> = {
  enero: 1, gennaio: 1, febrero: 2, febbraio: 2, marzo: 3, abril: 4, aprile: 4, mayo: 5, maggio: 5,
  junio: 6, giugno: 6, julio: 7, luglio: 7, agosto: 8, septiembre: 9, setiembre: 9, settembre: 9,
  octubre: 10, ottobre: 10, noviembre: 11, novembre: 11, diciembre: 12, dicembre: 12,
};
const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const periodoTesto = (m: number, a: number) => `${MESI_BREVI[m - 1]} ${String(a).slice(2)}`;

// Divide un importo in n parti uguali al centesimo (i primi prendono il resto)
export function dividiInParti(importo: number, n: number): number[] {
  const tot = cent(importo);
  const base = Math.floor(tot / n);
  const extra = tot - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

interface InfoMovimento {
  importo: number;
  dataContabile: Date;
  categoria: string; // categoria proposta (regola, memoria)
  fornitore: string; // fornitore proposto
  descrizione: string; // descrizione proposta (osservazioni)
  persona: { id: number; nome: string } | null; // citata nel testo
  testo: string;
  testoN: string; // testo normalizzato
}

export function proponiRegistro(info: InfoMovimento, ctx: ContestoRegistro): PropostaRegistro | null {
  const mm = info.dataContabile.getUTCMonth() + 1;
  const aa = info.dataContabile.getUTCFullYear();
  const totale = cent(info.importo);
  const haVoce = (p: PersonaRegistro, v: Voce) => vociDiTipo(p.tipo).includes(v);
  const libera = (dip: number, voce: string, anno: number, mese: number) =>
    ctx.righe.find(
      (x) =>
        x.dipendenteId === dip && x.voce === voce && x.anno === anno && x.mese === mese && !x.inBanca && !ctx.usate.has(x.id),
    ) ?? null;
  const riga = (
    p: PersonaRegistro,
    voce: VoceRegistroBanca,
    mese: number,
    anno: number,
    importo: number,
    esistente: RigaRegistroCtx | null,
    nuova = false,
  ): RigaRegistroBanca => ({
    dipendenteId: p.id,
    nome: p.nome,
    voce,
    mese,
    anno,
    importo: Math.round(importo * 100) / 100,
    pagamentoId: esistente?.id ?? null,
    importoRegistro: esistente && cent(esistente.importo) !== cent(importo) ? esistente.importo : null,
    ...(nuova ? { nuova: true } : {}),
  });
  // Le righe proposte non si ripropongono ai movimenti successivi
  const riserva = (righe: RigaRegistroBanca[]) => {
    for (const r of righe) {
      if (r.pagamentoId) ctx.usate.add(r.pagamentoId);
      if (!r.nuova) ctx.occupati.add(chiave(r.dipendenteId, r.voce, r.anno, r.mese));
    }
  };
  const spesaUnica = (categoria: string, fornitore: string, descrizione: string): CoperturaRegistro => ({
    spesaId: null,
    categoria,
    fornitore,
    descrizione,
    mese: mm,
    anno: aa,
  });

  // ── Stipendio ──
  if (info.persona && (info.categoria === "Stipendio" || /\bNOMINAS?\b/i.test(info.testo))) {
    const p = ctx.persone.find((x) => x.id === info.persona!.id);
    if (!p || !haVoce(p, "stipendio")) return null;
    const integrazione = /DIFERENCIA|ATRASOS|REGULARIZACI|INTEGRAZION|DIFFERENZA/i.test(info.testo);
    const mesi = info.testoN.split(" ").map((w) => MESI_NOMI[w]).filter(Boolean);
    const annoTesto = parseInt(info.testo.match(/\b(20\d{2})\b/)?.[1] ?? "", 10) || 0;
    const opzioni: { mese: number; anno: number }[] = [];
    if (mesi.length) {
      const mese = mesi[mesi.length - 1];
      // «Nomina diciembre» pagata a gennaio: dicembre dell'anno prima
      opzioni.push({ mese, anno: annoTesto || (mese > mm + 1 ? aa - 1 : aa) });
    }
    if (!opzioni.some((o) => o.mese === mm && o.anno === aa)) opzioni.push({ mese: mm, anno: aa });
    let scelto = integrazione
      ? opzioni[0]
      : opzioni.find((o) => !ctx.occupati.has(chiave(p.id, "stipendio", o.anno, o.mese)));
    let nuova = integrazione;
    let certa = true;
    let nota = "";
    if (!scelto) {
      scelto = { mese: mm, anno: aa };
      nuova = true;
      certa = false;
      nota = "lo stipendio di questo mese risulta già pagato in banca: sarebbe una riga in più";
    } else {
      nota = `${integrazione ? "integrazione dello stipendio" : "stipendio"} di ${periodoTesto(scelto.mese, scelto.anno)}`;
    }
    const esistente = nuova ? null : libera(p.id, "stipendio", scelto.anno, scelto.mese);
    const righe = [riga(p, "stipendio", scelto.mese, scelto.anno, totale / 100, esistente, nuova)];
    riserva(righe);
    return { tipo: "stipendio", righe, copertura: null, certa, nota };
  }

  // ── Seguridad Social ──
  if (info.categoria === "Seguridad Social" || /\bTGSS\b|SEGURIDAD SOCIAL/i.test(info.testo)) {
    const conVoce = ctx.persone.filter((p) => haVoce(p, "seguridad"));
    // prima una riga del registro del mese con lo stesso importo
    let esistente =
      ctx.righe.find(
        (r) =>
          r.voce === "seguridad" &&
          r.anno === aa &&
          r.mese === mm &&
          !r.inBanca &&
          !ctx.usate.has(r.id) &&
          cent(r.importo) === totale &&
          (!info.persona || r.dipendenteId === info.persona.id),
      ) ?? null;
    let p = esistente ? conVoce.find((x) => x.id === esistente!.dipendenteId) : undefined;
    if (!p) {
      // poi la persona con quell'importo in scheda
      const perImporto = conVoce.filter(
        (x) => x.attivo && cent(x.seguridadSocial) === totale && !ctx.occupati.has(chiave(x.id, "seguridad", aa, mm)),
      );
      p = info.persona
        ? conVoce.find((x) => x.id === info.persona!.id)
        : perImporto.length === 1
          ? perImporto[0]
          : undefined;
      esistente = p ? libera(p.id, "seguridad", aa, mm) : null;
    }
    if (!p) return null;
    const righe = [riga(p, "seguridad", mm, aa, totale / 100, esistente)];
    riserva(righe);
    return { tipo: "seguridad", righe, copertura: null, certa: true, nota: `Seguridad Social di ${periodoTesto(mm, aa)}` };
  }

  // ── Benefit: una fattura per tutti (Metropolitan) ──
  if (!info.persona && (BENEFIT_RE.test(info.testo) || info.categoria === "Benefit")) {
    const conBenefit = ctx.persone.filter(
      (p) => haVoce(p, "benefit") && ((p.attivo && p.benefitMensili > 0) || !!libera(p.id, "benefit", aa, mm)),
    );
    if (!conBenefit.length) return null;
    const libere = conBenefit.filter((p) => !ctx.occupati.has(chiave(p.id, "benefit", aa, mm)));
    const persone = libere.length ? libere : conBenefit;
    const parti = dividiInParti(totale / 100, persone.length);
    const righe = persone.map((p, i) => riga(p, "benefit", mm, aa, parti[i], libera(p.id, "benefit", aa, mm)));
    riserva(righe);
    const certa = libere.length === conBenefit.length;
    return {
      tipo: "benefit",
      righe,
      copertura: spesaUnica(info.categoria, info.fornitore, info.descrizione),
      certa,
      nota: certa
        ? `benefit di ${periodoTesto(mm, aa)} di ${persone.length} person${persone.length === 1 ? "a" : "e"}`
        : "benefit di questo mese già pagato in banca: controlla mese e persone",
    };
  }

  // ── IRPF del trimestre (modello 111, addebito AEAT) ──
  if (info.categoria === "Tasse" && [1, 4, 7, 10].includes(mm) && !/CANARIA|DEVOLUCI/i.test(info.testo)) {
    const q = mm === 1 ? 4 : (mm - 1) / 3;
    const annoQ = mm === 1 ? aa - 1 : aa;
    const mesiQ = [3 * q - 2, 3 * q - 1, 3 * q];
    const conIrpf = ctx.persone.filter(
      (p) =>
        haVoce(p, "irpf") &&
        ((p.attivo && p.irpfImporto > 0) ||
          ctx.righe.some((r) => r.dipendenteId === p.id && r.voce === "irpf" && r.anno === annoQ && mesiQ.includes(r.mese))),
    );
    const righe: RigaRegistroBanca[] = [];
    for (const p of conIrpf) {
      for (const mese of mesiQ) {
        if (ctx.occupati.has(chiave(p.id, "irpf", annoQ, mese))) continue;
        const esistente = libera(p.id, "irpf", annoQ, mese);
        const importo = esistente ? esistente.importo : p.irpfImporto;
        if (importo > 0) righe.push(riga(p, "irpf", mese, annoQ, importo, esistente));
      }
    }
    if (!righe.length) return null;
    const restoCent = totale - righe.reduce((t, r) => t + cent(r.importo), 0);
    const trimestre = `${q}º trimestre ${annoQ}`;
    const certa = restoCent >= 0 && restoCent <= Math.max(5000, totale * 0.05);
    if (certa) riserva(righe);
    return {
      tipo: "irpf",
      righe,
      copertura: spesaUnica("Tasse", info.fornitore || "Agencia Tributaria", `Retenciones ${trimestre} (mod. 111)`),
      certa,
      nota:
        restoCent < 0
          ? `IRPF ${trimestre}: le righe superano l'addebito di ${fmt(-restoCent / 100)}, correggi gli importi`
          : `IRPF ${trimestre}${restoCent > 0 ? ` · ${fmt(restoCent / 100)} di altre ritenute nell'addebito` : ""}`,
    };
  }
  return null;
}

// ─── Conferma: il movimento paga queste righe del registro ───────────
export interface RigaInput {
  dipendenteId: number;
  voce: VoceRegistroBanca;
  mese: number;
  anno: number;
  importo: number;
  pagamentoId?: number | null;
  nuova?: boolean;
}
export class ErroreRegistro extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const VOCE_CATEGORIA: Record<VoceRegistroBanca, string> = {
  stipendio: "Stipendio",
  seguridad: "Seguridad Social",
  irpf: "Tasse",
  benefit: "Benefit",
  rimborsi: "Rimborsi",
};
const VOCE_LABEL: Record<VoceRegistroBanca, string> = {
  stipendio: "Stipendio",
  seguridad: "Seguridad Social",
  irpf: "IRPF",
  benefit: "Benefit",
  rimborsi: "Rimborsi",
};

// Collega il movimento (uscita da rivedere) alle righe del registro.
// Senza spesa unica: ogni riga ha la sua spesa (quelle già nel registro e
// non ancora viste in banca si collegano con l'importo della banca, le altre
// nascono) e la somma deve tornare con il movimento.
// Con la spesa unica (`copertura`): una sola spesa con l'importo del
// movimento (già registrata o nuova) paga le righe, che restano senza spesa
// propria; se una riga ne aveva una (registrata a mano), quella va via.
export async function collegaRegistro(
  prisma: PrismaClient,
  movId: number,
  righeIn: RigaInput[],
  coperturaIn: CoperturaRegistro | null,
) {
  const mov = await prisma.movimentoBancario.findUnique({
    where: { id: movId },
    include: { abbinamenti: true },
  });
  if (!mov) throw new ErroreRegistro("Movimento non trovato", 404);
  if (mov.importo >= 0) throw new ErroreRegistro("Solo le uscite vanno nel registro pagamenti");
  if (mov.stato !== "da_abbinare" || mov.abbinamenti.length) throw new ErroreRegistro("Movimento già gestito", 409);
  if (!righeIn.length) throw new ErroreRegistro("Nessuna riga del registro");

  const righe = righeIn.map((r) => ({
    ...r,
    importo: Math.round((Number(r.importo) || 0) * 100) / 100,
    mese: Number(r.mese) || 0,
    anno: Number(r.anno) || 0,
    dipendenteId: Number(r.dipendenteId) || 0,
    pagamentoId: r.pagamentoId ? Number(r.pagamentoId) : null,
  }));
  for (const r of righe) {
    if (!(r.voce in VOCE_CATEGORIA)) throw new ErroreRegistro("Voce non valida");
    if (!r.dipendenteId) throw new ErroreRegistro("Manca la persona in una riga");
    if (r.importo <= 0) throw new ErroreRegistro("Importo non valido in una riga");
    if (r.mese < 1 || r.mese > 12 || r.anno < 2000 || r.anno > 2100) throw new ErroreRegistro("Mese non valido");
  }
  const somma = righe.reduce((t, r) => t + cent(r.importo), 0);
  const importoMov = cent(mov.importo);
  const unica = coperturaIn
    ? {
        spesaId: coperturaIn.spesaId ? Number(coperturaIn.spesaId) : null,
        categoria: String(coperturaIn.categoria ?? ""),
        fornitore: String(coperturaIn.fornitore ?? "").trim(),
        descrizione: String(coperturaIn.descrizione ?? "").trim() || null,
        mese: Number(coperturaIn.mese) || mov.dataContabile.getUTCMonth() + 1,
        anno: Number(coperturaIn.anno) || mov.dataContabile.getUTCFullYear(),
      }
    : null;
  if (unica) {
    if (somma > importoMov + 1) {
      throw new ErroreRegistro(`Le righe (${fmt(somma / 100)}) superano il movimento (${fmt(importoMov / 100)})`, 409);
    }
    if (unica.spesaId) {
      const s = await prisma.spesa.findUnique({
        where: { id: unica.spesaId },
        include: { _count: { select: { abbinamentiBancari: true } }, pagamentoMensile: { select: { id: true } } },
      });
      if (!s) throw new ErroreRegistro("Spesa non trovata", 404);
      if (s._count.abbinamentiBancari) throw new ErroreRegistro(`La spesa #${s.id} è già collegata a un altro movimento`, 409);
      if (s.pagamentoMensile) throw new ErroreRegistro(`La spesa #${s.id} è una riga del registro`, 409);
      if (Math.abs(cent(s.importo) - importoMov) > 5) {
        throw new ErroreRegistro(`Importi diversi: movimento ${fmt(importoMov / 100)}, spesa ${fmt(s.importo)}`, 409);
      }
    } else {
      if (!CATEGORIE_SPESA.includes(unica.categoria)) throw new ErroreRegistro("Categoria della spesa non valida");
      if (!unica.fornitore) throw new ErroreRegistro("Fornitore della spesa mancante");
    }
  } else if (Math.abs(somma - importoMov) > 1) {
    throw new ErroreRegistro(
      `La somma delle righe (${fmt(somma / 100)}) non torna con il movimento (${fmt(importoMov / 100)})`,
      409,
    );
  }

  const persone = await prisma.dipendente.findMany({
    where: { id: { in: Array.from(new Set(righe.map((r) => r.dipendenteId))) } },
    select: { id: true, nome: true, cognome: true },
  });
  const nomi = new Map(persone.map((p) => [p.id, nomeCompleto(p)]));
  if (nomi.size !== new Set(righe.map((r) => r.dipendenteId)).size) throw new ErroreRegistro("Persona non trovata", 404);

  // Righe del registro di quelle persone e mesi, con lo stato in banca
  const conBanca = { select: { id: true, importo: true, _count: { select: { abbinamentiBancari: true } } } } as const;
  const esistenti = await prisma.pagamentoMensile.findMany({
    where: {
      OR: righe.map((r) => ({ dipendenteId: r.dipendenteId, voce: r.voce, anno: r.anno, mese: r.mese })),
    },
    include: { spesa: conBanca, spesaCopertura: conBanca },
    orderBy: { id: "asc" },
  });
  const inBanca = (pm: (typeof esistenti)[number]) =>
    (pm.spesa?._count.abbinamentiBancari ?? 0) > 0 || (pm.spesaCopertura?._count.abbinamentiBancari ?? 0) > 0;
  const prese = new Set<number>();
  const piano = righe.map((r) => {
    let pm = r.pagamentoId ? esistenti.find((x) => x.id === r.pagamentoId) : undefined;
    if (r.pagamentoId) {
      if (!pm || pm.dipendenteId !== r.dipendenteId || pm.voce !== r.voce || pm.anno !== r.anno || pm.mese !== r.mese) {
        throw new ErroreRegistro("Riga del registro cambiata nel frattempo: ricarica la pagina", 409);
      }
      if (inBanca(pm)) throw new ErroreRegistro(`${VOCE_LABEL[r.voce]} di ${nomi.get(r.dipendenteId)}: già collegata alla banca`, 409);
    } else if (!r.nuova && r.voce !== "rimborsi") {
      // una voce unica del mese già registrata (e non in banca) si collega, mai doppia
      pm = esistenti.find(
        (x) =>
          x.dipendenteId === r.dipendenteId && x.voce === r.voce && x.anno === r.anno && x.mese === r.mese && !inBanca(x) && !prese.has(x.id),
      );
    }
    if (pm) {
      if (prese.has(pm.id)) throw new ErroreRegistro("La stessa riga del registro compare due volte", 409);
      prese.add(pm.id);
    }
    return { r, pm: pm ?? null };
  });

  const dataIt = mov.dataContabile.toLocaleDateString("it-IT", { timeZone: "UTC" });
  const nota = `Da estratto conto BBVA del ${dataIt}`;

  if (unica) {
    return prisma.$transaction(
      async (tx) => {
        const spesaId =
          unica.spesaId ??
          (
            await tx.spesa.create({
              data: {
                azienda: "Spagna",
                fornitore: unica.fornitore,
                categoria: unica.categoria,
                descrizione: unica.descrizione,
                note: nota,
                mese: unica.mese,
                anno: unica.anno,
                importo: importoMov / 100,
              },
              select: { id: true },
            })
          ).id;
        // righe già nel registro: pagate dalla spesa unica, via la spesa propria
        const proprie = piano.filter((x) => x.pm?.spesaId).map((x) => x.pm!.spesaId!);
        for (const x of piano.filter((y) => y.pm)) {
          await tx.pagamentoMensile.update({
            where: { id: x.pm!.id },
            data: { spesaId: null, spesaCoperturaId: spesaId, importo: x.r.importo, data: mov.dataContabile },
          });
        }
        if (proprie.length) await tx.spesa.deleteMany({ where: { id: { in: proprie } } });
        const daCreare = piano.filter((x) => !x.pm);
        if (daCreare.length) {
          await tx.pagamentoMensile.createMany({
            data: daCreare.map((x) => ({
              dipendenteId: x.r.dipendenteId,
              anno: x.r.anno,
              mese: x.r.mese,
              voce: x.r.voce,
              importo: x.r.importo,
              data: mov.dataContabile,
              note: unica.fornitore || null,
              spesaCoperturaId: spesaId,
            })),
          });
        }
        await tx.abbinamentoBancario.create({ data: { movimentoId: mov.id, spesaId, importo: importoMov / 100 } });
        return tx.movimentoBancario.update({
          where: { id: mov.id },
          data: { stato: unica.spesaId ? "abbinato" : "spesa_creata" },
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }

  // Una spesa per riga
  const nuove = piano.filter((x) => !x.pm || !x.pm.spesaId);
  const collegate = piano.filter((x) => x.pm && x.pm.spesaId);
  return prisma.$transaction(
    async (tx) => {
      // 1. Righe già nel registro: importo della banca e data del pagamento
      const cambiate = collegate.filter(
        (x) => cent(x.pm!.importo) !== cent(x.r.importo) || cent(x.pm!.spesa?.importo ?? 0) !== cent(x.r.importo),
      );
      for (const x of cambiate) {
        await tx.pagamentoMensile.update({ where: { id: x.pm!.id }, data: { importo: x.r.importo, data: mov.dataContabile } });
        await tx.spesa.update({ where: { id: x.pm!.spesaId! }, data: { importo: x.r.importo } });
      }
      const soloData = collegate.filter((x) => !cambiate.includes(x)).map((x) => x.pm!.id);
      if (soloData.length) {
        await tx.pagamentoMensile.updateMany({ where: { id: { in: soloData } }, data: { data: mov.dataContabile } });
      }

      // 2. Righe nuove: spesa + riga del registro
      const dati = nuove.map(({ r }) => ({
        azienda: "Spagna",
        fornitore: nomi.get(r.dipendenteId)!,
        categoria: VOCE_CATEGORIA[r.voce],
        descrizione: `${VOCE_LABEL[r.voce]} — ${nomi.get(r.dipendenteId)}${r.nuova ? " — integrazione" : ""}`,
        note: nota,
        mese: r.mese,
        anno: r.anno,
        importo: r.importo,
      }));
      const create = dati.length
        ? await tx.spesa.createManyAndReturn({
            data: dati,
            select: { id: true, fornitore: true, categoria: true, descrizione: true, mese: true, anno: true, importo: true },
          })
        : [];
      // abbina ogni dato alla spesa creata (stessi campi), senza contare sull'ordine
      const libere = [...create];
      const spesaDi = dati.map((d) => {
        const i = libere.findIndex(
          (s) =>
            s.fornitore === d.fornitore && s.categoria === d.categoria && s.descrizione === d.descrizione &&
            s.mese === d.mese && s.anno === d.anno && cent(s.importo) === cent(d.importo),
        );
        if (i < 0) throw new Error("Spesa creata non ritrovata");
        return libere.splice(i, 1)[0].id;
      });
      for (const [i, x] of nuove.entries()) {
        // riga del registro senza spesa: prende quella nuova
        if (x.pm) {
          await tx.pagamentoMensile.update({
            where: { id: x.pm.id },
            data: { spesaId: spesaDi[i], spesaCoperturaId: null, importo: x.r.importo, data: mov.dataContabile },
          });
        }
      }
      const daCreare = nuove.map((x, i) => ({ x, i })).filter(({ x }) => !x.pm);
      if (daCreare.length) {
        await tx.pagamentoMensile.createMany({
          data: daCreare.map(({ x, i }) => ({
            dipendenteId: x.r.dipendenteId,
            anno: x.r.anno,
            mese: x.r.mese,
            voce: x.r.voce,
            importo: x.r.importo,
            data: mov.dataContabile,
            note: mov.osservazioni ?? null,
            spesaId: spesaDi[i],
          })),
        });
      }

      // 3. Collegamenti col movimento
      const links = [
        ...collegate.map((x) => ({ movimentoId: mov.id, spesaId: x.pm!.spesaId!, importo: x.r.importo })),
        ...dati.map((d, i) => ({ movimentoId: mov.id, spesaId: spesaDi[i], importo: d.importo })),
      ];
      await tx.abbinamentoBancario.createMany({ data: links });
      return tx.movimentoBancario.update({
        where: { id: mov.id },
        data: { stato: dati.length ? "spesa_creata" : "abbinato" },
      });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

// ─── Fattura dei benefit inserita a mano (o creata dalla banca) ──────
// Una spesa del fornitore dei benefit (Metropolitan) paga i benefit del
// mese delle persone, divisi in parti uguali: righe del registro senza spesa
// propria. Le persone sono quelle già pagate da questa spesa, altrimenti chi
// ha il benefit in scheda. Una riga del mese con spesa propria (registrata a
// mano, non in banca) passa a questa spesa; chi ha già il benefit pagato da
// un'altra spesa o in banca resta fuori.
export async function allineaCoperturaBenefit(db: Db, spesaId: number) {
  const spesa = await db.spesa.findUnique({
    where: { id: spesaId },
    include: { righeCoperte: true, pagamentoMensile: { select: { id: true } } },
  });
  if (!spesa) return;
  const coperte = spesa.righeCoperte.filter((r) => r.voce === "benefit");
  if (!BENEFIT_RE.test(spesa.fornitore) || spesa.pagamentoMensile || spesa.importo <= 0) {
    if (coperte.length) await db.pagamentoMensile.deleteMany({ where: { id: { in: coperte.map((r) => r.id) } } });
    return;
  }
  const tutte = await db.dipendente.findMany({ orderBy: { id: "asc" } });
  const giaPagate = new Set(coperte.map((r) => r.dipendenteId));
  const candidate = giaPagate.size
    ? tutte.filter((p) => giaPagate.has(p.id))
    : tutte.filter((p) => p.attivo && p.benefitMensili > 0 && vociDiTipo(p.tipo).includes("benefit"));
  const delMese = await db.pagamentoMensile.findMany({
    where: { voce: "benefit", anno: spesa.anno, mese: spesa.mese, dipendenteId: { in: candidate.map((p) => p.id) } },
    include: {
      spesa: { select: { _count: { select: { abbinamentiBancari: true } } } },
      spesaCopertura: { select: { _count: { select: { abbinamentiBancari: true } } } },
    },
  });
  const piano = candidate
    .map((p) => {
      const mia = coperte.find((r) => r.dipendenteId === p.id);
      if (mia) return { p, pm: mia, propria: null as number | null };
      const altra = delMese.find((r) => r.dipendenteId === p.id);
      if (!altra) return { p, pm: null, propria: null };
      const bloccata =
        (altra.spesa?._count.abbinamentiBancari ?? 0) > 0 ||
        (altra.spesaCoperturaId !== null && altra.spesaCoperturaId !== spesa.id);
      return bloccata ? null : { p, pm: altra, propria: altra.spesaId };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!piano.length) return;
  const parti = dividiInParti(spesa.importo, piano.length);
  for (const [i, x] of piano.entries()) {
    if (x.pm) {
      await db.pagamentoMensile.update({
        where: { id: x.pm.id },
        data: { spesaId: null, spesaCoperturaId: spesa.id, importo: parti[i], anno: spesa.anno, mese: spesa.mese },
      });
      if (x.propria) await db.spesa.deleteMany({ where: { id: x.propria } });
    } else {
      await db.pagamentoMensile.create({
        data: {
          dipendenteId: x.p.id,
          anno: spesa.anno,
          mese: spesa.mese,
          voce: "benefit",
          importo: parti[i],
          note: spesa.fornitore,
          spesaCoperturaId: spesa.id,
        },
      });
    }
  }
  // righe di persone che non ci sono più nel piano: via
  const tenute = new Set(piano.map((x) => x.pm?.id).filter(Boolean));
  const via = coperte.filter((r) => !tenute.has(r.id)).map((r) => r.id);
  if (via.length) await db.pagamentoMensile.deleteMany({ where: { id: { in: via } } });
}

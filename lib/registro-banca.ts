// Banca → registro pagamenti dei dipendenti. Riconosce nei movimenti in
// uscita i pagamenti delle persone e li divide in righe del registro:
// - nomina («Nomina Leonardo Mestre - Marzo 2026»): stipendio della persona,
//   mese dal testo (se quel mese è già pagato, il mese della data);
// - TGSS: Seguridad Social della persona con quell'importo, mese dell'addebito;
// - categoria Benefit senza persona (addebito Metropolitan): benefit diviso
//   in parti uguali tra le persone con benefit, mese dell'addebito;
// - AEAT a gennaio/aprile/luglio/ottobre: IRPF del trimestre prima, per
//   persona e mese; la differenza è una riga a parte (altre ritenute, mod. 111).
// Le righe già presenti nel registro e non ancora viste in banca si
// collegano; le altre si creano (riga + spesa) alla conferma.
import type { Prisma, PrismaClient } from "@prisma/client";
import { nomeCompleto, vociDiTipo, type Voce } from "./dipendenti";
import { fmt } from "./constants";
import type { PropostaRegistro, RigaRegistroBanca, VoceRegistroBanca } from "./banca-shared";

type Db = PrismaClient | Prisma.TransactionClient;

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
  inBanca: boolean;
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
            spesa: { select: { _count: { select: { abbinamentiBancari: true } } } },
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
      inBanca: (r.spesa?._count.abbinamentiBancari ?? 0) > 0,
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
  persona: { id: number; nome: string } | null; // citata nel testo
  testo: string;
  testoN: string; // testo normalizzato
}

export function proponiRegistro(info: InfoMovimento, ctx: ContestoRegistro): PropostaRegistro | null {
  const mm = info.dataContabile.getUTCMonth() + 1;
  const aa = info.dataContabile.getUTCFullYear();
  const totale = cent(info.importo);
  const haVoce = (p: PersonaRegistro, v: Voce) => vociDiTipo(p.tipo).includes(v);
  const libera = (dip: number, voce: string, anno: number, mese: number) => {
    const r = ctx.righe.find(
      (x) =>
        x.dipendenteId === dip && x.voce === voce && x.anno === anno && x.mese === mese && !x.inBanca && !ctx.usate.has(x.id),
    );
    return r ?? null;
  };
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
    return { tipo: "stipendio", righe, resto: null, certa, nota };
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
    return { tipo: "seguridad", righe, resto: null, certa: true, nota: `Seguridad Social di ${periodoTesto(mm, aa)}` };
  }

  // ── Benefit (addebito unico per tutti, es. Metropolitan) ──
  if (info.categoria === "Benefit" && !info.persona) {
    const conBenefit = ctx.persone.filter(
      (p) =>
        haVoce(p, "benefit") &&
        ((p.attivo && p.benefitMensili > 0) || !!libera(p.id, "benefit", aa, mm)),
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
      resto: null,
      certa,
      nota: certa
        ? `benefit di ${periodoTesto(mm, aa)} diviso tra ${persone.length} person${persone.length === 1 ? "a" : "e"}`
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
      resto:
        restoCent > 0
          ? { importo: restoCent / 100, descrizione: `Altre ritenute (mod. 111) · ${trimestre}`, mese: mesiQ[2], anno: annoQ }
          : null,
      certa,
      nota:
        restoCent < 0
          ? `IRPF ${trimestre}: le righe superano l'addebito di ${fmt(-restoCent / 100)}, correggi gli importi`
          : `IRPF ${trimestre}${restoCent > 0 ? ` · ${fmt(restoCent / 100)} di altre ritenute` : ""}`,
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
export interface RestoInput {
  importo: number;
  descrizione: string;
  mese: number;
  anno: number;
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

// Collega il movimento (uscita da rivedere) alle righe del registro: le
// righe già presenti e non ancora viste in banca si collegano (con
// l'importo della banca e la data del pagamento), le altre nascono con la
// loro spesa. Il resto (es. altre ritenute del mod. 111) è una spesa a parte.
// La somma deve tornare con il movimento.
export async function collegaRegistro(
  prisma: PrismaClient,
  movId: number,
  righeIn: RigaInput[],
  restoIn: RestoInput | null,
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
  const resto =
    restoIn && Number(restoIn.importo) > 0
      ? {
          importo: Math.round(Number(restoIn.importo) * 100) / 100,
          descrizione: String(restoIn.descrizione ?? "").trim() || "Altre ritenute (mod. 111)",
          mese: Number(restoIn.mese) || mov.dataContabile.getUTCMonth() + 1,
          anno: Number(restoIn.anno) || mov.dataContabile.getUTCFullYear(),
        }
      : null;
  const somma = righe.reduce((t, r) => t + cent(r.importo), 0) + (resto ? cent(resto.importo) : 0);
  if (Math.abs(somma - cent(mov.importo)) > 1) {
    throw new ErroreRegistro(
      `La somma delle righe (${fmt(somma / 100)}) non torna con il movimento (${fmt(Math.abs(mov.importo))})`,
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
  const esistenti = await prisma.pagamentoMensile.findMany({
    where: {
      OR: righe.map((r) => ({ dipendenteId: r.dipendenteId, voce: r.voce, anno: r.anno, mese: r.mese })),
    },
    include: { spesa: { select: { id: true, importo: true, _count: { select: { abbinamentiBancari: true } } } } },
    orderBy: { id: "asc" },
  });
  const inBanca = (pm: (typeof esistenti)[number]) => (pm.spesa?._count.abbinamentiBancari ?? 0) > 0;
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
  const nuove = piano.filter((x) => !x.pm || !x.pm.spesaId);
  const collegate = piano.filter((x) => x.pm && x.pm.spesaId);

  return prisma.$transaction(
    async (tx) => {
      // 1. Righe già nel registro: importo della banca e data del pagamento
      const cambiate = collegate.filter((x) => cent(x.pm!.importo) !== cent(x.r.importo) || cent(x.pm!.spesa?.importo ?? 0) !== cent(x.r.importo));
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
      if (resto) {
        dati.push({
          azienda: "Spagna",
          fornitore: "Agencia Tributaria",
          categoria: "Tasse",
          descrizione: resto.descrizione,
          note: nota,
          mese: resto.mese,
          anno: resto.anno,
          importo: resto.importo,
        });
      }
      const create = dati.length ? await tx.spesa.createManyAndReturn({ data: dati, select: { id: true, fornitore: true, categoria: true, descrizione: true, mese: true, anno: true, importo: true } }) : [];
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
      const nuoveConPm = nuove.filter((x) => x.pm && !x.pm.spesaId);
      for (const x of nuoveConPm) {
        // riga del registro senza spesa (caso raro): le si dà quella nuova
        const id = spesaDi[nuove.indexOf(x)];
        await tx.pagamentoMensile.update({ where: { id: x.pm!.id }, data: { spesaId: id, importo: x.r.importo, data: mov.dataContabile } });
      }
      const daCreare = nuove.filter((x) => !x.pm);
      if (daCreare.length) {
        await tx.pagamentoMensile.createMany({
          data: daCreare.map((x) => ({
            dipendenteId: x.r.dipendenteId,
            anno: x.r.anno,
            mese: x.r.mese,
            voce: x.r.voce,
            importo: x.r.importo,
            data: mov.dataContabile,
            note: mov.osservazioni ?? null,
            spesaId: spesaDi[nuove.indexOf(x)],
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

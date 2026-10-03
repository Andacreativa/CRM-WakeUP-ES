import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  INCLUDE_MOVIMENTO,
  caricaContestoEntrate,
  caricaContestoSuggerimenti,
  isStatoMovimento,
  meseAnno,
  suggerisci,
  suggerisciEntrata,
  type Suggerimento,
  type SuggerimentoEntrata,
} from "@/lib/banca";

// GET ?anno= (0 = tutti) &mese= &tipo=uscite|entrate &stato=da_abbinare|
// abbinato|spesa_creata|escluso|collegati &q= &suggerimenti=0
// Per le uscite da rivedere allega il suggerimento (categoria, fornitore,
// spese esistenti compatibili).
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const anno = parseInt(sp.get("anno") || "0", 10) || 0;
    const mese = parseInt(sp.get("mese") || "0", 10) || 0;
    const tipo = sp.get("tipo") || "";
    const stato = sp.get("stato") || "";
    const q = (sp.get("q") || "").trim();
    const conSuggerimenti = sp.get("suggerimenti") !== "0";

    // Auto-riparazione: se una Spesa collegata è stata cancellata, il
    // movimento torna da rivedere.
    await prisma.movimentoBancario.updateMany({
      where: { stato: { in: ["abbinato", "spesa_creata"] }, abbinamenti: { none: {} } },
      data: { stato: "da_abbinare" },
    });

    const where: Prisma.MovimentoBancarioWhereInput = {};
    if (anno > 0) {
      const da = mese > 0 ? Date.UTC(anno, mese - 1, 1) : Date.UTC(anno, 0, 1);
      const a = mese > 0 ? Date.UTC(anno, mese, 1) : Date.UTC(anno + 1, 0, 1);
      where.dataContabile = { gte: new Date(da), lt: new Date(a) };
    }
    if (tipo === "uscite") where.importo = { lt: 0 };
    else if (tipo === "entrate") where.importo = { gt: 0 };
    if (stato === "collegati") where.stato = { in: ["abbinato", "spesa_creata"] };
    else if (isStatoMovimento(stato)) where.stato = stato;
    if (q) {
      where.OR = [
        { concetto: { contains: q, mode: "insensitive" } },
        { beneficiario: { contains: q, mode: "insensitive" } },
        { osservazioni: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.movimentoBancario.findMany({
      where,
      include: INCLUDE_MOVIMENTO,
      orderBy: [{ dataContabile: "desc" }, { id: "desc" }],
    });

    const suggerimenti = new Map<number, Suggerimento>();
    const entrate = new Map<number, SuggerimentoEntrata>();
    if (conSuggerimenti) {
      const target = rows.filter((r) => r.importo < 0 && r.stato === "da_abbinare");
      if (target.length) {
        const anni = Array.from(new Set(target.map((r) => meseAnno(r.dataContabile).anno)));
        const ctx = { ...(await caricaContestoSuggerimenti(prisma, anni)), riservate: new Set<number>() };
        // dal più vecchio: le commissioni pagate prima vanno ai movimenti prima
        const perData = [...target].sort((a, b) => a.dataContabile.getTime() - b.dataContabile.getTime() || a.id - b.id);
        for (const r of perData) suggerimenti.set(r.id, suggerisci(r, ctx));
      }
      // Entrate da rivedere (anche quelle assegnate solo in parte): proposte
      // di fatture da incassare o di altro ingresso.
      const targetE = rows.filter((r) => r.importo > 0 && r.stato === "da_abbinare");
      if (targetE.length) {
        const anni = Array.from(new Set(targetE.map((r) => meseAnno(r.dataContabile).anno)));
        const ctx = await caricaContestoEntrate(prisma, anni);
        for (const r of targetE) entrate.set(r.id, suggerisciEntrata(r, ctx));
      }
    }
    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        suggerimento: suggerimenti.get(r.id) ?? null,
        entrata: entrate.get(r.id) ?? null,
      })),
    );
  } catch (e) {
    console.error("[GET /api/banca/movimenti]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

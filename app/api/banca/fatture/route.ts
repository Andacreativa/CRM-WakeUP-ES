import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { caricaContestoEntrate, norm } from "@/lib/banca";
import type { FatturaCandidata } from "@/lib/banca-shared";

// GET ?q=&anno= — fatture che un bonifico può saldare (non ancora collegate a
// un movimento), per la scelta manuale nella riconciliazione. Con q filtra
// per numero o cliente. Le già incassate a mano restano in fondo.
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const q = norm(sp.get("q") || "");
    const anno = parseInt(sp.get("anno") || "0", 10) || new Date().getFullYear();
    const ctx = await caricaContestoEntrate(prisma, [anno]);
    const out: FatturaCandidata[] = [];
    for (const f of ctx.fatture) {
      if (f.abbinamentiBancari.length) continue;
      const testo = norm(`${f.numero ?? ""} ${f.cliente?.nome ?? ""}`);
      if (q && !testo.includes(q)) continue;
      const incassato = f.acconti.reduce((t, a) => t + a.importo, 0);
      out.push({
        id: f.id,
        numero: f.numero,
        cliente: f.cliente?.nome ?? "—",
        clienteId: f.cliente?.id ?? null,
        importo: f.importo,
        incassato,
        residuo: f.pagato ? 0 : Math.max(0, f.importo - incassato),
        pagato: f.pagato,
        mese: f.mese,
        anno: f.anno,
        azienda: f.azienda,
        punteggio: 0,
        motivi: [],
      });
    }
    out.sort(
      (a, b) =>
        Number(a.pagato) - Number(b.pagato) || b.anno - a.anno || b.mese - a.mese || (b.numero ?? "").localeCompare(a.numero ?? ""),
    );
    return NextResponse.json(out.slice(0, 40));
  } catch (e) {
    console.error("[GET /api/banca/fatture]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

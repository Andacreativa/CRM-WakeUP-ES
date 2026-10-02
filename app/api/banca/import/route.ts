import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ESCLUDI,
  compilaRegole,
  getImpostazioniBanca,
  parseEstrattoBBVA,
  regolaPer,
} from "@/lib/banca";

export const runtime = "nodejs";

// POST multipart { file }: importa un estratto BBVA. I movimenti già
// presenti (stessa impronta) vengono saltati, così si può ricaricare un
// periodo sovrapposto quando si vuole.
export async function POST(request: Request) {
  try {
    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Atteso multipart/form-data" }, { status: 400 });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Nessun file ricevuto" }, { status: 400 });
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      return NextResponse.json(
        { error: "Formato non supportato: serve il file .xlsx di BBVA" },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = parseEstrattoBBVA(buffer);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
    if (parsed.righe.length === 0) {
      return NextResponse.json({ error: "Nessun movimento trovato nel file." }, { status: 400 });
    }

    const gia = await prisma.importBancario.findFirst({
      where: { hashFile: parsed.hashFile },
      orderBy: { createdAt: "desc" },
    });
    if (gia) {
      return NextResponse.json({
        giaImportato: true,
        importId: gia.id,
        nomeFile: gia.nomeFile,
        importatoIl: gia.createdAt,
        conto: parsed.conto,
        periodoDa: parsed.periodoDa,
        periodoA: parsed.periodoA,
        righeLette: parsed.righe.length,
        righeNuove: 0,
        righeDuplicate: parsed.righe.length,
        uscite: 0,
        entrate: 0,
        escluse: 0,
      });
    }

    const esistenti = await prisma.movimentoBancario.findMany({
      where: { impronta: { in: parsed.righe.map((r) => r.impronta) } },
      select: { impronta: true },
    });
    const viste = new Set(esistenti.map((e) => e.impronta));
    const nuove = parsed.righe.filter((r) => !viste.has(r.impronta));

    const impostazioni = await getImpostazioniBanca(prisma);
    const regole = compilaRegole(impostazioni.regole);
    const righeDb = nuove.map((r) => {
      const reg = regolaPer(r, regole);
      const escluso = reg?.categoria === ESCLUDI;
      return {
        ...r,
        stato: escluso ? "escluso" : "da_abbinare",
        nota: escluso ? "Escluso in automatico da regola" : null,
      };
    });

    const imp = await prisma.$transaction(async (tx) => {
      const imp = await tx.importBancario.create({
        data: {
          banca: "BBVA",
          nomeFile: file.name,
          hashFile: parsed.hashFile,
          conto: parsed.conto,
          titolare: parsed.titolare,
          periodoDa: parsed.periodoDa,
          periodoA: parsed.periodoA,
          righeLette: parsed.righe.length,
          righeNuove: nuove.length,
          righeDuplicate: parsed.righe.length - nuove.length,
        },
      });
      if (righeDb.length) {
        await tx.movimentoBancario.createMany({
          data: righeDb.map((r) => ({
            importId: imp.id,
            impronta: r.impronta,
            dataContabile: r.dataContabile,
            dataValore: r.dataValore,
            codice: r.codice,
            concetto: r.concetto,
            beneficiario: r.beneficiario,
            osservazioni: r.osservazioni,
            importo: r.importo,
            saldo: r.saldo,
            stato: r.stato,
            nota: r.nota,
          })),
        });
      }
      return imp;
    });

    return NextResponse.json({
      giaImportato: false,
      importId: imp.id,
      nomeFile: imp.nomeFile,
      importatoIl: imp.createdAt,
      conto: parsed.conto,
      periodoDa: parsed.periodoDa,
      periodoA: parsed.periodoA,
      righeLette: parsed.righe.length,
      righeNuove: nuove.length,
      righeDuplicate: parsed.righe.length - nuove.length,
      uscite: nuove.filter((r) => r.importo < 0).length,
      entrate: nuove.filter((r) => r.importo > 0).length,
      escluse: righeDb.filter((r) => r.stato === "escluso").length,
    });
  } catch (e) {
    console.error("[POST /api/banca/import]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

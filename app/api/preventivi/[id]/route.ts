import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nextContrattoNumero } from "@/lib/contratto-numero";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const fid = parseInt(id);
    const body = await request.json();
    const before = await prisma.preventivo.findUnique({ where: { id: fid } });

    let subtotale: number | undefined;
    let totale: number | undefined;

    if (body.voci !== undefined) {
      const vociArr: {
        servizio: string;
        descrizione: string;
        quantita: number;
        prezzoUnitario: number;
      }[] = body.voci;
      subtotale = vociArr.reduce(
        (s, v) => s + v.quantita * v.prezzoUnitario,
        0,
      );
      const iva = body.iva ?? 21;
      totale = subtotale * (1 + iva / 100);
    }

    const preventivo = await prisma.preventivo.update({
      where: { id: fid },
      data: {
        ...(body.nomeCliente !== undefined && {
          nomeCliente: body.nomeCliente,
        }),
        ...(body.emailCliente !== undefined && {
          emailCliente: body.emailCliente,
        }),
        ...(body.aziendaCliente !== undefined && {
          aziendaCliente: body.aziendaCliente,
        }),
        ...(body.azienda !== undefined && { azienda: body.azienda }),
        ...(body.oggetto !== undefined && { oggetto: body.oggetto }),
        ...(body.voci !== undefined && { voci: JSON.stringify(body.voci) }),
        ...(body.iva !== undefined && { iva: body.iva }),
        ...(subtotale !== undefined && { subtotale }),
        ...(totale !== undefined && { totale }),
        ...(body.feeCommerciale !== undefined && {
          feeCommerciale: Number(body.feeCommerciale),
        }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.note !== undefined && { note: body.note }),
        ...(body.condizioni !== undefined && { condizioni: body.condizioni }),
        ...(body.dataScadenza !== undefined && {
          dataScadenza: body.dataScadenza ? new Date(body.dataScadenza) : null,
        }),
      },
    });

    // Auto-generate bozza contratto quando preventivo passa a "accettato"
    const wasAccepted = before?.status === "accettato";
    const isAccepted = preventivo.status === "accettato";
    console.log(
      `[preventivi PATCH #${fid}] before.status=${before?.status} after.status=${preventivo.status} wasAccepted=${wasAccepted} isAccepted=${isAccepted}`,
    );

    let autoContrattoCreato: { id: number; numero: string } | null = null;
    if (!wasAccepted && isAccepted) {
      try {
        const existing = await prisma.contratto.findFirst({
          where: { preventivoId: preventivo.id },
        });
        console.log(
          `[preventivi PATCH #${fid}] esistente contratto per preventivo? ${existing ? `SÌ (#${existing.id})` : "no"}`,
        );
        if (!existing) {
          const today = new Date();
          const numero = await nextContrattoNumero(today.getFullYear());
          const clienteMatch = await prisma.cliente.findFirst({
            where: {
              OR: [
                {
                  nome: {
                    equals: preventivo.nomeCliente,
                    mode: "insensitive",
                  },
                },
                ...(preventivo.aziendaCliente
                  ? [
                      {
                        nome: {
                          equals: preventivo.aziendaCliente,
                          mode: "insensitive" as const,
                        },
                      },
                    ]
                  : []),
              ],
            },
          });
          console.log(
            `[preventivi PATCH #${fid}] cliente match: ${clienteMatch ? `#${clienteMatch.id} ${clienteMatch.nome}` : "nessuno (fallback name)"}`,
          );
          const created = await prisma.contratto.create({
            data: {
              numero,
              preventivoId: preventivo.id,
              clienteId: clienteMatch?.id ?? null,
              nomeClienteFallback: clienteMatch
                ? null
                : preventivo.nomeCliente,
              rappresentanteLegale: "",
              dataDecorrenza: today,
              durataMesi: 6,
              importoMensile: preventivo.totale,
              numeroRate: 6,
              totaleContratto: preventivo.totale * 6,
              oggetto: preventivo.oggetto,
              voci: preventivo.voci,
              lingua: "it",
              status: "bozza",
            },
          });
          autoContrattoCreato = { id: created.id, numero: created.numero };
          console.log(
            `[preventivi PATCH #${fid}] ✓ contratto creato: #${created.id} ${created.numero}`,
          );
        }
      } catch (autoErr) {
        console.error(
          `[preventivi PATCH #${fid}] ERRORE auto-contratto:`,
          autoErr,
        );
      }
    }

    // Sync contratti linkati: aggiorna solo i campi derivati dal preventivo
    try {
      const linked = await prisma.contratto.findMany({
        where: { preventivoId: preventivo.id },
      });
      for (const c of linked) {
        const updated = await prisma.contratto.update({
          where: { id: c.id },
          data: {
            voci: preventivo.voci,
            oggetto: preventivo.oggetto,
            importoMensile: preventivo.totale,
            totaleContratto: preventivo.totale * c.numeroRate,
            ...(c.clienteId == null && {
              nomeClienteFallback: preventivo.nomeCliente,
            }),
          },
        });
        console.log(
          `[preventivi PATCH #${fid}] sync contratto #${updated.id} (${updated.numero}) — importoMensile=${updated.importoMensile}, totale=${updated.totaleContratto}`,
        );
      }
    } catch (syncErr) {
      console.error(
        `[preventivi PATCH #${fid}] ERRORE sync contratti:`,
        syncErr,
      );
    }

    return NextResponse.json({ ...preventivo, autoContrattoCreato });
  } catch (e) {
    console.error("[PATCH /api/preventivi/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.preventivo.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/preventivi/[id]]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

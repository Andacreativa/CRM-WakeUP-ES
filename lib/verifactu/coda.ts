import { prisma } from "@/lib/prisma";
import { getImpostazioniFatture } from "@/lib/impostazioni";
import { ambienteAttivo, ErroreFattura, inviaCoda, type EsitoCoda } from "@/lib/verifactu/catena";

// Svuota la coda dei registri VeriFactu senza che nessuno apra il pannello:
// la chiamano il cron (/api/cron/verifactu, anche dal cron dei rinnovi) e la
// lista Fatture quando vede un registro in coda. Con VeriFactu spento non fa
// nulla; se la produzione non è abilitata su questo ambiente lo dice e basta.
export async function svuotaCodaVerifactu(): Promise<EsitoCoda & { modo: string }> {
  const cfg = await getImpostazioniFatture(prisma);
  const vuoto = { inCoda: 0, inviati: 0, attesa: 0, errore: null, modo: cfg.vfModo };
  try {
    const ambiente = ambienteAttivo(cfg);
    if (!ambiente) return vuoto;
    // Più giri finché c'è qualcosa e l'AEAT non chiede di aspettare
    let esito = await inviaCoda(prisma, cfg, ambiente);
    let inviati = esito.inviati;
    for (let giro = 0; giro < 3 && esito.inCoda > 0 && !esito.errore && esito.attesa === 0; giro++) {
      esito = await inviaCoda(prisma, cfg, ambiente);
      inviati += esito.inviati;
    }
    return { ...esito, inviati, modo: cfg.vfModo };
  } catch (e) {
    if (e instanceof ErroreFattura) return { ...vuoto, errore: e.message };
    throw e;
  }
}

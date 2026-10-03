import type { Ambiente } from "./registro";

// Codice QR della fattura (art. 20-21 Orden HAC/1177/2024, «Detalle de las
// especificaciones técnicas del código QR» v0.5.0): l'indirizzo del servizio
// di verifica dell'AEAT con NIF, numero, data e totale della fattura.
const BASE: Record<Ambiente, string> = {
  prova: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
  produzione: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
};

export function urlQr(
  ambiente: Ambiente,
  f: { nif: string; numSerie: string; dataFattura: string; importeTotal: string },
): string {
  return (
    `${BASE[ambiente]}?nif=${encodeURIComponent(f.nif.trim())}` +
    `&numserie=${encodeURIComponent(f.numSerie.trim())}` +
    `&fecha=${f.dataFattura}&importe=${f.importeTotal}`
  );
}

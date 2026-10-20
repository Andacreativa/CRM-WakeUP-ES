// Informe per il commercialista (Bilancio › Informe commercialista): periodo,
// forma dei dati e testi in spagnolo. Niente dipendenze dal server: lo usano
// il modale, gli export e la rotta API.

export type TipoPeriodo = "mese" | "trimestre" | "anno";
export interface Periodo {
  tipo: TipoPeriodo;
  anno: number;
  mese: number; // 1–12, usato se tipo = mese
  trimestre: number; // 1–4, usato se tipo = trimestre
}

export const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const pad = (n: number) => String(n).padStart(2, "0");
const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ultimoGiorno = (anno: number, mese: number) => new Date(Date.UTC(anno, mese, 0)).getUTCDate();

export function intervallo(p: Periodo): { da: string; a: string } {
  if (p.tipo === "mese") {
    return { da: `${p.anno}-${pad(p.mese)}-01`, a: `${p.anno}-${pad(p.mese)}-${pad(ultimoGiorno(p.anno, p.mese))}` };
  }
  if (p.tipo === "trimestre") {
    const m1 = (p.trimestre - 1) * 3 + 1;
    const m3 = m1 + 2;
    return { da: `${p.anno}-${pad(m1)}-01`, a: `${p.anno}-${pad(m3)}-${pad(ultimoGiorno(p.anno, m3))}` };
  }
  return { da: `${p.anno}-01-01`, a: `${p.anno}-12-31` };
}
export function etichettaPeriodo(p: Periodo): string {
  if (p.tipo === "mese") return `${maiuscola(MESES_ES[p.mese - 1])} ${p.anno}`;
  if (p.tipo === "trimestre") {
    const m1 = (p.trimestre - 1) * 3;
    return `${p.trimestre}T ${p.anno} (${MESES_ES[m1]}–${MESES_ES[m1 + 2]})`;
  }
  return `Año ${p.anno}`;
}
export const titoloInforme = (p: Periodo) =>
  p.tipo === "mese" ? "Informe mensual" : p.tipo === "trimestre" ? "Informe trimestral" : "Informe anual";
export const suffissoFile = (p: Periodo) =>
  p.tipo === "mese" ? `${p.anno}-${pad(p.mese)}` : p.tipo === "trimestre" ? `${p.anno}-T${p.trimestre}` : String(p.anno);

// Il trimestre precedente: è quello che il commercialista sta chiudendo
export function periodoPredefinito(oggi = new Date()): Periodo {
  const t = Math.floor(oggi.getMonth() / 3) + 1;
  const base = { tipo: "trimestre" as const, mese: oggi.getMonth() + 1 };
  return t === 1 ? { ...base, anno: oggi.getFullYear() - 1, trimestre: 4 } : { ...base, anno: oggi.getFullYear(), trimestre: t - 1 };
}

// I mesi (anno, mese) coperti da un intervallo di date
export function mesiDelPeriodo(da: string, a: string): { anno: number; mese: number }[] {
  const [a1, m1] = da.split("-").map(Number);
  const [a2, m2] = a.split("-").map(Number);
  const out: { anno: number; mese: number }[] = [];
  for (let y = a1, m = m1; y < a2 || (y === a2 && m <= m2); ) {
    out.push({ anno: y, mese: m });
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
export const fechaEs = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-ES", { timeZone: "UTC" }) : "";
export const mesEs = (mese: number, anno: number) => `${MESES_ES[mese - 1]} ${anno}`;

export interface InformeFattura {
  id: number;
  numero: string | null;
  data: string | null;
  mese: number;
  anno: number;
  cliente: string;
  nif: string;
  paese: string;
  base: number;
  aliquota: number;
  cuota: number;
  total: number;
  causa: string; // esenzione a 0 % (E2…) o vuoto
  tipoFattura: string; // F1 | R1…R4
  rettificaDi: string | null;
  cobrada: boolean;
  cobrado: number;
}
export interface InformeSpesa {
  id: number;
  mese: number;
  anno: number;
  fornitore: string;
  nif: string;
  categoria: string;
  descrizione: string;
  importo: number;
}
export interface InformeAltro {
  id: number;
  mese: number;
  anno: number;
  fonte: string;
  categoria: string;
  descrizione: string;
  importo: number;
  incassato: boolean;
}
export interface InformeDati {
  da: string;
  a: string;
  fatture: InformeFattura[];
  spese: InformeSpesa[];
  altri: InformeAltro[];
  riepilogo: {
    nFatture: number;
    base: number;
    cuota: number;
    total: number;
    cobrado: number;
    pendiente: number;
    nSpese: number;
    gastos: number;
    gastosPerCategoria: { categoria: string; importo: number }[];
    nAltri: number;
    otros: number;
    resultado: number; // base imponibile + altri ingressi − spese
  };
}

// Le categorie sono in italiano nel registro: al commercialista vanno in spagnolo
const CATEGORIE_ES: Record<string, string> = {
  Stipendio: "Salarios",
  "Seguridad Social": "Seguridad Social",
  Tasse: "Impuestos",
  "Carta Aziendale": "Tarjeta de empresa",
  "Costi Aziendali": "Costes de empresa",
  Software: "Software",
  Commercialista: "Gestoría",
  Fornitori: "Proveedores",
  Soci: "Socios",
  "Costi Bancari": "Comisiones bancarias",
  Ufficio: "Oficina",
  Rimborsi: "Reembolsos",
  Benefit: "Beneficios sociales",
  Commissioni: "Comisiones",
  Altro: "Otros",
  // altri ingressi
  cashback: "Cashback",
  rimborso_tasse: "Devolución de impuestos",
  apporto_socio: "Aportación de socio",
  incasso_senza_fattura: "Cobro sin factura",
  ritenuta_commerciale: "Retención comercial",
  altro: "Otros",
};
export const categoriaEs = (c: string) => CATEGORIE_ES[c] ?? c;

export const SEZIONI = [
  { key: "resumen", label: "Resumen del periodo", sotto: "Totali di fatture, incassi, spese per categoria e risultato" },
  { key: "emitidas", label: "Libro de facturas emitidas", sotto: "Una riga per fattura: base, IGIC, totale, esenzione, incassata" },
  { key: "gastos", label: "Gastos (facturas recibidas)", sotto: "Le spese del periodo con fornitore, NIF e categoria" },
  { key: "otros", label: "Otros ingresos", sotto: "Entrate senza fattura (cashback, rimborsi, apporti…)" },
] as const;
export type Sezione = (typeof SEZIONI)[number]["key"];

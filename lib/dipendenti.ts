// Tipologie di persona e voci mensili del registro pagamenti.

export const TIPI_DIPENDENTE = [
  { value: "dipendente", label: "Dipendente" },
  { value: "socio_dipendente", label: "Socio dipendente" },
  { value: "commerciale", label: "Commerciale" },
] as const;
export type TipoDipendente = (typeof TIPI_DIPENDENTE)[number]["value"];

export const TIPO_LABEL: Record<string, string> = Object.fromEntries(
  TIPI_DIPENDENTE.map((t) => [t.value, t.label]),
);

export type Voce =
  | "stipendio"
  | "seguridad"
  | "irpf"
  | "rimborsi"
  | "benefit"
  | "commissioni";

export const VOCI: Record<
  Voce,
  {
    label: string;
    breve: string;
    categoria: string;
    auto?: boolean; // nasce dalle fatture, non si registra a mano
    multiplo?: boolean; // più righe nello stesso mese, senza importo di default
  }
> = {
  stipendio: { label: "Stipendio", breve: "Stip.", categoria: "Stipendio" },
  seguridad: {
    label: "Seguridad Social",
    breve: "Seg. Soc.",
    categoria: "Seguridad Social",
  },
  irpf: { label: "IRPF", breve: "IRPF", categoria: "Tasse" },
  rimborsi: {
    label: "Rimborsi",
    breve: "Rimb.",
    categoria: "Rimborsi",
    multiplo: true, // variabili: si inseriscono a mano quando capitano
  },
  benefit: { label: "Benefit", breve: "Benefit", categoria: "Benefit" },
  commissioni: {
    label: "Commissioni",
    breve: "Comm.",
    categoria: "Commissioni",
    auto: true, // nascono dalle fatture incassate, non si registrano a mano
  },
};
export const VOCI_ORDINE: Voce[] = [
  "stipendio",
  "seguridad",
  "irpf",
  "rimborsi",
  "benefit",
  "commissioni",
];

export const VOCI_PER_TIPO: Record<string, Voce[]> = {
  dipendente: ["stipendio", "seguridad", "irpf"],
  socio_dipendente: ["stipendio", "seguridad", "irpf", "rimborsi", "benefit"],
  commerciale: ["stipendio", "commissioni", "benefit"],
};

export const vociDiTipo = (tipo: string): Voce[] =>
  VOCI_PER_TIPO[tipo] ?? VOCI_PER_TIPO.dipendente;

export interface DipendenteDefaults {
  nettoBustaPaga: number;
  seguridadSocial: number;
  irpfImporto: number;
  rimborsiMensili: number;
  benefitMensili: number;
}

export function importoDefault(d: DipendenteDefaults, voce: Voce): number {
  switch (voce) {
    case "stipendio":
      return d.nettoBustaPaga;
    case "seguridad":
      return d.seguridadSocial;
    case "irpf":
      return d.irpfImporto;
    case "benefit":
      return d.benefitMensili;
    default:
      return 0;
  }
}

export const nomeCompleto = (d: { nome: string; cognome?: string | null }) =>
  `${d.nome}${d.cognome ? ` ${d.cognome}` : ""}`.trim();

export const isVoce = (v: unknown): v is Voce =>
  typeof v === "string" && v in VOCI;

// Ordine di presentazione: prima i soci dipendenti, poi i dipendenti, poi i
// commerciali (Persone, Pagamenti, Report).
export const ORDINE_TIPI = ["socio_dipendente", "dipendente", "commerciale"] as const;
export const TIPO_LABEL_PLURALE: Record<string, string> = {
  socio_dipendente: "Soci dipendenti",
  dipendente: "Dipendenti",
  commerciale: "Commerciali",
};
export function gruppiPerTipo<T extends { tipo: string }>(
  persone: T[],
): { tipo: string; label: string; persone: T[] }[] {
  const tipi = [...ORDINE_TIPI, ...persone.map((p) => p.tipo).filter((t) => !(ORDINE_TIPI as readonly string[]).includes(t))];
  const out: { tipo: string; label: string; persone: T[] }[] = [];
  for (const t of Array.from(new Set(tipi))) {
    const lista = persone.filter((p) => p.tipo === t);
    if (lista.length) out.push({ tipo: t, label: TIPO_LABEL_PLURALE[t] ?? t, persone: lista });
  }
  return out;
}
export const ordinaPerTipo = <T extends { tipo: string }>(persone: T[]): T[] =>
  gruppiPerTipo(persone).flatMap((g) => g.persone);

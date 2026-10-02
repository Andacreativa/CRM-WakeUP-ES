import type { Prisma } from "@prisma/client";

// Stati di pipeline del lead (modello Northstar), con consiglio operativo.
export const STATI_LEAD = [
  { value: "nuovo", label: "Nuovo", color: "#6366f1", bg: "#eef2ff", consiglio: "Contattalo entro 48 ore." },
  { value: "contattato", label: "Contattato", color: "#f59e0b", bg: "#fef3c7", consiglio: "Fissa una call o una riunione." },
  { value: "qualificato", label: "Qualificato", color: "#0ea5e9", bg: "#f0f9ff", consiglio: "Capisci budget, tempi e decisore." },
  { value: "prospect", label: "Prospect", color: "#3b82f6", bg: "#eff6ff", consiglio: "Prepara il preventivo." },
  { value: "opportunita", label: "Opportunità", color: "#8b5cf6", bg: "#f5f3ff", consiglio: "Preventivo inviato: segui la trattativa." },
  { value: "vinta", label: "Vinta", color: "#22c55e", bg: "#dcfce7", consiglio: "Converti in cliente e avvia il contratto." },
  { value: "persa", label: "Persa", color: "#ef4444", bg: "#fee2e2", consiglio: "Annota il motivo per il futuro." },
  { value: "non_qualificato", label: "Non qualificato", color: "#9ca3af", bg: "#f3f4f6", consiglio: "Fuori target: archivia." },
] as const;
export type StatoLead = (typeof STATI_LEAD)[number]["value"];
export const STATO_LEAD = Object.fromEntries(STATI_LEAD.map((s) => [s.value, s])) as Record<
  string,
  (typeof STATI_LEAD)[number]
>;
// Colonne della pipeline (gli stati finali "non qualificato" restano fuori)
export const STATI_PIPELINE: StatoLead[] = [
  "nuovo",
  "contattato",
  "qualificato",
  "prospect",
  "opportunita",
  "vinta",
  "persa",
];
export const STATI_APERTI: StatoLead[] = ["nuovo", "contattato", "qualificato", "prospect", "opportunita"];

export const FONTI_LEAD = [
  { value: "sito", label: "Sito web" },
  { value: "referral", label: "Referral" },
  { value: "social", label: "Social" },
  { value: "evento", label: "Evento" },
  { value: "passaparola", label: "Passaparola" },
  { value: "import", label: "Import" },
  { value: "altro", label: "Altro" },
];
export const QUALIFICHE_LEAD = [
  { value: "fredda", label: "Fredda" },
  { value: "tiepida", label: "Tiepida" },
  { value: "calda", label: "Calda" },
];
export const PRIORITA_LEAD = [
  { value: "bassa", label: "Bassa" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
];
export const TIPI_ATTIVITA = [
  { value: "chiamata", label: "Chiamata" },
  { value: "email", label: "Email" },
  { value: "riunione", label: "Riunione" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "nota", label: "Nota" },
  { value: "task", label: "Task" },
];
export const ESITI_ATTIVITA = [
  { value: "positivo", label: "Positivo" },
  { value: "neutro", label: "Neutro" },
  { value: "negativo", label: "Negativo" },
];

export const isStatoLead = (v: unknown): v is StatoLead =>
  typeof v === "string" && v in STATO_LEAD;

// Mappa del vecchio campo `stage` del kanban sul nuovo `stato`
export const STAGE_TO_STATO: Record<string, StatoLead> = {
  nuovo: "nuovo",
  contatto: "contattato",
  proposta: "opportunita",
  negoziazione: "opportunita",
  vinto: "vinta",
  perso: "persa",
};

export async function nextCodiceLead(
  tx: Prisma.TransactionClient,
  anno: number,
): Promise<string> {
  const prefix = `LEAD-${anno}-`;
  const rows = await tx.lead.findMany({
    where: { codice: { startsWith: prefix } },
    select: { codice: true },
  });
  let max = 0;
  for (const r of rows) {
    const n = parseInt((r.codice ?? "").slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export const nomeLead = (l: { nome: string; azienda?: string | null }) =>
  l.azienda ? `${l.azienda}` : l.nome;

export const LEAD_INCLUDE = {
  cliente: { select: { id: true, nome: true } },
  preventivi: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, numero: true, oggetto: true, totale: true, status: true, createdAt: true },
  },
  _count: { select: { attivita: true, contatti: true } },
} satisfies Prisma.LeadInclude;

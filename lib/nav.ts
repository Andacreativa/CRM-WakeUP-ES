import type { LucideIcon } from "lucide-react";
import {
  Landmark,
  UserCog,
  FolderOpen,
  Briefcase,
  Users,
} from "lucide-react";

// Struttura di navigazione (stile Northstar): sezione → voce → tab.
// La sezione è l'intestazione in maiuscolo nella sidebar ("pannello"),
// la voce è l'elemento cliccabile, le tab sono le pagine della voce e
// compaiono sia come sottomenu nella sidebar sia come barra in alto.

export interface NavTab {
  label: string;
  href: string;
}

export interface NavItem {
  code: string;
  label: string;
  icon: LucideIcon;
  href: string;
  tabs?: NavTab[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Amministrazione",
    items: [
      {
        code: "finance",
        label: "Finance",
        icon: Landmark,
        href: "/finance",
        tabs: [
          { label: "Dashboard", href: "/finance" },
          { label: "Bilancio", href: "/finance/bilancio" },
          { label: "Fatture", href: "/finance/fatture" },
          { label: "Da emettere", href: "/finance/da-emettere" },
          { label: "Altri ingressi", href: "/finance/altri-ingressi" },
          { label: "Spese", href: "/finance/spese" },
          { label: "Scadenze", href: "/finance/scadenze" },
          { label: "Impostazioni", href: "/finance/impostazioni" },
        ],
      },
      {
        code: "dipendenti",
        label: "Dipendenti",
        icon: UserCog,
        href: "/finance/dipendenti",
        tabs: [
          { label: "Persone", href: "/finance/dipendenti" },
          { label: "Pagamenti", href: "/finance/dipendenti/pagamenti" },
          { label: "Report", href: "/finance/dipendenti/report" },
        ],
      },
      {
        code: "documenti",
        label: "Documenti",
        icon: FolderOpen,
        href: "/finance/documenti",
      },
    ],
  },
  {
    label: "Commerciale",
    items: [
      {
        code: "sales",
        label: "Sales",
        icon: Briefcase,
        href: "/sales",
        tabs: [
          { label: "Pipeline", href: "/sales" },
          { label: "Preventivi", href: "/sales/preventivi" },
          { label: "Contratti", href: "/sales/contratti" },
          { label: "Richieste fattura", href: "/sales/richieste" },
        ],
      },
    ],
  },
  {
    label: "CRM",
    items: [
      {
        code: "crm",
        label: "CRM",
        icon: Users,
        href: "/crm/clienti",
        tabs: [
          { label: "Clienti", href: "/crm/clienti" },
          { label: "Contatti", href: "/crm/contatti" },
          { label: "Fornitori", href: "/crm/fornitori" },
        ],
      },
    ],
  },
];

export interface NavMatch {
  section: NavSection | null;
  item: NavItem | null;
  tab: NavTab | null;
}

const matches = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

// Voce e tab attive = prefisso più lungo che corrisponde al pathname
// (come domain-tabs.js di Northstar).
export function resolveNav(pathname: string): NavMatch {
  let best: { section: NavSection; item: NavItem; len: number } | null = null;
  for (const section of NAV) {
    for (const item of section.items) {
      const hrefs = [item.href, ...(item.tabs?.map((t) => t.href) ?? [])];
      for (const h of hrefs) {
        if (matches(pathname, h) && h.length > (best?.len ?? -1)) {
          best = { section, item, len: h.length };
        }
      }
    }
  }
  if (!best) return { section: null, item: null, tab: null };

  let tab: NavTab | null = null;
  let tabLen = -1;
  for (const t of best.item.tabs ?? []) {
    if (matches(pathname, t.href) && t.href.length > tabLen) {
      tab = t;
      tabLen = t.href.length;
    }
  }
  return { section: best.section, item: best.item, tab };
}

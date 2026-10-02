"use client";

import { usePathname, useRouter } from "next/navigation";
import { Building2, Calendar, ChevronRight, LogOut, Menu } from "lucide-react";
import { ANNI } from "@/lib/constants";
import { useAnno } from "@/lib/anno-context";
import { resolveNav } from "@/lib/nav";
import { useShell } from "./ShellContext";

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { setMobileOpen, setInfoOpen } = useShell();
  const { anno, setAnno } = useAnno();
  const { section, item, tab } = resolveNav(pathname);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-burger"
        onClick={() => setMobileOpen(true)}
        aria-label="Apri menu"
      >
        <Menu size={18} />
      </button>

      <nav className="topbar-crumbs" aria-label="Percorso">
        {section && <span className="crumb">{section.label}</span>}
        {/* Se la voce si chiama come la sezione (es. CRM) non la ripetiamo */}
        {item && item.label !== section?.label && (
          <>
            <ChevronRight size={13} />
            <span className={tab ? "crumb" : "crumb crumb-active"}>
              {item.label}
            </span>
          </>
        )}
        {tab && (
          <>
            <ChevronRight size={13} />
            <span className="crumb crumb-active">{tab.label}</span>
          </>
        )}
      </nav>

      <div className="topbar-right">
        <label className="topbar-year" title="Anno di riferimento">
          <Calendar size={14} />
          <select
            value={anno}
            onChange={(e) => setAnno(parseInt(e.target.value))}
            aria-label="Anno"
          >
            {ANNI.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value={0}>Tutti gli anni</option>
          </select>
        </label>
        <span className="topbar-app">ANDA</span>
        <button
          type="button"
          className="topbar-btn"
          title="Dati aziendali"
          onClick={() => setInfoOpen(true)}
        >
          <Building2 size={16} />
        </button>
        <button
          type="button"
          className="topbar-btn"
          title="Esci"
          onClick={logout}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

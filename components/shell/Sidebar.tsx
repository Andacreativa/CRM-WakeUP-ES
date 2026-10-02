"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, resolveNav } from "@/lib/nav";
import { useLocalStorageValue, writeLocalStorage } from "@/lib/use-local-storage";
import { useShell } from "./ShellContext";

const OPEN_KEY = "anda_sb_open";

function parseOpenMap(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export default function Sidebar({ username, ruolo }: { username: string; ruolo: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useShell();
  const match = resolveNav(pathname);

  // Sottomenu aperti manualmente (oltre a quello della voce attiva),
  // ricordati in localStorage come in Northstar (chiave sb_<code>).
  const openRaw = useLocalStorageValue(OPEN_KEY);
  const openMap = parseOpenMap(openRaw);
  const toggle = (code: string) => {
    const next = { ...openMap, [code]: !openMap[code] };
    writeLocalStorage(OPEN_KEY, JSON.stringify(next));
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const initial = (username || "A").trim().charAt(0).toUpperCase();

  const voci = (section: (typeof NAV)[number]) => (
    <>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = match.item?.code === item.code;
                const hasTabs = !!item.tabs?.length;
                const open =
                  hasTabs && !collapsed && (active || !!openMap[item.code]);
                return (
                  <div key={item.code}>
                    <div className={cn("sb-item", active && "active")}>
                      <Link
                        href={item.href}
                        className="sb-item-link"
                        title={collapsed ? item.label : undefined}
                        onClick={() => setMobileOpen(false)}
                      >
                        <Icon size={18} />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                      {hasTabs && !collapsed && (
                        <button
                          type="button"
                          className="sb-chevron"
                          onClick={() => toggle(item.code)}
                          aria-label={open ? "Chiudi sottomenu" : "Apri sottomenu"}
                        >
                          <ChevronDown
                            size={14}
                            className={cn(
                              "transition-transform",
                              open && "rotate-180",
                            )}
                          />
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="sb-sub">
                        {item.tabs!.map((t) => (
                          <Link
                            key={t.href}
                            href={t.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "sb-sub-link",
                              active && match.tab?.href === t.href && "active",
                            )}
                          >
                            {t.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
    </>
  );


  return (
    <>
      <aside
        className={cn("sb", collapsed && "sb-collapsed", mobileOpen && "sb-open")}
        aria-label="Menu principale"
      >
        <div className="sb-head">
          <div className="sb-brand">
            <span className="sb-logo">
              <img src="/logo-anda-wide.png" alt="Anda Agencia de Publicidad SL" />
            </span>
          </div>
        </div>

        <nav className="sb-nav">
          {NAV.filter((sec) => !sec.footer).map((section) => (
            <div key={section.label} className="sb-group">
              {!collapsed && <div className="sb-section">{section.label}</div>}
              {voci(section)}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          {NAV.filter((sec) => sec.footer).map((section) => (
            <div key={section.label} className="sb-group">
              {voci(section)}
            </div>
          ))}
          <div className="sb-user" title={username}>
            <span className="sb-avatar">{initial}</span>
            {!collapsed && (
              <span className="sb-user-text">
                <strong>{username || "Utente"}</strong>
                <small>{ruolo || "Anda"}</small>
              </span>
            )}
          </div>
          <button type="button" className="sb-item sb-logout" onClick={logout}>
            <span className="sb-item-link">
              <LogOut size={18} />
              {!collapsed && <span>Esci</span>}
            </span>
          </button>
        </div>

        <button
          type="button"
          className="sb-collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Espandi menu" : "Comprimi menu"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {mobileOpen && (
        <div className="sb-backdrop" onClick={() => setMobileOpen(false)} />
      )}
    </>
  );
}

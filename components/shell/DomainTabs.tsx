"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { resolveNav } from "@/lib/nav";

// Barra tab sotto la topbar: le pagine della voce attiva (come i
// "domain tabs" di Northstar).
export default function DomainTabs() {
  const pathname = usePathname();
  const { item, tab } = resolveNav(pathname);
  if (!item?.tabs?.length) return null;

  return (
    <div className="domain-nav">
      <div className="domain-nav-tabs" role="tablist">
        {item.tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={tab?.href === t.href}
            className={cn("domain-tab", tab?.href === t.href && "active")}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

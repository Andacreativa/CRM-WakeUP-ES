import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Card contatore uguale in tutta l'app (stile Northstar): etichetta in
// maiuscolo, valore grande, riga secondaria opzionale, icona opzionale a
// destra. La griglia è a 2 colonne su mobile e a `cols` da 1024px in su.

export function KpiGrid({
  cols = 4,
  className,
  children,
}: {
  cols?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("kpi-grid", className)} style={{ "--kpi-cols": cols } as CSSProperties}>
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  color,
  valueClass,
  icon: Icon,
  iconColor,
  className,
  onClick,
  title,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string; // colore CSS del valore (es. "#22c55e")
  valueClass?: string; // oppure una classe (es. "text-ok")
  icon?: LucideIcon;
  iconColor?: string; // default: il colore del valore
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const col = iconColor ?? color;
  return (
    <div
      className={cn("kpi", onClick && "cursor-pointer hover:border-brand/40", className)}
      onClick={onClick}
      title={title}
    >
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className={cn("kpi-value", valueClass)} style={color ? { color } : undefined}>
          {value}
        </div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
      {Icon && (
        <span
          className="kpi-icon"
          style={{
            color: col ?? "var(--text-3)",
            background: col ? `color-mix(in oklab, ${col} 12%, white)` : "var(--bg-input)",
          }}
        >
          <Icon />
        </span>
      )}
    </div>
  );
}

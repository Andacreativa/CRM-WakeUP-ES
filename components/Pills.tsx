"use client";

import { cn } from "@/lib/utils";

// Pill di filtro (Tutti / Pagati / In attesa…): stesso aspetto in tutte le
// pagine, l'attiva è rosa piena. Stile in globals.css (.pills).
export default function Pills<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { val: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("pills", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.val}
          type="button"
          role="tab"
          aria-selected={o.val === value}
          className={o.val === value ? "active" : undefined}
          onClick={() => onChange(o.val)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

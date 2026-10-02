"use client";

import { CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

// Spunta tonda messa a mano (come «Contab.» di Northstar): pallino verde
// pieno quando è fatta, cerchio tratteggiato quando non lo è.
export default function Spunta({
  on,
  onClick,
  title,
  disabled,
}: {
  on: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("tog", on && "on")}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={on}
    >
      {on ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path
            d="m8 12.4 2.7 2.7 5.3-5.6"
            fill="none"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <CircleDashed />
      )}
    </button>
  );
}

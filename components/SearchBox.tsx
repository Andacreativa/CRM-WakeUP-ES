"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Campo di ricerca testuale dei filtri, uguale in tutte le pagine: va per
// primo nella riga dei filtri (come in Clienti). Filtra lato client.
export default function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-72 max-w-full", className)}>
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Cerca…"}
        className="sel w-full pl-9 pr-8 placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700"
          aria-label="Pulisci ricerca"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

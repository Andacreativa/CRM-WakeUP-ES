"use client";

import { useState } from "react";
import RegoleBanca from "@/components/banca/RegoleBanca";
import { cn } from "@/lib/utils";

// Configurazione › Banca: regole di categoria e memoria dei beneficiari
// usate dall'importazione dell'estratto conto.
export default function ImpostazioniBancaPage() {
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const notify = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), kind === "ok" ? 4000 : 7000);
  };
  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={cn(
            "text-sm rounded-lg px-3 py-2 border",
            msg.kind === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-600",
          )}
        >
          {msg.text}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Banca</h1>
        <p className="text-gray-500 text-sm mt-1">
          Come l&apos;estratto conto BBVA viene letto: regole di categoria e fornitori ricordati
        </p>
      </div>
      <RegoleBanca onNotify={notify} />
    </div>
  );
}

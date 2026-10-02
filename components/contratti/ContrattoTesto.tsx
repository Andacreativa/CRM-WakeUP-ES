"use client";

import { FIRMA_LEO_MARKER } from "@/lib/export";

// Anteprima del contratto: lo stesso testo che finisce nel PDF
// (buildContrattoText), con le stesse convenzioni:
//   "# "  titolo · "## " articolo · "**…**" paragrafo in grassetto ·
//   "• " / "- " elenco · "___" riga per la firma · riga vuota = spazio.
export default function ContrattoTesto({ testo }: { testo: string }) {
  const righe = testo.split("\n");
  return (
    <div className="text-[13px] leading-relaxed text-gray-800">
      {righe.map((raw, i) => {
        const line = raw.trimEnd();
        if (line === "") return <div key={i} className="h-2" />;
        if (line === FIRMA_LEO_MARKER) {
          // La firma è bianca su trasparente: in pagina la si mostra scura
          return (
            <img
              key={i}
              src="/Firma Leo.png"
              alt="Firma"
              className="h-14 w-auto my-1 brightness-0"
            />
          );
        }
        if (line === "___") return <div key={i} className="w-48 border-b border-gray-400 my-2" />;
        if (line.startsWith("# "))
          return (
            <h3 key={i} className="text-center text-base font-bold text-gray-900 mb-3">
              {line.slice(2)}
            </h3>
          );
        if (line.startsWith("## "))
          return (
            <h4 key={i} className="font-bold text-gray-900 mt-3 mb-1">
              {line.slice(3)}
            </h4>
          );
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4)
          return (
            <p key={i} className="font-bold text-gray-900">
              {line.slice(2, -2)}
            </p>
          );
        if (line.startsWith("• ") || line.startsWith("- "))
          return (
            <p key={i} className="pl-5 relative">
              <span className="absolute left-1">•</span>
              {line.slice(2)}
            </p>
          );
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

const LARGHEZZA = 210;

// Menu delle azioni di una riga (bottone a freccia, come Northstar). Il popup
// è "fixed" e prende le coordinate dal bottone: così non viene tagliato dalla
// tabella. Per lo stesso motivo si chiude allo scroll.
// Dentro: elementi con le classi .menu-item / .menu-sep / .menu-nota.
export default function RowMenu({
  title = "Azioni",
  children,
}: {
  title?: string;
  children: (chiudi: () => void) => ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    // Se sotto non c'è spazio, il menu si apre sopra il bottone
    const pop = popRef.current;
    const btn = btnRef.current;
    if (pop && btn) {
      const r = btn.getBoundingClientRect();
      if (pos.y + pop.offsetHeight > window.innerHeight - 8) {
        pop.style.top = `${Math.max(8, r.top - pop.offsetHeight - 4)}px`;
      }
    }
    const chiudi = () => setPos(null);
    const fuori = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      chiudi();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && chiudi();
    document.addEventListener("mousedown", fuori);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", chiudi, true);
    window.addEventListener("resize", chiudi);
    return () => {
      document.removeEventListener("mousedown", fuori);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", chiudi, true);
      window.removeEventListener("resize", chiudi);
    };
  }, [pos]);

  const apri = () => {
    if (pos) return setPos(null);
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ x: Math.max(8, r.right - LARGHEZZA), y: r.bottom + 4 });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="menu-btn"
        onClick={apri}
        aria-haspopup="true"
        aria-expanded={!!pos}
        title={title}
      >
        <ArrowRight />
      </button>
      {pos && (
        <div ref={popRef} className="menu-pop" style={{ left: pos.x, top: pos.y }} role="menu">
          {children(() => setPos(null))}
        </div>
      )}
    </>
  );
}

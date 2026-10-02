"use client";

import { createContext, useContext, ReactNode } from "react";
import { ANNI } from "./constants";
import { useLocalStorageValue, writeLocalStorage } from "./use-local-storage";

interface AnnoCtx {
  anno: number; // 0 = "Tutti gli anni"
  setAnno: (a: number) => void;
}

const AnnoContext = createContext<AnnoCtx>({
  anno: ANNI[0],
  setAnno: () => {},
});

const LS_KEY = "lf_anno";

export function AnnoProvider({ children }: { children: ReactNode }) {
  // Anno scelto nella topbar, ricordato nel browser. Al primo render
  // (server) vale l'anno più recente; dopo l'idratazione quello salvato.
  const saved = useLocalStorageValue(LS_KEY);
  const n = saved === null ? NaN : parseInt(saved);
  const anno = n === 0 || ANNI.includes(n) ? n : ANNI[0];

  const setAnno = (a: number) => writeLocalStorage(LS_KEY, String(a));

  return (
    <AnnoContext.Provider value={{ anno, setAnno }}>
      {children}
    </AnnoContext.Provider>
  );
}

export const useAnno = () => useContext(AnnoContext);

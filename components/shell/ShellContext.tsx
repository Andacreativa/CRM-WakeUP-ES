"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocalStorageValue, writeLocalStorage } from "@/lib/use-local-storage";

interface ShellCtx {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  infoOpen: boolean;
  setInfoOpen: (v: boolean) => void;
}

const Ctx = createContext<ShellCtx>({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
  infoOpen: false,
  setInfoOpen: () => {},
});

const LS_KEY = "anda_sb_collapsed";

export function ShellProvider({ children }: { children: ReactNode }) {
  const collapsed = useLocalStorageValue(LS_KEY) === "1";
  const setCollapsed = (v: boolean) => writeLocalStorage(LS_KEY, v ? "1" : "0");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <Ctx.Provider
      value={{
        collapsed,
        setCollapsed,
        mobileOpen,
        setMobileOpen,
        infoOpen,
        setInfoOpen,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useShell = () => useContext(Ctx);

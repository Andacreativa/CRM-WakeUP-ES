"use client";

import { useSyncExternalStore } from "react";

// Lettura reattiva di localStorage senza setState negli effetti:
// useSyncExternalStore rende il valore del server (null) al primo render
// e quello del browser subito dopo l'idratazione.

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage non disponibile: il valore resta solo in memoria di sessione */
  }
  listeners.forEach((l) => l());
}

export function useLocalStorageValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readLocalStorage(key),
    () => null,
  );
}

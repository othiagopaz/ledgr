import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";

export function useKeyboardNav() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // Cmd+K: command palette (always works)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useAppStore.getState().setCommandPaletteOpen(true);
        return;
      }

      // Skip other shortcuts when in input
      if (isInput) return;

      // N: new transaction
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        useAppStore.getState().requestNewTransaction();
        return;
      }

      // Escape: close command palette
      if (e.key === "Escape") {
        const store = useAppStore.getState();
        if (store.commandPaletteOpen) {
          store.setCommandPaletteOpen(false);
        }
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

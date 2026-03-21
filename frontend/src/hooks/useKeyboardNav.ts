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

      // Cmd+Shift+N: open transaction modal (always works)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        useAppStore.getState().openTxnModal();
        return;
      }

      // Skip other shortcuts when in input
      if (isInput) return;

      // N: new transaction (inline if account selected, modal otherwise)
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        const store = useAppStore.getState();
        if (store.activeTabId) {
          store.requestNewTransaction();
        } else {
          store.openTxnModal();
        }
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

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountNames } from "../api/client";
import { useAppStore } from "../stores/appStore";

interface PaletteItem {
  id: string;
  label: string;
  group: string;
  action: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette() {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCommandPaletteOpen, openTab, toggleTheme } = useAppStore();

  const accountNamesQuery = useQuery({
    queryKey: ["account-names"],
    queryFn: fetchAccountNames,
  });

  const items: PaletteItem[] = [];

  // Accounts
  for (const name of accountNamesQuery.data?.accounts || []) {
    const shortName =
      name.split(":").length > 2
        ? name.split(":").slice(1).join(":")
        : name;
    items.push({
      id: `account:${name}`,
      label: name,
      group: "Accounts",
      action: () => {
        openTab({
          id: `register:${name}`,
          type: "register",
          account: name,
          label: shortName,
        });
        setCommandPaletteOpen(false);
      },
    });
  }

  // Actions
  items.push({
    id: "action:new-txn",
    label: "New Transaction",
    group: "Actions",
    action: () => {
      useAppStore.getState().openTxnModal();
      setCommandPaletteOpen(false);
    },
  });

  items.push({
    id: "action:new-account",
    label: "New Account",
    group: "Actions",
    action: () => {
      useAppStore.getState().openAcctModal();
      setCommandPaletteOpen(false);
    },
  });

  items.push({
    id: "action:toggle-theme",
    label: "Toggle Theme",
    group: "Actions",
    action: () => {
      toggleTheme();
      setCommandPaletteOpen(false);
    },
  });

  const filtered = query
    ? items.filter((item) => fuzzyMatch(item.label, query))
    : items;

  // Group results
  const groups = new Map<string, PaletteItem[]>();
  for (const item of filtered.slice(0, 50)) {
    const list = groups.get(item.group) || [];
    list.push(item);
    groups.set(item.group, list);
  }

  const flatFiltered = filtered.slice(0, 50);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flatFiltered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatFiltered[activeIdx]) {
      e.preventDefault();
      flatFiltered[activeIdx].action();
    } else if (e.key === "Escape") {
      setCommandPaletteOpen(false);
    }
  }

  return (
    <div
      className="command-palette-overlay"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Search accounts, actions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette-results">
          {Array.from(groups.entries()).map(([group, groupItems]) => (
            <div key={group} className="command-palette-group">
              <div className="command-palette-group-label">{group}</div>
              {groupItems.map((item) => {
                const idx = flatFiltered.indexOf(item);
                return (
                  <div
                    key={item.id}
                    className={`command-palette-item${idx === activeIdx ? " active" : ""}`}
                    onClick={() => item.action()}
                    onMouseEnter={() => setActiveIdx(idx)}
                  >
                    {item.label}
                  </div>
                );
              })}
            </div>
          ))}
          {flatFiltered.length === 0 && (
            <div style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 13 }}>
              No results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

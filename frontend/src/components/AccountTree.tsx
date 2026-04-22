import { useState, useEffect, useRef, useCallback } from "react";
import type { AccountNode, Balance } from "../types";
import { useAppStore } from "../stores/appStore";
import { formatAmount, amountSignClass } from "../utils/format";

interface Props {
  accounts: AccountNode[];
  selectedAccount: string | null;
  onSelect: (account: string) => void;
  onEdit?: (node: AccountNode) => void;
}

function isZeroBalance(balances: Balance[]): boolean {
  return balances.every((b) => parseFloat(b.number) === 0);
}

function BalanceDisplay({ balances }: { balances: Balance[] }) {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);

  if (balances.length === 0) return <span className="acct-bal">—</span>;

  const byCurrency = new Map<string, number>();
  for (const b of balances) {
    byCurrency.set(b.currency, (byCurrency.get(b.currency) || 0) + parseFloat(b.number));
  }

  const entries = Array.from(byCurrency.entries());

  if (entries.length === 1) {
    const [currency, number] = entries[0];
    const formatted = formatAmount(number, operatingCurrency);
    return (
      <span className={`acct-bal ${amountSignClass(number)}`}>
        {currency === operatingCurrency ? formatted : `${formatted} ${currency}`}
      </span>
    );
  }

  return (
    <span className="acct-bal acct-bal-multi">
      {entries.map(([currency, number]) => {
        const formatted = formatAmount(number, operatingCurrency);
        return (
          <span key={currency} className={`acct-bal-line ${amountSignClass(number)}`}>
            {currency === operatingCurrency ? formatted : `${formatted} ${currency}`}
          </span>
        );
      })}
    </span>
  );
}

// Flatten the tree into a navigable list with depth info
interface FlatRow {
  node: AccountNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  path: string;
}

function flattenTree(
  nodes: AccountNode[],
  expandedSet: Set<string>,
  depth: number = 0,
): FlatRow[] {
  const result: FlatRow[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedSet.has(node.name);
    result.push({ node, depth, hasChildren, isExpanded, path: node.name });
    if (hasChildren && isExpanded) {
      result.push(...flattenTree(node.children, expandedSet, depth + 1));
    }
  }
  return result;
}

// CSS class suffix per ledgr-type for the colored badge
function typeBadgeClass(ledgrType: string): string {
  return `type-badge type-badge--${ledgrType}`;
}

export default function AccountTree({ accounts, selectedAccount, onSelect, onEdit }: Props) {
  const defaultPaymentAccount = useAppStore((s) => s.defaultPaymentAccount);
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    return new Set(accounts.map((a) => a.name));
  });
  const [focusIndex, setFocusIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const flatRows = flattenTree(accounts, expandedSet);

  const toggleExpand = useCallback((path: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, flatRows.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault();
        const row = flatRows[focusIndex];
        if (row && row.hasChildren && !row.isExpanded) {
          toggleExpand(row.path);
        }
      } else if (e.key === "ArrowLeft" || e.key === "h") {
        e.preventDefault();
        const row = flatRows[focusIndex];
        if (row && row.hasChildren && row.isExpanded) {
          toggleExpand(row.path);
        } else if (row && row.depth > 0) {
          const parentName = row.node.name.split(":").slice(0, -1).join(":");
          const parentIdx = flatRows.findIndex((r) => r.path === parentName);
          if (parentIdx >= 0) setFocusIndex(parentIdx);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = flatRows[focusIndex];
        if (row) onSelect(row.node.name);
      } else if (e.key === " ") {
        e.preventDefault();
        const row = flatRows[focusIndex];
        if (row && row.hasChildren) toggleExpand(row.path);
      } else if ((e.key === "e" || e.key === "E") && onEdit) {
        // E → open edit modal for focused account
        e.preventDefault();
        const row = flatRows[focusIndex];
        if (row) onEdit(row.node);
      }
    }

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [flatRows, focusIndex, toggleExpand, onSelect, onEdit]);

  // Scroll focused row into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const row = el.querySelector(`[data-idx="${focusIndex}"]`);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [focusIndex]);

  // Auto-focus on mount
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      className="acct-tree"
      ref={containerRef}
      tabIndex={0}
    >
      <div className="acct-tree-header">
        <span className="acct-tree-col-name">Account</span>
        <span className="acct-tree-col-bal">Balance</span>
      </div>
      {flatRows.map((row, i) => {
        const isFocused = i === focusIndex;
        const isSelected = row.node.name === selectedAccount;
        const zero = isZeroBalance(row.node.balance);
        const shortName =
          row.depth === 0
            ? row.node.name
            : (row.node.name.split(":").pop() || row.node.name);
        const showBadge =
          row.node.ledgr_type &&
          row.node.ledgr_type !== "general" &&
          row.node.open_date !== null;

        return (
          <div
            key={row.path}
            data-idx={i}
            className={
              `acct-row` +
              `${row.depth === 0 ? " acct-row-top" : ""}` +
              `${isFocused ? " acct-row-focused" : ""}` +
              `${isSelected ? " acct-row-selected" : ""}` +
              `${zero && row.depth > 0 ? " acct-row-zero" : ""}`
            }
            onClick={() => {
              setFocusIndex(i);
              if (row.hasChildren) toggleExpand(row.path);
              onSelect(row.node.name);
            }}
            onDoubleClick={() => {
              if (onEdit) onEdit(row.node);
            }}
          >
            <span className="acct-indent" style={{ width: row.depth * 16 }} />
            <span className="acct-toggle">
              {row.hasChildren ? (row.isExpanded ? "\u25BE" : "\u25B8") : ""}
            </span>
            <span className="acct-name">{shortName}</span>
            {showBadge && (
              <span className={typeBadgeClass(row.node.ledgr_type!)}>
                {row.node.ledgr_type}
              </span>
            )}
            {row.node.name === defaultPaymentAccount && (
              <span className="type-badge type-badge--default">default</span>
            )}
            <BalanceDisplay balances={row.node.balance} />
          </div>
        );
      })}
    </div>
  );
}

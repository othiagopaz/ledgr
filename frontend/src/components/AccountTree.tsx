import { useState, useEffect, useRef, useCallback } from "react";
import type { AccountNode, Balance } from "../types";
import { useAppStore } from "../stores/appStore";
import { formatAmount, amountSignClass, getLocale } from "../utils/format";
import { formatUnits } from "../utils/holdings";

interface Props {
  accounts: AccountNode[];
  selectedAccount: string | null;
  onSelect: (account: string) => void;
  onEdit?: (node: AccountNode) => void;
}

// ── Balance column ───────────────────────────────────────────────────
//
// One node, two lines at most. The primary line is `value`: the subtree total
// in the operating currency as the backend saw it through the conversion lens
// (market, cost, or plain units). Under it, only when the account holds
// something other than the operating currency, a single muted line lists the
// raw units — `-550,00 USD · 70 PETR4` — so the reader sees what is *in* the
// account, not only what it is worth. Units the lens could not value (no
// price, no cost) are marked; they are the part of the picture the number
// above does not include.

/** One non-OC commodity in an account, aggregated across lots. */
interface UnitLine {
  currency: string;
  /** Sum of the positions, as a decimal string with the widest precision seen. */
  number: string;
  /** True when the current lens could not bring this commodity into `value`. */
  unvalued: boolean;
}

/** Count of decimals in a decimal string ("33.5" → 1, "100" → 0). */
function decimalsOf(value: string): number {
  const i = value.indexOf(".");
  return i === -1 ? 0 : value.length - i - 1;
}

/**
 * The non-operating-currency side of a balance, one entry per commodity with
 * lots folded together: a FIFO account carries `40 PETR4 {25}` and `30 PETR4
 * {30}` as two positions, and the reader wants `70 PETR4`. The precision is
 * the widest the ledger used for that commodity, so `100` stays `100` and
 * `1000.00 USD` keeps its cents. Commodities that net to zero drop out.
 */
function unitLines(node: AccountNode, oc: string, markUnvalued: boolean): UnitLine[] {
  const sums = new Map<string, { total: number; decimals: number }>();
  for (const b of node.balance) {
    if (b.currency === oc) continue;
    const cur = sums.get(b.currency) ?? { total: 0, decimals: 0 };
    cur.total += parseFloat(b.number);
    cur.decimals = Math.max(cur.decimals, decimalsOf(b.number));
    sums.set(b.currency, cur);
  }
  const unvalued = new Set((node.other ?? []).map((o) => o.currency));
  const lines: UnitLine[] = [];
  for (const [currency, { total, decimals }] of sums) {
    const number = total.toFixed(decimals);
    if (Number(number) === 0) continue;
    lines.push({ currency, number, unvalued: markUnvalued && unvalued.has(currency) });
  }
  lines.sort((a, b) => a.currency.localeCompare(b.currency));
  return lines;
}

/** The operating-currency part of a raw balance; null when there is none. */
function ocPart(balances: Balance[], oc: string): number | null {
  let seen = false;
  let total = 0;
  for (const b of balances) {
    if (b.currency !== oc) continue;
    seen = true;
    total += parseFloat(b.number);
  }
  return seen ? total : null;
}

/**
 * The number for the primary line. `value` comes from the backend under the
 * lens; a payload that predates it (no `value` key at all) falls back to the
 * operating-currency part of the raw balance — what the tree showed before.
 */
function primaryValue(node: AccountNode, oc: string): number | null {
  if (node.value === undefined) return ocPart(node.balance, oc);
  return node.value === null ? null : parseFloat(node.value);
}

/**
 * Nothing to show: no value (or a value of zero) AND no units. An account
 * with 0 BRL and 100 PETR4 is not zero — the shares are the balance.
 */
function isZeroNode(node: AccountNode, oc: string): boolean {
  const value = primaryValue(node, oc);
  if (value !== null && value !== 0) return false;
  return unitLines(node, oc, false).length === 0;
}

function BalanceDisplay({ node }: { node: AccountNode }) {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const lens = useAppStore((s) => s.conversion);
  const locale = getLocale(operatingCurrency);

  const value = primaryValue(node, operatingCurrency);
  // Under `units` nothing outside the operating currency is valued, by
  // definition — marking every unit would only add noise. The marker earns
  // its place on the lenses that value most things and leave a few behind.
  const lines = unitLines(node, operatingCurrency, lens !== "units");

  if (value === null && lines.length === 0) {
    return <span className="acct-bal">—</span>;
  }

  const unitText = (line: UnitLine) =>
    `${formatUnits(line.number, null, locale)} ${line.currency}`;
  const unvaluedText = lines.filter((l) => l.unvalued).map(unitText);
  const lineTitle =
    lines.map(unitText).join(" · ") +
    (unvaluedText.length > 0
      ? `\n${unvaluedText.join(", ")} — not valued under this lens`
      : "");

  return (
    <span className="acct-bal acct-bal-stack">
      <span
        className={`acct-bal-primary ${
          value === null ? "acct-bal-none" : amountSignClass(value)
        }`}
      >
        {value === null ? "—" : formatAmount(value, operatingCurrency)}
      </span>
      {lines.length > 0 && (
        <span className="acct-bal-units" title={lineTitle}>
          {lines.map((line, i) => (
            <span key={line.currency}>
              {i > 0 && (
                <span className="acct-bal-sep" aria-hidden="true">
                  ·
                </span>
              )}
              <span
                className={`acct-bal-unit${line.unvalued ? " acct-bal-unit-unvalued" : ""}`}
                title={line.unvalued ? `${unitText(line)} — not valued under this lens` : undefined}
              >
                {unitText(line)}
              </span>
            </span>
          ))}
        </span>
      )}
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
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    return new Set(accounts.map((a) => a.name));
  });
  const [focusIndex, setFocusIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);

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
        const zero = isZeroNode(row.node, operatingCurrency);
        // A row holding non-OC units carries a second balance line, so it gets
        // the taller fixed height; every other row keeps the compact one.
        const multi = unitLines(row.node, operatingCurrency, false).length > 0;
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
              `${multi ? " acct-row-multi" : ""}` +
              `${isFocused ? " acct-row-focused" : ""}` +
              `${isSelected ? " acct-row-selected" : ""}` +
              `${zero && row.depth > 0 ? " acct-row-zero" : ""}` +
              `${row.node.closed ? " acct-row-closed" : ""}`
            }
            onClick={() => {
              setFocusIndex(i);
              onSelect(row.node.name);
            }}
            onDoubleClick={() => {
              if (onEdit) onEdit(row.node);
            }}
          >
            <span className="acct-indent" style={{ width: row.depth * 16 }} />
            {/* The chevron is its own button: clicking the row opens the
                account's register (navigating away), so an expand folded into
                the row click was invisible — the tree appeared keyboard-only.
                stopPropagation keeps expanding and opening separate. */}
            {row.hasChildren ? (
              <button
                type="button"
                className="acct-toggle"
                aria-expanded={row.isExpanded}
                aria-label={`${row.isExpanded ? "Collapse" : "Expand"} ${shortName}`}
                title={row.isExpanded ? "Collapse" : "Expand"}
                // Out of the tab order on purpose: the tree itself is the
                // single keyboard entry point (it owns the keydown listener
                // for arrows/Space), so Tab should not walk 26 chevrons.
                // Mouse users get the button; keyboard users get the tree.
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  setFocusIndex(i);
                  toggleExpand(row.path);
                  // Hand focus back to the tree. The tree owns the keydown
                  // listener, so leaving focus on the button would silently
                  // kill arrow-key navigation after any chevron click.
                  containerRef.current?.focus();
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <span className="acct-toggle-glyph" aria-hidden="true">
                  {row.isExpanded ? "▾" : "▸"}
                </span>
              </button>
            ) : (
              <span className="acct-toggle acct-toggle-empty" aria-hidden="true" />
            )}
            <span className="acct-name">{shortName}</span>
            {showBadge && (
              <span className={typeBadgeClass(row.node.ledgr_type!)}>
                {row.node.ledgr_type}
              </span>
            )}
            {row.node.closed && (
              <span
                className="type-badge type-badge--inactive"
                title={
                  row.node.close_date
                    ? `Inactive since ${row.node.close_date}`
                    : "Inactive"
                }
              >
                inactive
              </span>
            )}
            {/* Nothing has ever posted here or below it — a candidate to
                deactivate. Only worth flagging while the account is still
                active; on a closed one it is noise. */}
            {!row.node.closed &&
              row.node.subtree_posting_count === 0 &&
              row.node.open_date !== null && (
                <span
                  className="type-badge type-badge--unused"
                  title="No transactions ever — double-click to deactivate"
                >
                  unused
                </span>
              )}
            <BalanceDisplay node={row.node} />
            {/* Explicit edit affordance. Double-click also works, but the row's
                own onClick opens the register first, so the double-click was
                effectively invisible — same trap the chevron had. Its own
                button with stopPropagation keeps editing and navigating apart.
                tabIndex={-1} for the reason the chevron uses: the tree owns the
                keydown listener (E edits the focused row), so Tab must not walk
                every row's button. */}
            {onEdit && row.node.open_date !== null && (
              <button
                type="button"
                className="acct-edit"
                tabIndex={-1}
                aria-label={`Edit ${shortName}`}
                title="Edit account (E)"
                onClick={(e) => {
                  e.stopPropagation();
                  setFocusIndex(i);
                  onEdit(row.node);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <span aria-hidden="true">✎</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

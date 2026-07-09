import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTransactions } from "../api/client";
import { useAppStore } from "../stores/appStore";
import { formatDateShort, formatAmount, amountSignClass } from "../utils/format";
import type { Posting, Transaction } from "../types";

export interface DrillTarget {
  /** Full account name, e.g. "Expenses:Education". */
  account: string;
  /** Inclusive start date (YYYY-MM-DD). */
  fromDate: string;
  /** Exclusive end date (YYYY-MM-DD). */
  toDate: string;
  /** Human label for the header, e.g. "Education · 2026-01". */
  label: string;
}

interface Props {
  target: DrillTarget;
  onClose: () => void;
}

/** True if `account` is the target itself or one of its descendants. */
function inSubtree(account: string, target: string): boolean {
  return account === target || account.startsWith(target + ":");
}

/**
 * Net amount this transaction contributes to the target account (or its
 * subtree, when the target is a parent). Summing the subtree makes a parent
 * drill-down like Expenses:Financial show the same figure the report cell did,
 * rolling up all its children's postings.
 */
function subtreeAmount(postings: Posting[], target: string): number {
  return postings.reduce((sum, p) => {
    if (p.amount && inSubtree(p.account, target)) return sum + parseFloat(p.amount);
    return sum;
  }, 0);
}

/** Drop the root component ("Expenses:House:Taxes" → "House:Taxes"). */
function shortAccount(account: string): string {
  return account.split(":").slice(1).join(":") || account;
}

/**
 * What to show in the Transfer column.
 *
 * When the target is a **parent** account, the useful information is *which
 * child* of the target the money hit (e.g. House:Taxes, House:Rent) — the
 * counterpart bank is usually the same and less informative. So we show the
 * target's own sub-accounts that this transaction posted to.
 *
 * When the target is a **leaf** (the transaction posts to the exact account),
 * there is no sub-account to show, so we fall back to the counterparts — the
 * actual origin/destination accounts outside the target subtree.
 */
function transferDisplay(postings: Posting[], target: string): string {
  const subAccounts = postings
    .filter((p) => p.account.startsWith(target + ":"))
    .map((p) => p.account);

  const accounts = subAccounts.length > 0
    ? subAccounts // parent drill-down → show the debited child accounts
    : postings.filter((p) => !inSubtree(p.account, target)).map((p) => p.account);

  if (accounts.length === 0) return "—";
  // De-dupe while preserving order (a split can hit the same child twice).
  const unique = [...new Set(accounts)];
  return unique.map(shortAccount).join(", ");
}

/**
 * Lateral drill-down drawer: lists the transactions touching one account within
 * one period. Opened from report cells and budget envelope rows. Reads the
 * existing /api/transactions endpoint (account + date range); clicking a row
 * opens the shared TransactionModal for editing.
 */
export default function TransactionDrawer({ target, onClose }: Props) {
  const openTxnModal = useAppStore((s) => s.openTxnModal);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", "drill", target.account, target.fromDate, target.toDate, viewMode],
    queryFn: () =>
      fetchTransactions(target.account, target.fromDate, target.toDate, viewMode),
  });

  const transactions = data?.transactions ?? [];
  const sorted = [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.lineno ?? 0) - (a.lineno ?? 0),
  );

  // Per-row net amount (subtree-aware) and the period total.
  const rowAmount = (txn: Transaction) => subtreeAmount(txn.postings, target.account);
  const total = sorted.reduce((sum, txn) => sum + rowAmount(txn), 0);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-label={`Transactions for ${target.label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-header-titles">
            <span className="drawer-account">{target.account}</span>
            <span className="drawer-period">{target.label}</span>
          </div>
          <button className="drawer-close" onClick={onClose} title="Close (Esc)">
            &times;
          </button>
        </div>

        <div className="drawer-body">
          {isLoading && <div className="welcome">Loading transactions…</div>}

          {!isLoading && sorted.length === 0 && (
            <div className="welcome">No transactions in this period.</div>
          )}

          {sorted.length > 0 && (
            <table className="register">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Date</th>
                  <th style={{ width: 140 }}>Payee</th>
                  <th>Narration</th>
                  <th>Transfer</th>
                  <th className="num" style={{ width: 110 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((txn, i) => {
                  const amount = rowAmount(txn);
                  return (
                    <tr
                      key={txn.lineno ?? i}
                      className={`row ${i % 2 === 0 ? "row-even" : "row-odd"}`}
                      onClick={() => openTxnModal(txn)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{formatDateShort(txn.date, operatingCurrency)}</td>
                      <td>{txn.payee || <span className="text-muted">—</span>}</td>
                      <td>{txn.narration || <span className="text-muted">—</span>}</td>
                      <td className="transfer">
                        {transferDisplay(txn.postings, target.account)}
                      </td>
                      <td className={`num amount ${amountSignClass(amount)}`}>
                        {formatAmount(amount, operatingCurrency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="drawer-total-row">
                  <td colSpan={4} className="drawer-total-label">
                    Total · {sorted.length} {sorted.length === 1 ? "transaction" : "transactions"}
                  </td>
                  <td className={`num amount ${amountSignClass(total)}`}>
                    {formatAmount(total, operatingCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

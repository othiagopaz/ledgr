import { useState } from "react";
import type { Transaction } from "../types";
import { deleteTransaction } from "../api/client";

interface Props {
  account: string;
  transactions: Transaction[];
  onEdit: (txn: Transaction) => void;
  onMutated: () => void;
}

function formatAmount(amount: string | null): { text: string; cls: string } {
  if (!amount) return { text: "—", cls: "" };
  const n = parseFloat(amount);
  const formatted = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n > 0) return { text: formatted, cls: "positive" };
  if (n < 0) return { text: formatted, cls: "negative" };
  return { text: formatted, cls: "" };
}

function getTransferAccount(txn: Transaction, currentAccount: string): string {
  const others = txn.postings.filter((p) => p.account !== currentAccount);
  if (others.length === 0) return "—";
  if (others.length === 1) {
    const parts = others[0].account.split(":");
    return parts.length > 2 ? parts.slice(1).join(":") : others[0].account;
  }
  return "— Split —";
}

function getAccountPosting(txn: Transaction, account: string) {
  return txn.postings.find((p) => p.account === account);
}

function formatCostBasis(posting: ReturnType<typeof getAccountPosting>): string | null {
  if (!posting) return null;
  if (posting.cost && posting.cost_currency) {
    const cost = parseFloat(posting.cost).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `{${cost} ${posting.cost_currency}}`;
  }
  if (posting.price && posting.price_currency) {
    const price = parseFloat(posting.price).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    return `@ ${price} ${posting.price_currency}`;
  }
  return null;
}

export default function AccountRegister({ account, transactions, onEdit, onMutated }: Props) {
  const [deletingLineno, setDeletingLineno] = useState<number | null>(null);

  const shortName = account.split(":").length > 2
    ? account.split(":").slice(1).join(":")
    : account;

  // Compute running balance (oldest first)
  const sorted = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  let runningBalance = 0;
  const rows = sorted.map((txn) => {
    const posting = getAccountPosting(txn, account);
    const amount = posting?.amount ? parseFloat(posting.amount) : 0;
    runningBalance += amount;
    return { txn, posting, amount, balance: runningBalance };
  });

  // Display newest first
  rows.reverse();

  async function handleDelete(lineno: number) {
    if (deletingLineno !== null) return;
    setDeletingLineno(lineno);
    try {
      const result = await deleteTransaction(lineno);
      if (result.success) {
        onMutated();
      }
    } finally {
      setDeletingLineno(null);
    }
  }

  return (
    <div className="register">
      <div className="register-header">{shortName}</div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 24 }}></th>
            <th style={{ width: 80 }}>Date</th>
            <th>Payee / Narration</th>
            <th>Transfer</th>
            <th className="num" style={{ width: 90 }}>Debit</th>
            <th className="num" style={{ width: 90 }}>Credit</th>
            <th className="num" style={{ width: 100 }}>Balance</th>
            <th style={{ width: 50 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isPending = row.txn.flag === "!";
            const debit = row.amount > 0 ? formatAmount(String(row.amount)) : null;
            const credit = row.amount < 0 ? formatAmount(String(row.amount)) : null;
            const bal = row.balance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            const description = [row.txn.payee, row.txn.narration]
              .filter(Boolean)
              .join(" — ");
            const costBasis = formatCostBasis(row.posting);
            const hasTags = row.txn.tags.length > 0;
            const hasLinks = row.txn.links.length > 0;

            return (
              <tr
                key={i}
                className={`${isPending ? "pending" : ""} register-row`}
                onClick={() => onEdit(row.txn)}
              >
                <td className={`flag ${isPending ? "flag-pending" : "flag-confirmed"}`}>
                  {row.txn.flag}
                </td>
                <td>{row.txn.date.slice(5)}</td>
                <td>
                  <span>{description || "—"}</span>
                  {costBasis && (
                    <span className="cost-basis">{costBasis}</span>
                  )}
                  {(hasTags || hasLinks) && (
                    <span className="txn-meta">
                      {row.txn.tags.map((t) => (
                        <span key={t} className="tag">#{t}</span>
                      ))}
                      {row.txn.links.map((l) => (
                        <span key={l} className="link">^{l}</span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="transfer">
                  {getTransferAccount(row.txn, account)}
                </td>
                <td className={`num amount ${debit?.cls || ""}`}>
                  {debit?.text || ""}
                </td>
                <td className={`num amount ${credit?.cls || ""}`}>
                  {credit?.text || ""}
                </td>
                <td className={`num amount ${row.balance >= 0 ? "positive" : "negative"}`}>
                  {bal}
                </td>
                <td className="actions" onClick={(e) => e.stopPropagation()}>
                  {row.txn.lineno != null && (
                    <button
                      className="delete-btn"
                      title="Delete transaction"
                      disabled={deletingLineno === row.txn.lineno}
                      onClick={() => {
                        if (confirm("Delete this transaction?")) {
                          handleDelete(row.txn.lineno!);
                        }
                      }}
                    >
                      &times;
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

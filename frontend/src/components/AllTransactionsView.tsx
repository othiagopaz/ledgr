import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTransactions, deleteTransaction } from "../api/client";
import { useAppStore } from "../stores/appStore";
import { formatDateShort, formatAmount, formatInstallmentBadge } from "../utils/format";

interface AllTransactionsViewProps {
  onMutated: () => void;
}

export default function AllTransactionsView({
  onMutated,
}: AllTransactionsViewProps) {
  const openTxnModal = useAppStore((s) => s.openTxnModal);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const [deletingLineno, setDeletingLineno] = useState<number | null>(null);

  const viewMode = useAppStore((s) => s.viewMode);

  const txnsQuery = useQuery({
    queryKey: ["transactions", viewMode],
    queryFn: () => fetchTransactions(undefined, undefined, undefined, viewMode),
  });

  const transactions = txnsQuery.data?.transactions || [];

  // Sort by date descending
  const sorted = [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.lineno ?? 0) - (a.lineno ?? 0)
  );

  async function handleDelete(lineno: number) {
    try {
      const result = await deleteTransaction(lineno);
      if (result.success) {
        onMutated();
      }
    } finally {
      setDeletingLineno(null);
    }
  }

  function summarizeAccounts(postings: { account: string }[]): string {
    if (postings.length <= 2) {
      return postings.map((p) => p.account.split(":").pop()).join(" → ");
    }
    return `${postings.length} accounts`;
  }

  function summarizeAmount(
    postings: { amount: string | null; currency: string | null }[]
  ): string {
    // Show the first posting with a positive amount, or "Split" for complex
    if (postings.length > 2) return "Split";
    const first = postings[0];
    if (first?.amount) {
      return formatAmount(parseFloat(first.amount), first.currency || operatingCurrency);
    }
    return "";
  }

  return (
    <div className="all-transactions">
      <div className="all-transactions-header">
        <h2>All Transactions</h2>
        <button className="btn btn-primary" onClick={() => openTxnModal()}>
          + New Transaction
        </button>
      </div>

      {txnsQuery.isLoading && (
        <div className="welcome">Loading transactions...</div>
      )}

      {!txnsQuery.isLoading && sorted.length === 0 && (
        <div className="welcome">
          No transactions yet.{" "}
          <button
            className="btn btn-primary"
            onClick={() => openTxnModal()}
          >
            Create your first transaction
          </button>
        </div>
      )}

      {sorted.length > 0 && (
        <table className="register">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Date</th>
              <th style={{ width: 20 }}>F</th>
              <th>Payee / Narration</th>
              <th>Accounts</th>
              <th style={{ width: 80 }}>Tags</th>
              <th style={{ width: 100, textAlign: "right" }}>Amount</th>
              <th style={{ width: 60 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((txn, i) => (
              <tr
                key={txn.lineno ?? i}
                className={`row ${i % 2 === 0 ? "row-even" : "row-odd"}`}
                onClick={() => openTxnModal(txn)}
                style={{ cursor: "pointer" }}
              >
                <td>{formatDateShort(txn.date, operatingCurrency)}</td>
                <td
                  className={
                    txn.flag === "*" ? "flag-confirmed" : "flag-pending"
                  }
                >
                  {txn.flag}
                </td>
                <td>
                  {txn.metadata?.['ledgr-series-type'] === 'recurring' && (
                    <span className="series-inline-badge series-inline-recurring" title="Recurring">Recurring</span>
                  )}
                  {txn.metadata?.['ledgr-series-type'] === 'installment' && (
                    <span className="series-inline-badge series-inline-installment" title="Installment">
                      {txn.metadata['ledgr-series-seq'] != null && txn.metadata['ledgr-series-total'] != null
                        ? formatInstallmentBadge(txn.metadata['ledgr-series-seq'], txn.metadata['ledgr-series-total'])
                        : '#'}
                    </span>
                  )}
                  {txn.payee && (
                    <span className="payee">{txn.payee}</span>
                  )}
                  {txn.payee && txn.narration && " — "}
                  {txn.narration && (
                    <span className="narration">{txn.narration}</span>
                  )}
                </td>
                <td className="accounts-summary">
                  {summarizeAccounts(txn.postings)}
                </td>
                <td className="tags-col">
                  {txn.tags.map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                  {txn.links.map((l) => (
                    <span key={l} className="link">
                      ^{l}
                    </span>
                  ))}
                </td>
                <td className="num amount">{summarizeAmount(txn.postings)}</td>
                <td className="actions">
                  {deletingLineno === txn.lineno ? (
                    <>
                      <button
                        className="action-btn confirm-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (txn.lineno != null) handleDelete(txn.lineno);
                        }}
                        title="Confirm delete"
                      >
                        Yes
                      </button>
                      <button
                        className="action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingLineno(null);
                        }}
                        title="Cancel"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      className="action-btn delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (txn.lineno != null) setDeletingLineno(txn.lineno);
                      }}
                      title="Delete transaction"
                    >
                      &times;
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

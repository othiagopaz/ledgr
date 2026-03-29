import { useState, useCallback, useEffect, useRef } from "react";
import type { Transaction, TransactionInput } from "../types";
import { addTransaction, editTransaction, deleteTransaction } from "../api/client";
import { useAppStore } from "../stores/appStore";
import { formatAmount, formatDateFull, getLocale } from "../utils/format";
import InlineEditor from "./InlineEditor";

interface Props {
  account: string;
  transactions: Transaction[];
  onMutated: () => void;
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

function formatCostBasis(posting: ReturnType<typeof getAccountPosting>, currency: string): string | null {
  if (!posting) return null;
  const locale = getLocale(currency);
  if (posting.cost && posting.cost_currency) {
    const cost = parseFloat(posting.cost).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `{${cost} ${posting.cost_currency}}`;
  }
  if (posting.price && posting.price_currency) {
    const price = parseFloat(posting.price).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    return `@ ${price} ${posting.price_currency}`;
  }
  return null;
}

export default function AccountRegister({ account, transactions, onMutated }: Props) {
  const [deletingLineno, setDeletingLineno] = useState<number | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  // Increment this to force remount of the new-row InlineEditor after save
  const [newRowKey, setNewRowKey] = useState(0);
  // Remember the last date used when creating a new transaction
  const [lastUsedDate, setLastUsedDate] = useState<string | null>(null);
  // Track which split transactions are expanded
  const [expandedSplits, setExpandedSplits] = useState<Set<number>>(new Set());
  const registerRef = useRef<HTMLDivElement>(null);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const newTxnRequestId = useAppStore((s) => s.newTxnRequestId);
  const txnModalOpen = useAppStore((s) => s.txnModalOpen);

  // Refocus register when modal closes
  useEffect(() => {
    if (!txnModalOpen) {
      requestAnimationFrame(() => registerRef.current?.focus());
    }
  }, [txnModalOpen]);

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

  // Display oldest first, newest at bottom (above the new-row editor)

  // "new row" is conceptually the last navigable row
  const NEW_ROW_INDEX = rows.length;

  // Auto-focus register on mount so keyboard nav works immediately
  useEffect(() => {
    registerRef.current?.focus();
  }, []);

  // React to Cmd+N / command palette "New Transaction" signal
  useEffect(() => {
    if (newTxnRequestId > 0) {
      setSelectedRowIndex(NEW_ROW_INDEX);
      setEditingRowIndex(NEW_ROW_INDEX);
    }
  }, [newTxnRequestId, NEW_ROW_INDEX]);

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

  async function handleNewSave(input: TransactionInput) {
    const result = await addTransaction(input);
    if (result.success) {
      // Remember the date for the next new transaction
      setLastUsedDate(input.date);
      setEditingRowIndex(null);
      // Increment key to force remount → clears all fields
      setNewRowKey((k) => k + 1);
      onMutated();
      // Refocus register so keyboard nav works immediately after save
      requestAnimationFrame(() => registerRef.current?.focus());
    }
  }

  async function handleEditSave(lineno: number, input: TransactionInput) {
    const result = await editTransaction({ ...input, lineno });
    if (result.success) {
      setEditingRowIndex(null);
      onMutated();
      // Refocus register so keyboard nav works immediately after save
      requestAnimationFrame(() => registerRef.current?.focus());
    }
  }

  const openTxnModal = useAppStore((s) => s.openTxnModal);

  const enterEditMode = useCallback((index: number) => {
    // For split transactions (>2 postings), open modal instead of inline editor
    if (index < rows.length && rows[index].txn.postings.length > 2) {
      openTxnModal(rows[index].txn);
      return;
    }
    setSelectedRowIndex(index);
    setEditingRowIndex(index);
  }, [rows, openTxnModal]);

  const exitEditMode = useCallback(() => {
    setEditingRowIndex(null);
    // Keep selectedRowIndex so user can continue navigating
    // Refocus the register div so arrow keys work immediately
    requestAnimationFrame(() => registerRef.current?.focus());
  }, []);

  // Keyboard navigation — GnuCash style
  function handleKeyDown(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName;
    const isInEditor = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    // Escape always exits edit mode
    if (e.key === "Escape" && editingRowIndex !== null) {
      e.preventDefault();
      exitEditMode();
      return;
    }

    // When inside an editor input, don't hijack arrow keys (let the editor handle Tab/Enter/Escape)
    if (isInEditor) return;

    // If we're in edit mode but focus is on a non-input element (e.g. the reconciliation toggle),
    // Enter should NOT re-enter edit mode — it should be ignored here and let the
    // user click Save or press Enter in an input field.
    if (e.key === "Enter" && editingRowIndex !== null) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setEditingRowIndex(null); // exit edit mode on nav
      setSelectedRowIndex((i) =>
        i === null ? 0 : Math.min(i + 1, NEW_ROW_INDEX)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setEditingRowIndex(null);
      setSelectedRowIndex((i) => (i === null ? 0 : Math.max(i - 1, 0)));
    } else if (e.key === "Enter" && selectedRowIndex !== null) {
      e.preventDefault();
      enterEditMode(selectedRowIndex);
    } else if ((e.key === "r" || e.key === "R") && selectedRowIndex !== null && selectedRowIndex < rows.length) {
      e.preventDefault();
      const row = rows[selectedRowIndex];
      if (row.txn.lineno != null) {
        const newFlag = row.txn.flag === "*" ? "!" : "*";
        handleEditSave(row.txn.lineno, {
          date: row.txn.date,
          flag: newFlag,
          payee: row.txn.payee,
          narration: row.txn.narration,
          postings: row.txn.postings.map((p) => ({
            account: p.account,
            amount: p.amount ? parseFloat(p.amount) : undefined,
            currency: p.currency,
          })),
        });
      }
    } else if (e.key === "e" && selectedRowIndex !== null && selectedRowIndex < rows.length) {
      e.preventDefault();
      openTxnModal(rows[selectedRowIndex].txn);
    } else if (e.key === "Delete" && selectedRowIndex !== null && selectedRowIndex < rows.length) {
      const row = rows[selectedRowIndex];
      if (row.txn.lineno != null && confirm("Delete this transaction?")) {
        handleDelete(row.txn.lineno);
      }
    }
  }

  return (
    <div
      className="register"
      tabIndex={0}
      ref={registerRef}
      onKeyDown={handleKeyDown}
      /* Grab focus when user clicks anywhere in the register area */
      onClick={() => registerRef.current?.focus()}
    >
      <div className="register-header">{shortName}</div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 90 }}>Date</th>
            <th>Payee / Narration</th>
            <th>Transfer</th>
            <th className="num" style={{ width: 28 }}>R</th>
            <th className="num" style={{ width: 100 }}>Debit</th>
            <th className="num" style={{ width: 100 }}>Credit</th>
            <th className="num" style={{ width: 110 }}>Balance</th>
            <th style={{ width: 36 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isEditing = editingRowIndex === i;
            const isSelected = selectedRowIndex === i && editingRowIndex === null;
            const isSplit = row.txn.postings.length > 2;
            const isExpanded = expandedSplits.has(i);

            if (isEditing) {
              return (
                <InlineEditor
                  key={`edit-${i}`}
                  currentAccount={account}
                  transaction={row.txn}
                  onSave={(input: TransactionInput) =>
                    handleEditSave(row.txn.lineno!, input)
                  }
                  onCancel={exitEditMode}
                />
              );
            }

            const isPending = row.txn.flag === "!";
            const seriesType = row.txn.metadata?.['ledgr-series-type'];
            const seriesSeq = row.txn.metadata?.['ledgr-series-seq'];
            const seriesTotal = row.txn.metadata?.['ledgr-series-total'];
            const debitVal = row.amount > 0 ? formatAmount(row.amount, operatingCurrency) : "";
            const creditVal = row.amount < 0 ? formatAmount(Math.abs(row.amount), operatingCurrency) : "";
            const bal = formatAmount(row.balance, operatingCurrency);
            const description = [row.txn.payee, row.txn.narration]
              .filter(Boolean)
              .join(" — ");
            const costBasis = formatCostBasis(row.posting, operatingCurrency);
            const hasTags = row.txn.tags.length > 0;
            const hasLinks = row.txn.links.length > 0;
            const reconciled = row.txn.flag === "*" ? "y" : "n";

            const mainRow = (
              <tr
                key={i}
                className={`register-row${isPending ? " pending" : ""}${isSelected ? " row-selected" : ""}${isSplit ? " register-row-split" : ""}`}
                onClick={() => enterEditMode(i)}
              >
                <td>{formatDateFull(row.txn.date, operatingCurrency)}</td>
                <td>
                  <span>{description || "—"}</span>
                  {seriesType === 'recurring' && (
                    <span className="series-inline-badge series-inline-recurring" title="Recurring">Recurring</span>
                  )}
                  {seriesType === 'installment' && (
                    <span className="series-inline-badge series-inline-installment" title="Installment">
                      {seriesSeq != null && seriesTotal != null ? `${seriesSeq}/${seriesTotal}` : '#'}
                    </span>
                  )}
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
                  {isSplit ? (
                    <span
                      className="split-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSplits((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                    >
                      <span className="split-arrow">{isExpanded ? "▾" : "▸"}</span>
                      — Split —
                    </span>
                  ) : (
                    getTransferAccount(row.txn, account)
                  )}
                </td>
                <td className={`reconciled ${reconciled === "y" ? "reconciled-yes" : "reconciled-no"}`}>
                  {reconciled}
                </td>
                <td className={`num amount ${row.amount > 0 ? "positive" : ""}`}>
                  {debitVal}
                </td>
                <td className={`num amount ${row.amount < 0 ? "negative" : ""}`}>
                  {creditVal}
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

            if (!isSplit || !isExpanded) return mainRow;

            // Render expanded split detail rows
            const splitRows = row.txn.postings.map((p, pi) => {
              const amt = p.amount ? parseFloat(p.amount) : 0;
              const shortAcct = p.account.split(":").length > 2
                ? p.account.split(":").slice(1).join(":")
                : p.account;
              const isCurrentAcct = p.account === account;
              return (
                <tr key={`${i}-split-${pi}`} className="register-split-row">
                  <td></td>
                  <td
                    className={`register-split-account${isCurrentAcct ? " register-split-current" : ""}`}
                    colSpan={2}
                  >
                    {shortAcct}
                  </td>
                  <td></td>
                  <td className={`num amount ${amt > 0 ? "positive" : ""}`}>
                    {amt > 0 ? formatAmount(amt, operatingCurrency) : ""}
                  </td>
                  <td className={`num amount ${amt < 0 ? "negative" : ""}`}>
                    {amt < 0 ? formatAmount(Math.abs(amt), operatingCurrency) : ""}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              );
            });

            return [mainRow, ...splitRows];
          })}

          {/* New transaction row — always at BOTTOM, like GnuCash */}
          {editingRowIndex === NEW_ROW_INDEX ? (
            <InlineEditor
              key={`new-${newRowKey}`}
              currentAccount={account}
              suggestedDate={lastUsedDate || undefined}
              onSave={handleNewSave}
              onCancel={exitEditMode}
            />
          ) : (
            <tr
              className={`register-row register-row-new${selectedRowIndex === NEW_ROW_INDEX && editingRowIndex === null ? " row-selected" : ""}`}
              onClick={() => enterEditMode(NEW_ROW_INDEX)}
            >
              <td style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                {formatDateFull(new Date().toISOString().slice(0, 10), operatingCurrency)}
              </td>
              <td style={{ color: "var(--text-muted)", fontStyle: "italic" }}>New transaction…</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

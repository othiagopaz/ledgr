import { useState, useRef, useEffect } from "react";
import { fetchAccountNames, fetchPayees, fetchSuggestions } from "../api/client";
import { useQuery } from "@tanstack/react-query";
import type { TransactionInput } from "../types";
import type { Transaction } from "../types";
import { useAppStore } from "../stores/appStore";
import { getDatePlaceholder, formatDateFull } from "../utils/format";
import { today, parseSmartDate } from "../utils/dateUtils";
import InlineAutocomplete from "./InlineAutocomplete";

interface InlineEditorProps {
  currentAccount: string;
  transaction?: Transaction;
  suggestedDate?: string;
  onSave: (input: TransactionInput) => Promise<void>;
  onCancel: () => void;
}

export default function InlineEditor({
  currentAccount,
  transaction,
  suggestedDate,
  onSave,
  onCancel,
}: InlineEditorProps) {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const isEditing = !!transaction;

  // Parse existing transaction for editing
  const existingPosting = transaction?.postings.find(
    (p) => p.account === currentAccount
  );
  const existingTransfer = transaction?.postings.find(
    (p) => p.account !== currentAccount
  );
  const existingAmount = existingPosting?.amount
    ? parseFloat(existingPosting.amount)
    : 0;

  const [flag, setFlag] = useState(transaction?.flag || "*");
  const [date, setDate] = useState(() => {
    if (transaction?.date) {
      return formatDateFull(transaction.date, operatingCurrency);
    }
    if (suggestedDate) {
      return formatDateFull(suggestedDate, operatingCurrency);
    }
    return formatDateFull(today(), operatingCurrency);
  });
  const [payeeNarration, setPayeeNarration] = useState(() => {
    if (!transaction) return "";
    return [transaction.payee, transaction.narration]
      .filter(Boolean)
      .join(" — ");
  });
  const [transfer, setTransfer] = useState(existingTransfer?.account || "");
  const [debit, setDebit] = useState(
    existingAmount > 0 ? String(existingAmount) : ""
  );
  const [credit, setCredit] = useState(
    existingAmount < 0 ? String(Math.abs(existingAmount)) : ""
  );
  const [saving, setSaving] = useState(false);

  const dateRef = useRef<HTMLInputElement>(null);
  const payeeRef = useRef<HTMLInputElement>(null);
  const transferRef = useRef<HTMLInputElement>(null);
  const reconcileRef = useRef<HTMLButtonElement>(null);
  const debitRef = useRef<HTMLInputElement>(null);
  const creditRef = useRef<HTMLInputElement>(null);

  const accountNamesQuery = useQuery({
    queryKey: ["account-names"],
    queryFn: fetchAccountNames,
  });

  const payeesQuery = useQuery({
    queryKey: ["payees"],
    queryFn: fetchPayees,
  });

  useEffect(() => {
    dateRef.current?.focus();
    dateRef.current?.select();
  }, []);

  async function handlePayeeSelect(selectedPayee: string) {
    try {
      const suggestion = await fetchSuggestions(selectedPayee);
      if (suggestion.account && !transfer) {
        setTransfer(suggestion.account);
      }
      if (suggestion.amount && !debit && !credit) {
        const amt = parseFloat(suggestion.amount);
        if (amt > 0) {
          setDebit(suggestion.amount);
        } else {
          setCredit(String(Math.abs(amt)));
        }
      }
    } catch {
      // Suggestion failed, that's fine
    }
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);

    const parsedDate = parseSmartDate(date);

    // Parse payee — narration
    let payee = "";
    let narration = "";
    if (payeeNarration.includes(" — ")) {
      const parts = payeeNarration.split(" — ");
      payee = parts[0].trim();
      narration = parts.slice(1).join(" — ").trim();
    } else {
      narration = payeeNarration;
    }

    // Build postings
    const debitAmount = debit ? parseFloat(debit) : 0;
    const creditAmount = credit ? parseFloat(credit) : 0;

    let transferAmount: number;
    let currentAmount: number;

    if (debitAmount > 0) {
      // Debit to current account = positive for current, negative for transfer
      currentAmount = debitAmount;
      transferAmount = -debitAmount;
    } else if (creditAmount > 0) {
      // Credit to current account = negative for current, positive for transfer
      currentAmount = -creditAmount;
      transferAmount = creditAmount;
    } else {
      setSaving(false);
      return;
    }

    const input: TransactionInput = {
      date: parsedDate,
      flag,
      payee,
      narration,
      postings: [
        {
          account: transfer || currentAccount,
          amount: transferAmount,
          currency: operatingCurrency,
        },
        {
          account: currentAccount,
          amount: currentAmount,
          currency: operatingCurrency,
        },
      ],
    };

    try {
      await onSave(input);
    } finally {
      setSaving(false);
    }
  }

  function handleGlobalKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  function handleTab(e: React.KeyboardEvent, nextRef: React.RefObject<HTMLElement | null> | null) {
    if (e.key === "Tab" && !e.shiftKey) {
      if (nextRef) {
        e.preventDefault();
        nextRef.current?.focus();
        if (nextRef.current && 'select' in nextRef.current) {
          (nextRef.current as HTMLInputElement).select();
        }
      } else {
        // Last field, save
        e.preventDefault();
        handleSave();
      }
    }
  }

  const datePlaceholder = getDatePlaceholder(operatingCurrency);

  return (
    <tr className={`inline-editor${isEditing ? " inline-editor-editing" : " inline-editor-new"}`}>
      <td>
        <input
          ref={dateRef}
          type="text"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onBlur={() => {
            const parsed = parseSmartDate(date);
            // Re-format for display if it parsed to a valid ISO date
            if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
              setDate(formatDateFull(parsed, operatingCurrency));
            }
          }}
          onKeyDown={(e) => {
            handleGlobalKeyDown(e);
            handleTab(e, payeeRef);
          }}
          placeholder={datePlaceholder}
          style={{ width: "100%" }}
        />
      </td>
      <td>
        <InlineAutocomplete
          value={payeeNarration}
          onChange={setPayeeNarration}
          onSelect={handlePayeeSelect}
          options={payeesQuery.data?.payees || []}
          placeholder="Description"
          inputRef={payeeRef}
          onKeyDown={(e) => {
            handleGlobalKeyDown(e);
            handleTab(e, transferRef);
          }}
        />
      </td>
      <td>
        <InlineAutocomplete
          value={transfer}
          onChange={setTransfer}
          options={accountNamesQuery.data?.accounts || []}
          placeholder="Transfer"
          inputRef={transferRef}
          onKeyDown={(e) => {
            handleGlobalKeyDown(e);
            handleTab(e, reconcileRef);
          }}
        />
      </td>
      <td className={`reconciled ${flag === "*" ? "reconciled-yes" : "reconciled-no"}`}>
        <button
          ref={reconcileRef}
          type="button"
          className="reconcile-toggle"
          onClick={() => setFlag(flag === "*" ? "!" : "*")}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              if (e.key === " ") {
                setFlag(flag === "*" ? "!" : "*");
              } else {
                // Enter = save the whole row
                handleSave();
              }
            } else if (e.key === "Escape") {
              onCancel();
            } else if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              debitRef.current?.focus();
              debitRef.current?.select();
            }
          }}
          title={flag === "*" ? "Confirmed — Space to toggle" : "Pending — Space to toggle"}
        >
          {flag === "*" ? "y" : "n"}
        </button>
      </td>
      <td>
        <input
          ref={debitRef}
          type="number"
          step="0.01"
          value={debit}
          onChange={(e) => {
            setDebit(e.target.value);
            if (e.target.value) setCredit("");
          }}
          onKeyDown={(e) => {
            handleGlobalKeyDown(e);
            handleTab(e, creditRef);
          }}
          placeholder="Debit"
        />
      </td>
      <td>
        <input
          ref={creditRef}
          type="number"
          step="0.01"
          value={credit}
          onChange={(e) => {
            setCredit(e.target.value);
            if (e.target.value) setDebit("");
          }}
          onKeyDown={(e) => {
            handleGlobalKeyDown(e);
            handleTab(e, null);
          }}
          placeholder="Credit"
        />
      </td>
      <td className="num amount" style={{ color: "var(--text-muted)" }}>
        Balance
      </td>
      <td className="actions">
        {saving ? (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>...</span>
        ) : null}
      </td>
    </tr>
  );
}

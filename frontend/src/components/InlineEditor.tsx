import { useState, useRef, useEffect } from "react";
import { fetchAccountNames, fetchPayees, fetchSuggestions } from "../api/client";
import { useQuery } from "@tanstack/react-query";
import type { Transaction, TransactionInput } from "../types";
import { useAppStore } from "../stores/appStore";
import { getDatePlaceholder, formatDateFull } from "../utils/format";

interface InlineEditorProps {
  currentAccount: string;
  transaction?: Transaction;
  onSave: (input: TransactionInput) => Promise<void>;
  onCancel: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseSmartDate(input: string): string {
  const lower = input.trim().toLowerCase();
  if (lower === "t" || lower === "today") return today();
  if (lower === "y" || lower === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  // Try DD/MM/YYYY or MM/DD/YYYY patterns
  const fullMatch = lower.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fullMatch) {
    // Guess: if first number > 12, it's DD/MM/YYYY
    const a = parseInt(fullMatch[1]);
    const b = parseInt(fullMatch[2]);
    const year = fullMatch[3];
    if (a > 12) {
      // DD/MM/YYYY
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    // Default to MM/DD/YYYY for ambiguous cases, unless locale suggests otherwise
    const locale = useAppStore.getState().locale;
    const currency = useAppStore.getState().operatingCurrency;
    const isDayFirst = locale?.startsWith("pt") || locale?.startsWith("de") || locale?.startsWith("es") || locale?.startsWith("fr") || currency === "BRL" || currency === "EUR";
    if (isDayFirst) {
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    return `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  // Try partial date like "03/15" or "15/03"
  const slashMatch = lower.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1]);
    const b = parseInt(slashMatch[2]);
    const year = new Date().getFullYear();

    const locale = useAppStore.getState().locale;
    const currency = useAppStore.getState().operatingCurrency;
    const isDayFirst = locale?.startsWith("pt") || locale?.startsWith("de") || locale?.startsWith("es") || locale?.startsWith("fr") || currency === "BRL" || currency === "EUR";

    if (isDayFirst) {
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    return `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  // If it looks like a valid ISO date already, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  return input;
}

function InlineAutocomplete({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  inputRef,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (v: string) => void;
  options: string[];
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = value
    ? options
        .filter((o) => o.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 15)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="autocomplete-wrapper" ref={wrapperRef}>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => value && setOpen(true)}
        onKeyDown={(e) => {
          if (open && filtered.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" && activeIdx >= 0) {
              e.preventDefault();
              e.stopPropagation();
              const selected = filtered[activeIdx];
              onChange(selected);
              onSelect?.(selected);
              setOpen(false);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="autocomplete-list">
          {filtered.map((item, i) => (
            <div
              key={item}
              className={`item${i === activeIdx ? " active" : ""}`}
              onMouseDown={() => {
                onChange(item);
                onSelect?.(item);
                setOpen(false);
              }}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InlineEditor({
  currentAccount,
  transaction,
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

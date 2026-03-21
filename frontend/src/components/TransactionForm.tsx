import { useState, useEffect, useRef } from "react";
import { addTransaction, editTransaction, fetchAccountNames, fetchPayees } from "../api/client";
import type { PostingInput, Transaction } from "../types";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  editingTxn?: Transaction | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function Autocomplete({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase())).slice(0, 20)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="autocomplete-wrapper" ref={ref}>
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onFocus={() => value && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && activeIdx >= 0) {
            e.preventDefault();
            onChange(filtered[activeIdx]);
            setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
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

export default function TransactionForm({ onClose, onSuccess, editingTxn }: Props) {
  const isEditing = !!editingTxn;

  const [date, setDate] = useState(editingTxn?.date || today());
  const [flag, setFlag] = useState(editingTxn?.flag || "*");
  const [payee, setPayee] = useState(editingTxn?.payee || "");
  const [narration, setNarration] = useState(editingTxn?.narration || "");
  const [postings, setPostings] = useState<PostingInput[]>(() => {
    if (editingTxn) {
      return editingTxn.postings.map((p) => ({
        account: p.account,
        amount: p.amount ? parseFloat(p.amount) : null,
        currency: p.currency || "USD",
      }));
    }
    return [
      { account: "", amount: null, currency: "USD" },
      { account: "", amount: null, currency: "USD" },
    ];
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accountNames, setAccountNames] = useState<string[]>([]);
  const [payeeNames, setPayeeNames] = useState<string[]>([]);

  useEffect(() => {
    fetchAccountNames().then((r) => setAccountNames(r.accounts));
    fetchPayees().then((r) => setPayeeNames(r.payees));
  }, []);

  function updatePosting(idx: number, field: string, value: string) {
    setPostings((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        if (field === "account") return { ...p, account: value };
        if (field === "amount")
          return { ...p, amount: value === "" ? null : parseFloat(value) };
        if (field === "currency") return { ...p, currency: value };
        return p;
      })
    );
  }

  function addRow() {
    setPostings((prev) => [...prev, { account: "", amount: null, currency: "USD" }]);
  }

  function removeRow(idx: number) {
    if (postings.length <= 2) return;
    setPostings((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const input = { date, flag, payee, narration, postings };
      let result;
      if (isEditing && editingTxn?.lineno != null) {
        result = await editTransaction({ ...input, lineno: editingTxn.lineno });
      } else {
        result = await addTransaction(input);
      }
      if (result.success) {
        onSuccess();
      } else {
        setError(result.errors?.join("\n") || "Unknown error");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{isEditing ? "Edit Transaction" : "New Transaction"}</span>
          <button onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-field" style={{ flex: "0 0 130px" }}>
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="form-field" style={{ flex: "0 0 60px" }}>
              <label>Flag</label>
              <select value={flag} onChange={(e) => setFlag(e.target.value)}>
                <option value="*">*</option>
                <option value="!">!</option>
              </select>
            </div>
            <div className="form-field">
              <label>Payee</label>
              <Autocomplete
                value={payee}
                onChange={setPayee}
                options={payeeNames}
                placeholder="Payee"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Narration</label>
              <input
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Description"
              />
            </div>
          </div>

          <div className="postings-section">
            <h3>Postings</h3>
            {postings.map((p, i) => (
              <div className="posting-row" key={i}>
                <Autocomplete
                  className="account-input"
                  value={p.account}
                  onChange={(v) => updatePosting(i, "account", v)}
                  options={accountNames}
                  placeholder="Account"
                />
                <input
                  className="amount-input"
                  type="number"
                  step="0.01"
                  value={p.amount ?? ""}
                  onChange={(e) => updatePosting(i, "amount", e.target.value)}
                  placeholder="Amount"
                />
                <input
                  className="currency-input"
                  value={p.currency || "USD"}
                  onChange={(e) => updatePosting(i, "currency", e.target.value)}
                  style={{ width: 60 }}
                />
                {postings.length > 2 && (
                  <button className="remove-btn" onClick={() => removeRow(i)}>
                    &times;
                  </button>
                )}
              </div>
            ))}
            <button className="btn-link" onClick={addRow}>
              + Add posting
            </button>
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="form-actions">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving..." : isEditing ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAccountNames,
  fetchPayees,
  addTransaction,
  editTransaction,
} from "../api/client";
import { useAppStore } from "../stores/appStore";
import { formatDateFull, getDatePlaceholder } from "../utils/format";
import { today, parseSmartDate } from "../utils/dateUtils";
import InlineAutocomplete from "./InlineAutocomplete";

interface ModalPosting {
  id: number;
  account: string;
  amount: string;
  currency: string;
  cost: string;
  costCurrency: string;
  price: string;
  priceCurrency: string;
  showCostPrice: boolean;
}

let nextId = 1;

function emptyPosting(currency: string): ModalPosting {
  return {
    id: nextId++,
    account: "",
    amount: "",
    currency,
    cost: "",
    costCurrency: "",
    price: "",
    priceCurrency: "",
    showCostPrice: false,
  };
}

interface TransactionModalProps {
  onMutated: () => void;
}

export default function TransactionModal({ onMutated }: TransactionModalProps) {
  const txn = useAppStore((s) => s.txnModalTransaction);
  const closeTxnModal = useAppStore((s) => s.closeTxnModal);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);

  const isEditing = !!txn;

  const [date, setDate] = useState(() => {
    if (txn?.date) return formatDateFull(txn.date, operatingCurrency);
    return formatDateFull(today(), operatingCurrency);
  });
  const [flag, setFlag] = useState(txn?.flag || "*");
  const [payee, setPayee] = useState(txn?.payee || "");
  const [narration, setNarration] = useState(txn?.narration || "");
  const [tags, setTags] = useState<string[]>(txn?.tags || []);
  const [links, setLinks] = useState<string[]>(txn?.links || []);
  const [tagInput, setTagInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [postings, setPostings] = useState<ModalPosting[]>(() => {
    if (txn?.postings) {
      const mapped = txn.postings.map((p) => ({
        id: nextId++,
        account: p.account,
        amount: p.amount || "",
        currency: p.currency || operatingCurrency,
        cost: p.cost || "",
        costCurrency: p.cost_currency || "",
        price: p.price || "",
        priceCurrency: p.price_currency || "",
        showCostPrice: !!(p.cost || p.price),
      }));
      // Add an empty row at the end
      mapped.push(emptyPosting(operatingCurrency));
      return mapped;
    }
    return [
      emptyPosting(operatingCurrency),
      emptyPosting(operatingCurrency),
      emptyPosting(operatingCurrency),
    ];
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [continueMode, setContinueMode] = useState(false);

  const dateRef = useRef<HTMLInputElement>(null);

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

  // Auto-add empty posting row when last row gets an account
  const handlePostingChange = useCallback(
    (index: number, field: keyof ModalPosting, value: string) => {
      setPostings((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };

        // If this is the last row and account was just filled, add a new empty row
        if (
          field === "account" &&
          value.length > 0 &&
          index === prev.length - 1
        ) {
          updated.push(emptyPosting(operatingCurrency));
        }

        return updated;
      });
    },
    [operatingCurrency]
  );

  function addPosting() {
    setPostings((prev) => [...prev, emptyPosting(operatingCurrency)]);
  }

  function removePosting(index: number) {
    setPostings((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function resetForm() {
    setDate(formatDateFull(today(), operatingCurrency));
    setFlag("*");
    setPayee("");
    setNarration("");
    setTags([]);
    setLinks([]);
    setTagInput("");
    setLinkInput("");
    setPostings([
      emptyPosting(operatingCurrency),
      emptyPosting(operatingCurrency),
      emptyPosting(operatingCurrency),
    ]);
    setError(null);
    dateRef.current?.focus();
    dateRef.current?.select();
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      const val = tagInput.replace(/^#/, "").trim();
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
      }
      setTagInput("");
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  function handleLinkKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      const val = linkInput.replace(/^\^/, "").trim();
      if (val && !links.includes(val)) {
        setLinks([...links, val]);
      }
      setLinkInput("");
    } else if (e.key === "Backspace" && linkInput === "" && links.length > 0) {
      setLinks(links.slice(0, -1));
    }
  }

  async function handleSave() {
    if (saving) return;
    setError(null);
    setSaving(true);

    try {
      const parsedDate = parseSmartDate(date);

      // Filter out empty posting rows
      const filledPostings = postings.filter((p) => p.account.length > 0);
      if (filledPostings.length < 2) {
        setError("At least 2 postings are required.");
        setSaving(false);
        return;
      }

      // At most one posting can have an empty amount (auto-balanced)
      const emptyAmountCount = filledPostings.filter(
        (p) => p.amount === ""
      ).length;
      if (emptyAmountCount > 1) {
        setError("At most one posting can have an empty amount (auto-balanced).");
        setSaving(false);
        return;
      }

      const postingInputs = filledPostings.map((p) => ({
        account: p.account,
        amount: p.amount ? parseFloat(p.amount) : null,
        currency: p.currency || operatingCurrency,
        cost: p.cost ? parseFloat(p.cost) : null,
        cost_currency: p.costCurrency || null,
        price: p.price ? parseFloat(p.price) : null,
        price_currency: p.priceCurrency || null,
      }));

      if (isEditing && txn?.lineno != null) {
        const result = await editTransaction({
          lineno: txn.lineno,
          date: parsedDate,
          flag,
          payee,
          narration,
          tags,
          links,
          postings: postingInputs,
        });
        if (!result.success) {
          setError(result.errors?.join(", ") || "Failed to edit transaction.");
          return;
        }
      } else {
        const result = await addTransaction({
          date: parsedDate,
          flag,
          payee,
          narration,
          tags,
          links,
          postings: postingInputs,
        });
        if (!result.success) {
          setError(result.errors?.join(", ") || "Failed to add transaction.");
          return;
        }
      }

      onMutated();
      if (continueMode && !isEditing) {
        resetForm();
      } else {
        closeTxnModal();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      closeTxnModal();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  const datePlaceholder = getDatePlaceholder(operatingCurrency);
  const accountNames = accountNamesQuery.data?.accounts || [];
  const payeeList = payeesQuery.data?.payees || [];

  return (
    <div className="modal-overlay" onMouseDown={closeTxnModal}>
      <div
        className="modal modal-wide"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <span>{isEditing ? "Edit Transaction" : "New Transaction"}</span>
          <button onClick={closeTxnModal}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Row 1: Date, Flag, Payee, Narration */}
          <div className="form-row">
            <div className="form-field" style={{ flex: "0 0 130px" }}>
              <label>Date</label>
              <input
                ref={dateRef}
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onBlur={() => {
                  const parsed = parseSmartDate(date);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
                    setDate(formatDateFull(parsed, operatingCurrency));
                  }
                }}
                placeholder={datePlaceholder}
              />
            </div>

            <div className="form-field" style={{ flex: "0 0 50px" }}>
              <label>Flag</label>
              <select value={flag} onChange={(e) => setFlag(e.target.value)}>
                <option value="*">*</option>
                <option value="!">!</option>
              </select>
            </div>

            <div className="form-field">
              <label>Payee</label>
              <InlineAutocomplete
                value={payee}
                onChange={setPayee}
                options={payeeList}
                placeholder="Payee"
              />
            </div>

            <div className="form-field" style={{ flex: 2 }}>
              <label>Narration</label>
              <input
                type="text"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Description"
              />
            </div>
          </div>

          {/* Row 2: Tags & Links */}
          <div className="form-row">
            <div className="form-field">
              <label>Tags</label>
              <div className="chips-input">
                {tags.map((t) => (
                  <span key={t} className="chip tag-chip">
                    #{t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder={tags.length === 0 ? "#tag" : ""}
                  className="chip-text-input"
                />
              </div>
            </div>

            <div className="form-field">
              <label>Links</label>
              <div className="chips-input">
                {links.map((l) => (
                  <span key={l} className="chip link-chip">
                    ^{l}
                    <button
                      type="button"
                      onClick={() => setLinks(links.filter((x) => x !== l))}
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={handleLinkKeyDown}
                  placeholder={links.length === 0 ? "^link" : ""}
                  className="chip-text-input"
                />
              </div>
            </div>
          </div>

          {/* Postings */}
          <div className="postings-section">
            <h3>Postings</h3>

            <div className="posting-header">
              <span className="account-col">Account</span>
              <span className="amount-col">Amount</span>
              <span className="currency-col">Currency</span>
              <span className="action-col"></span>
            </div>

            {postings.map((posting, index) => (
              <div key={posting.id} className="posting-row">
                <InlineAutocomplete
                  value={posting.account}
                  onChange={(v) => handlePostingChange(index, "account", v)}
                  options={accountNames}
                  placeholder="Account"
                  className="account-input"
                />
                <input
                  type="number"
                  step="any"
                  value={posting.amount}
                  onChange={(e) =>
                    handlePostingChange(index, "amount", e.target.value)
                  }
                  placeholder="Amount"
                  className="amount-input"
                />
                <input
                  type="text"
                  value={posting.currency}
                  onChange={(e) =>
                    handlePostingChange(index, "currency", e.target.value)
                  }
                  className="currency-input"
                />
                <div className="posting-actions">
                  {!posting.showCostPrice && posting.account && (
                    <button
                      type="button"
                      className="cost-toggle"
                      title="Add cost/price"
                      onClick={() =>
                        setPostings((prev) => {
                          const updated = [...prev];
                          updated[index] = {
                            ...updated[index],
                            showCostPrice: true,
                          };
                          return updated;
                        })
                      }
                    >
                      {}
                    </button>
                  )}
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removePosting(index)}
                    title="Remove posting"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn-link add-posting-btn"
              onClick={addPosting}
            >
              + Add Posting
            </button>

            {/* Show cost/price rows for postings that have it toggled */}
            {postings.some((p) => p.showCostPrice) && (
              <div className="cost-price-rows">
                {postings.map(
                  (posting, index) =>
                    posting.showCostPrice && (
                      <div key={`cp-${posting.id}`} className="cost-price-row">
                        <span className="cost-price-label">
                          {posting.account.split(":").pop() || `Row ${index + 1}`}:
                        </span>
                        <div className="cost-price-fields">
                          <label>Cost</label>
                          <input
                            type="number"
                            step="any"
                            value={posting.cost}
                            onChange={(e) =>
                              handlePostingChange(index, "cost", e.target.value)
                            }
                            placeholder="Cost"
                            className="amount-input"
                          />
                          <input
                            type="text"
                            value={posting.costCurrency}
                            onChange={(e) =>
                              handlePostingChange(
                                index,
                                "costCurrency",
                                e.target.value
                              )
                            }
                            placeholder="Ccy"
                            className="currency-input"
                          />
                          <label>Price</label>
                          <input
                            type="number"
                            step="any"
                            value={posting.price}
                            onChange={(e) =>
                              handlePostingChange(index, "price", e.target.value)
                            }
                            placeholder="Price"
                            className="amount-input"
                          />
                          <input
                            type="text"
                            value={posting.priceCurrency}
                            onChange={(e) =>
                              handlePostingChange(
                                index,
                                "priceCurrency",
                                e.target.value
                              )
                            }
                            placeholder="Ccy"
                            className="currency-input"
                          />
                        </div>
                      </div>
                    )
                )}
              </div>
            )}
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="form-actions">
            <span className="form-hint">
              {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to
              save
            </span>
            <label className="continue-check">
              <input
                type="checkbox"
                checked={continueMode}
                onChange={(e) => setContinueMode(e.target.checked)}
              />
              continue
            </label>
            <button className="btn" onClick={closeTxnModal}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

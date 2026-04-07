import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountNames, fetchPayees } from "../api/client";
import { formatDateFull, getDatePlaceholder } from "../utils/format";
import { parseSmartDate } from "../utils/dateUtils";
import InlineAutocomplete from "./InlineAutocomplete";
import type { TransactionDraft, DraftPosting } from "../types";

let nextId = 1000;

function emptyPosting(currency: string): DraftPosting {
  return {
    id: nextId++,
    account: "",
    amount: "",
    currency,
    cost: "",
    costCurrency: "",
    price: "",
    priceCurrency: "",
  };
}

interface AdvancedInputProps {
  draft: TransactionDraft;
  onDraftChange: (draft: TransactionDraft) => void;
  operatingCurrency: string;
  autoFocusFirstEmpty?: boolean;
}

export default function AdvancedInput({
  draft,
  onDraftChange,
  operatingCurrency,
  autoFocusFirstEmpty,
}: AdvancedInputProps) {
  // Local form state — synced from/to draft
  const [date, setDate] = useState(() =>
    draft.date ? formatDateFull(draft.date, operatingCurrency) : formatDateFull(new Date().toISOString().slice(0, 10), operatingCurrency)
  );
  const [flag, setFlag] = useState<'*' | '!'>(draft.flag || "*");
  const [payee, setPayee] = useState(draft.payee || "");
  const [narration, setNarration] = useState(draft.narration || "");
  const [tags, setTags] = useState<string[]>(draft.tags || []);
  const [links, setLinks] = useState<string[]>(draft.links || []);
  const [tagInput, setTagInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [postings, setPostings] = useState<(DraftPosting & { showCostPrice: boolean })[]>(() => {
    if (draft.postings.length > 0) {
      const mapped = draft.postings.map((p) => ({
        ...p,
        id: p.id || nextId++,
        showCostPrice: !!(p.cost || p.price),
      }));
      // Ensure at least one empty row at the end
      const lastHasAccount = mapped[mapped.length - 1]?.account;
      if (lastHasAccount || mapped.length < 2) {
        mapped.push({ ...emptyPosting(operatingCurrency), showCostPrice: false });
      }
      return mapped;
    }
    return [
      { ...emptyPosting(operatingCurrency), showCostPrice: false },
      { ...emptyPosting(operatingCurrency), showCostPrice: false },
      { ...emptyPosting(operatingCurrency), showCostPrice: false },
    ];
  });

  const dateRef = useRef<HTMLInputElement>(null);

  const accountNamesQuery = useQuery({
    queryKey: ["account-names"],
    queryFn: fetchAccountNames,
  });

  const payeesQuery = useQuery({
    queryKey: ["payees"],
    queryFn: fetchPayees,
  });

  // Focus on mount
  useEffect(() => {
    if (autoFocusFirstEmpty) {
      // Focus first empty required field
      if (!payee) {
        // payee is empty, but date field is always there — focus date
        dateRef.current?.focus();
      } else {
        dateRef.current?.focus();
      }
    } else {
      dateRef.current?.focus();
      dateRef.current?.select();
    }
  }, []);

  // Sync local state → draft on every change
  useEffect(() => {
    const filledPostings: DraftPosting[] = postings
      .filter(p => p.account.length > 0)
      .map(({ showCostPrice, ...rest }) => rest);

    onDraftChange({
      date: parseSmartDate(date),
      flag,
      payee,
      narration,
      tags,
      links,
      postings: filledPostings.length > 0 ? filledPostings : postings.map(({ showCostPrice, ...rest }) => rest),
    });
  }, [date, flag, payee, narration, tags, links, postings]);

  const handlePostingChange = useCallback(
    (index: number, field: string, value: string) => {
      setPostings((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };

        if (field === "account" && value.length > 0 && index === prev.length - 1) {
          updated.push({ ...emptyPosting(operatingCurrency), showCostPrice: false });
        }

        return updated;
      });
    },
    [operatingCurrency]
  );

  function addPosting() {
    setPostings((prev) => [...prev, { ...emptyPosting(operatingCurrency), showCostPrice: false }]);
  }

  function removePosting(index: number) {
    setPostings((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
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

  const datePlaceholder = getDatePlaceholder(operatingCurrency);
  const accountNames = accountNamesQuery.data?.accounts || [];
  const payeeList = payeesQuery.data?.payees || [];

  return (
    <div className="advanced-input">
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
          <select value={flag} onChange={(e) => setFlag(e.target.value as '*' | '!')}>
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

        {/* Cost/price rows */}
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
                          handlePostingChange(index, "costCurrency", e.target.value)
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
                          handlePostingChange(index, "priceCurrency", e.target.value)
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
    </div>
  );
}

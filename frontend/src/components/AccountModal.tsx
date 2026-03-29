import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAccountNames,
  createAccount,
  updateAccount,
  closeAccount,
  addTransaction,
} from "../api/client";
import { useAppStore } from "../stores/appStore";
import { today, parseSmartDate } from "../utils/dateUtils";
import { formatDateFull, getDatePlaceholder } from "../utils/format";
import InlineAutocomplete from "./InlineAutocomplete";

// Static type vocabulary — mirrors VALID_TYPES_BY_ROOT in backend/account_types.py
const ACCOUNT_TYPES: Record<string, { value: string; label: string }[]> = {
  Assets: [
    { value: "cash", label: "Cash / Bank Account" },
    { value: "receivable", label: "Receivable" },
    { value: "investment", label: "Investment / Brokerage" },
    { value: "prepaid", label: "Prepaid / Deposit" },
  ],
  Liabilities: [
    { value: "credit-card", label: "Credit Card" },
    { value: "loan", label: "Loan / Mortgage" },
    { value: "payable", label: "Payable" },
  ],
  Income: [{ value: "general", label: "General" }],
  Expenses: [{ value: "general", label: "General" }],
  Equity: [{ value: "general", label: "General" }],
};

// Roots where ledgr-type is required
const REQUIRED_TYPE_ROOTS = new Set(["Assets", "Liabilities"]);

interface MetadataRow {
  id: number;
  key: string;
  value: string;
}

let nextMetaId = 1;

interface AccountModalProps {
  onMutated: () => void;
}

export default function AccountModal({ onMutated }: AccountModalProps) {
  const account = useAppStore((s) => s.acctModalAccount);
  const closeAcctModal = useAppStore((s) => s.closeAcctModal);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);

  const isEditing = account !== null;

  // ── Form state ────────────────────────────────────────────────────────────

  const [name, setName] = useState(isEditing ? account!.name : "");
  const [ledgrType, setLedgrType] = useState(
    isEditing ? (account!.ledgr_type || "") : ""
  );
  const [currencies, setCurrencies] = useState(
    isEditing ? account!.currencies.join(", ") : ""
  );
  const [openDate, setOpenDate] = useState(
    formatDateFull(
      isEditing ? (account!.open_date || today()) : today(),
      operatingCurrency
    )
  );

  // Metadata rows (key-value pairs for custom metadata)
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>(() => {
    if (isEditing && account!.metadata) {
      const rows = Object.entries(account!.metadata).map(([k, v]) => ({
        id: nextMetaId++,
        key: k,
        value: String(v),
      }));
      rows.push({ id: nextMetaId++, key: "", value: "" });
      return rows;
    }
    return [{ id: nextMetaId++, key: "", value: "" }];
  });

  // ── Initial balance (create only) ────────────────────────────────────────

  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceCurrency, setBalanceCurrency] = useState(operatingCurrency);
  const [balanceDate, setBalanceDate] = useState(
    formatDateFull(today(), operatingCurrency)
  );
  const [balanceCounterpart, setBalanceCounterpart] = useState(
    "Equity:OpeningBalances"
  );

  // ── Close account section (edit only) ────────────────────────────────────

  const [showCloseSection, setShowCloseSection] = useState(false);
  const [closeDate, setCloseDate] = useState(
    formatDateFull(today(), operatingCurrency)
  );

  // ── UI state ─────────────────────────────────────────────────────────────

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);

  const accountNamesQuery = useQuery({
    queryKey: ["account-names"],
    queryFn: fetchAccountNames,
  });

  useEffect(() => {
    if (isEditing) {
      typeRef.current?.focus();
    } else {
      nameRef.current?.focus();
    }
  }, [isEditing]);

  // ── Dynamic type options ──────────────────────────────────────────────────

  const root = isEditing ? account!.name.split(":")[0] : name.split(":")[0];
  const typeOptions = ACCOUNT_TYPES[root] || [];

  // Reset ledgrType when root changes and current selection is no longer valid
  useEffect(() => {
    if (isEditing) return;
    const validValues = typeOptions.map((o) => o.value);
    if (ledgrType && !validValues.includes(ledgrType)) {
      setLedgrType("");
    }
    // Auto-select "general" for non-required roots
    if (!REQUIRED_TYPE_ROOTS.has(root) && typeOptions.length === 1) {
      setLedgrType(typeOptions[0].value);
    }
  }, [root]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Metadata helpers ─────────────────────────────────────────────────────

  function addMetadataRow() {
    setMetadataRows((prev) => [...prev, { id: nextMetaId++, key: "", value: "" }]);
  }

  function removeMetadataRow(id: number) {
    setMetadataRows((prev) => {
      if (prev.length <= 1) return [{ id: nextMetaId++, key: "", value: "" }];
      return prev.filter((r) => r.id !== id);
    });
  }

  function updateMetadataRow(id: number, field: "key" | "value", value: string) {
    setMetadataRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (saving) return;
    setError(null);
    setSaving(true);

    try {
      // Build metadata (skip empty rows)
      const metadata: Record<string, string> = {};
      for (const row of metadataRows) {
        if (row.key.trim() && row.value.trim()) {
          metadata[row.key.trim()] = row.value.trim();
        }
      }

      // Parse currencies
      const currencyList = currencies
        .split(",")
        .map((c: string) => c.trim().toUpperCase())
        .filter(Boolean);

      if (isEditing) {
        const result = await updateAccount({
          name: account!.name,
          ledgr_type: ledgrType || undefined,
          currencies: currencyList.length > 0 ? currencyList : undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });
        if (!result.success) {
          setError(result.errors?.join(", ") || "Failed to update account.");
          return;
        }
      } else {
        if (!name.trim()) {
          setError("Account name is required.");
          return;
        }

        const parsedOpenDate = parseSmartDate(openDate);
        const result = await createAccount({
          name: name.trim(),
          date: parsedOpenDate,
          ledgr_type: ledgrType || undefined,
          currencies: currencyList.length > 0 ? currencyList : undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });
        if (!result.success) {
          setError(result.errors?.join(", ") || "Failed to create account.");
          return;
        }

        // Sequential: post opening balance transaction if amount is filled
        if (balanceAmount && parseFloat(balanceAmount) !== 0) {
          const parsedBalDate = parseSmartDate(balanceDate);
          const amount = parseFloat(balanceAmount);
          const currency =
            balanceCurrency.trim().toUpperCase() || operatingCurrency;
          const counterpart =
            balanceCounterpart.trim() || "Equity:OpeningBalances";

          await addTransaction({
            date: parsedBalDate,
            flag: "*",
            payee: "",
            narration: "Opening Balance",
            postings: [
              { account: name.trim(), amount, currency },
              { account: counterpart, amount: null, currency },
            ],
          });
        }
      }

      onMutated();
      closeAcctModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ── Close account ─────────────────────────────────────────────────────────

  async function handleClose() {
    if (saving) return;
    setError(null);
    setSaving(true);

    try {
      const parsedDate = parseSmartDate(closeDate);
      await closeAccount({ name: account!.name, date: parsedDate });
      onMutated();
      closeAcctModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      closeAcctModal();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  const datePlaceholder = getDatePlaceholder(operatingCurrency);
  const accountNames = accountNamesQuery.data?.accounts || [];

  return (
    <div className="modal-overlay" onMouseDown={closeAcctModal}>
      <div
        className="modal acct-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="modal-header">
          <span>
            {isEditing
              ? `Edit — ${account!.name.split(":").slice(-2).join(":")}`
              : "New Account"}
          </span>
          <button onClick={closeAcctModal}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Edit mode: show full account name as read-only label */}
          {isEditing && (
            <div className="acct-modal-fullname">{account!.name}</div>
          )}

          {/* Create mode: account name input */}
          {!isEditing && (
            <div className="form-row">
              <div className="form-field">
                <label>Account Name</label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Assets:Bank:MyBank"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {/* Type + Currencies + Open Date */}
          <div className="form-row">
            <div className="form-field">
              <label>Type</label>
              <select
                ref={typeRef}
                value={ledgrType}
                onChange={(e) => setLedgrType(e.target.value)}
                disabled={typeOptions.length === 0}
              >
                {typeOptions.length === 0 && (
                  <option value="">— enter account name first —</option>
                )}
                {typeOptions.length > 0 &&
                  !ledgrType &&
                  REQUIRED_TYPE_ROOTS.has(root) && (
                    <option value="">— select type —</option>
                  )}
                {typeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Currencies</label>
              <input
                type="text"
                value={currencies}
                onChange={(e) => setCurrencies(e.target.value)}
                placeholder="BRL, USD"
                autoComplete="off"
              />
            </div>

            {!isEditing && (
              <div className="form-field" style={{ flex: "0 0 130px" }}>
                <label>Open Date</label>
                <input
                  type="text"
                  value={openDate}
                  onChange={(e) => setOpenDate(e.target.value)}
                  onBlur={() => {
                    const parsed = parseSmartDate(openDate);
                    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
                      setOpenDate(formatDateFull(parsed, operatingCurrency));
                    }
                  }}
                  placeholder={datePlaceholder}
                />
              </div>
            )}
          </div>

          {/* Metadata key-value section */}
          <div className="acct-section">
            <div className="acct-section-header">
              Metadata
              <span className="acct-optional"> (optional)</span>
            </div>
            {metadataRows.map((row) => (
              <div key={row.id} className="metadata-row">
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) =>
                    updateMetadataRow(row.id, "key", e.target.value)
                  }
                  placeholder="key (e.g. institution)"
                  className="metadata-key-input"
                  autoComplete="off"
                />
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) =>
                    updateMetadataRow(row.id, "value", e.target.value)
                  }
                  placeholder="value"
                  className="metadata-value-input"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removeMetadataRow(row.id)}
                  title="Remove field"
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-link"
              onClick={addMetadataRow}
            >
              + Add field
            </button>
          </div>

          {/* Initial balance section (create only) */}
          {!isEditing && (
            <div className="acct-section">
              <div className="acct-section-header">
                Initial Balance
                <span className="acct-optional"> (optional)</span>
              </div>
              <div className="form-row">
                <div className="form-field" style={{ flex: "0 0 130px" }}>
                  <label>Date</label>
                  <input
                    type="text"
                    value={balanceDate}
                    onChange={(e) => setBalanceDate(e.target.value)}
                    onBlur={() => {
                      const parsed = parseSmartDate(balanceDate);
                      if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
                        setBalanceDate(formatDateFull(parsed, operatingCurrency));
                      }
                    }}
                    placeholder={datePlaceholder}
                  />
                </div>
                <div className="form-field">
                  <label>Amount</label>
                  <input
                    type="number"
                    step="any"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    placeholder="0.00"
                    className="amount-input"
                  />
                </div>
                <div className="form-field" style={{ flex: "0 0 80px" }}>
                  <label>Currency</label>
                  <input
                    type="text"
                    value={balanceCurrency}
                    onChange={(e) =>
                      setBalanceCurrency(e.target.value.toUpperCase())
                    }
                    placeholder="BRL"
                    maxLength={10}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Counterpart Account</label>
                  <InlineAutocomplete
                    value={balanceCounterpart}
                    onChange={setBalanceCounterpart}
                    options={accountNames}
                    placeholder="Equity:OpeningBalances"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Close account section (edit only) */}
          {isEditing && (
            <div className="close-account-section">
              {!showCloseSection ? (
                <button
                  type="button"
                  className="btn-close-account"
                  onClick={() => setShowCloseSection(true)}
                >
                  Close Account…
                </button>
              ) : (
                <div className="close-account-form">
                  <p className="close-account-warning">
                    ⚠ Closing an account with a non-zero balance will produce
                    a Beancount validation warning.
                  </p>
                  <div className="form-row">
                    <div className="form-field" style={{ flex: "0 0 130px" }}>
                      <label>Close Date</label>
                      <input
                        type="text"
                        value={closeDate}
                        onChange={(e) => setCloseDate(e.target.value)}
                        placeholder={datePlaceholder}
                        autoFocus
                      />
                    </div>
                    <div
                      className="form-field"
                      style={{ flex: "0 0 auto", justifyContent: "flex-end" }}
                    >
                      <label>&nbsp;</label>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={handleClose}
                          disabled={saving}
                        >
                          {saving ? "Closing…" : "Confirm Close"}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setShowCloseSection(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}

          {/* Actions */}
          <div className="form-actions">
            <span className="form-hint">
              {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to
              save
            </span>
            <button className="btn" onClick={closeAcctModal}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : isEditing
                ? "Save Changes"
                : "Create Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

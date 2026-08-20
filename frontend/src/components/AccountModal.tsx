import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAccountNames,
  fetchAccountTypes,
  createAccount,
  updateAccount,
  closeAccount,
  reopenAccount,
  renameAccount,
  addTransaction,
} from "../api/client";
import type { AccountNode, RenamePlan } from "../types";
import { renamedTo, validateRenameTarget } from "../utils/accountRename";
import { useAppStore } from "../stores/appStore";
import { today, parseSmartDate } from "../utils/dateUtils";
import { formatDateFull, getDatePlaceholder } from "../utils/format";
import InlineAutocomplete from "./InlineAutocomplete";

// Minimal fallback type vocabulary — only used for the brief window before
// /api/account-types loads (the backend is the source of truth). Kept tiny on
// purpose so it can't silently drift; the fetched list replaces it.
const FALLBACK_ACCOUNT_TYPES: Record<string, { value: string; label: string }[]> = {
  Income: [{ value: "general", label: "General" }],
  Expenses: [{ value: "general", label: "General" }],
  Equity: [{ value: "general", label: "General" }],
};

// Roots where ledgr-type is required. Mirrors REQUIRED_TYPE_ROOTS in
// backend/account_types.py — the backend enforces this with a 400; this guard
// is the client-side counterpart so the user never makes a doomed request.
const REQUIRED_TYPE_ROOTS = new Set(["Assets", "Liabilities"]);

interface MetadataRow {
  id: number;
  key: string;
  value: string;
}

let nextMetaId = 1;

/** Every descendant of a node, depth-first. `children` is one level only. */
function flattenDescendants(node: AccountNode): AccountNode[] {
  const out: AccountNode[] = [];
  for (const child of node.children) {
    out.push(child);
    out.push(...flattenDescendants(child));
  }
  return out;
}

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

  // ── Rename section (edit only) ───────────────────────────────────────────
  //
  // A rename rewrites every posting that names the account, across the main
  // ledger and every include — hundreds of lines on a real ledger. So it is a
  // two-step flow: ask the backend for the impact (dry run), show it, and only
  // write once the user has seen the number.

  // Every account nested under this one, flattened. Deactivating cascades over
  // these, and renaming a parent optionally carries them along, so both
  // sections need the real count — `account.children` is only one level deep.
  const descendants = isEditing ? flattenDescendants(account!) : [];

  const [showRenameSection, setShowRenameSection] = useState(false);
  const [renameTo, setRenameTo] = useState(isEditing ? account!.name : "");
  const [renameChildren, setRenameChildren] = useState(true);
  const [renamePlan, setRenamePlan] = useState<RenamePlan | null>(null);

  // ── UI state ─────────────────────────────────────────────────────────────

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);

  const accountNamesQuery = useQuery({
    queryKey: ["account-names"],
    queryFn: fetchAccountNames,
  });

  // Valid ledgr-types per account root, fetched from the backend (single
  // source of truth) rather than hardcoded — so the modal can never drift from
  // VALID_TYPES_BY_ROOT. FALLBACK covers the brief pre-load window only.
  const accountTypesQuery = useQuery({
    queryKey: ["account-types"],
    queryFn: fetchAccountTypes,
  });
  const accountTypes = accountTypesQuery.data?.types ?? FALLBACK_ACCOUNT_TYPES;

  useEffect(() => {
    if (isEditing) {
      typeRef.current?.focus();
    } else {
      nameRef.current?.focus();
    }
  }, [isEditing]);

  // ── Dynamic type options ──────────────────────────────────────────────────

  const root = isEditing ? account!.name.split(":")[0] : name.split(":")[0];
  const typeOptions = accountTypes[root] || [];
  // A required root (Assets/Liabilities) with no type selected yet.
  const missingRequiredType = REQUIRED_TYPE_ROOTS.has(root) && !ledgrType;

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

    // Assets/Liabilities require a ledgr-type. Guard client-side so the user
    // never fires a request the backend will reject with a 400.
    if (missingRequiredType) {
      setError("This account has no ledgr-type. Set one to continue.");
      return;
    }

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
        const parsedOpen = parseSmartDate(openDate);
        const result = await updateAccount({
          name: account!.name,
          ledgr_type: ledgrType || undefined,
          currencies: currencyList.length > 0 ? currencyList : undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          // Only send it when the user actually moved it, so an unchanged edit
          // never rewrites the directive's date.
          date: parsedOpen !== account!.open_date ? parsedOpen : undefined,
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

  // ── Deactivate / reactivate ──────────────────────────────────────────────

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

  async function handleReopen() {
    if (saving) return;
    setError(null);
    setSaving(true);

    try {
      await reopenAccount(account!.name);
      onMutated();
      closeAcctModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  /** Step 1: ask the backend what the rename would touch. Writes nothing. */
  async function handleRenamePreview() {
    if (saving) return;
    setError(null);
    setRenamePlan(null);

    const target = renameTo.trim();
    const problem = validateRenameTarget(target, account!.name, accountNames);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    try {
      const res = await renameAccount({
        name: account!.name,
        new_name: target,
        include_children: renameChildren,
        dry_run: true,
      });
      setRenamePlan(res.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  /** Step 2: commit. The backend rolls the whole ledger back if it breaks. */
  async function handleRenameConfirm() {
    if (saving || !renamePlan) return;
    setError(null);
    setSaving(true);

    try {
      await renameAccount({
        name: account!.name,
        new_name: renamePlan.new_name,
        include_children: renameChildren,
      });
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
              {missingRequiredType && (
                <span
                  className="form-hint"
                  style={{ color: "var(--color-warning-fg)" }}
                >
                  Required for Assets &amp; Liabilities
                </span>
              )}
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

            {/* Editable on edit too: a posting dated before the account's
                `open` makes the ledger invalid, and moving the opening back is
                normally the fix. */}
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

          {/* Rename section (edit only) */}
          {isEditing && (
            <div className="close-account-section">
              {!showRenameSection ? (
                <button
                  type="button"
                  className="btn-close-account"
                  onClick={() => {
                    setShowRenameSection(true);
                    setRenameTo(account!.name);
                    setRenamePlan(null);
                  }}
                >
                  Rename Account…
                </button>
              ) : (
                <div className="close-account-form">
                  <div className="form-row">
                    <div className="form-field">
                      <label>New Account Name</label>
                      <input
                        type="text"
                        value={renameTo}
                        onChange={(e) => {
                          setRenameTo(e.target.value);
                          // Any edit invalidates the preview the user saw.
                          setRenamePlan(null);
                        }}
                        placeholder={account!.name}
                        autoFocus
                      />
                    </div>
                  </div>

                  {descendants.length > 0 && (
                    <label className="acct-modal-checkbox">
                      <input
                        type="checkbox"
                        checked={renameChildren}
                        onChange={(e) => {
                          setRenameChildren(e.target.checked);
                          setRenamePlan(null);
                        }}
                      />
                      <span>
                        Also rename the {descendants.length} account
                        {descendants.length === 1 ? "" : "s"} nested under it
                      </span>
                    </label>
                  )}

                  {renamePlan && (
                    <div className="rename-plan">
                      <p>
                        Rewrites <strong>{renamePlan.total_occurrences}</strong>{" "}
                        reference
                        {renamePlan.total_occurrences === 1 ? "" : "s"} across{" "}
                        <strong>{renamePlan.file_count}</strong> file
                        {renamePlan.file_count === 1 ? "" : "s"}, including every
                        transaction. The ledger is restored automatically if
                        anything fails.
                      </p>
                      {renamePlan.renamed_accounts.length > 1 && (
                        <ul className="rename-plan-accounts">
                          {renamePlan.renamed_accounts.map((a) => (
                            <li key={a}>
                              {a} →{" "}
                              {renamedTo(a, renamePlan.old_name, renamePlan.new_name)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "6px" }}>
                    {!renamePlan ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleRenamePreview}
                        disabled={saving}
                      >
                        {saving ? "Checking…" : "Preview Impact"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={handleRenameConfirm}
                        disabled={saving}
                      >
                        {saving ? "Renaming…" : "Confirm Rename"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setShowRenameSection(false);
                        setRenamePlan(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>

                  {/* The shared error line lives at the bottom of the modal,
                      below the deactivate section — far out of view when the
                      user is working here. A failed rename read as "nothing
                      happened", so surface it next to the button that failed. */}
                  {error && <div className="error-msg">{error}</div>}
                </div>
              )}
            </div>
          )}

          {/* Deactivate / reactivate (edit only) */}
          {isEditing && account!.closed && (
            <div className="close-account-section">
              <p className="close-account-warning">
                This account is inactive
                {account!.close_date ? ` since ${account!.close_date}` : ""} and
                hidden from the account list by default.
                {descendants.some((d) => d.closed) &&
                  ` Reactivating also brings back ${
                    descendants.filter((d) => d.closed).length
                  } nested account(s).`}
              </p>
              <button
                type="button"
                className="btn"
                onClick={handleReopen}
                disabled={saving}
              >
                {saving ? "Reactivating…" : "Reactivate Account"}
              </button>
            </div>
          )}

          {isEditing && !account!.closed && (
            <div className="close-account-section">
              {!showCloseSection ? (
                <button
                  type="button"
                  className="btn-close-account"
                  onClick={() => setShowCloseSection(true)}
                >
                  Deactivate Account…
                </button>
              ) : (
                <div className="close-account-form">
                  <p className="close-account-warning">
                    Deactivating writes a Beancount <code>close</code> directive:
                    the account stops accepting new postings and drops out of the
                    account list. Existing transactions are untouched, and you
                    can reactivate later. A non-zero balance at the close date
                    will produce a Beancount validation warning.
                  </p>

                  {/* Beancount's own `close` would leave the children live,
                      which contradicts the tree. Ledgr retires the whole
                      subtree, so say exactly which accounts that is. */}
                  {descendants.length > 0 && (
                    <div className="rename-plan">
                      <p>
                        Also deactivates the{" "}
                        <strong>{descendants.length}</strong> account
                        {descendants.length === 1 ? "" : "s"} nested under this
                        one:
                      </p>
                      <ul className="rename-plan-accounts">
                        {descendants.map((d) => (
                          <li key={d.name}>
                            {d.name.slice(account!.name.length + 1)}
                            {d.closed ? " (already inactive)" : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="form-row">
                    <div className="form-field" style={{ flex: "0 0 130px" }}>
                      <label>Inactive From</label>
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
                          {saving ? "Deactivating…" : "Confirm Deactivate"}
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
              disabled={saving || missingRequiredType}
              title={
                missingRequiredType
                  ? "Select a type for this Assets/Liabilities account"
                  : undefined
              }
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

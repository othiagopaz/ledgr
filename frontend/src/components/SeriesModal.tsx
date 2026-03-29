import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSeries,
  extendSeries,
  cancelSeries,
  fetchAccountNames,
} from "../api/client";
import { useAppStore } from "../stores/appStore";
import { today, parseSmartDate } from "../utils/dateUtils";
import { formatDateFull, formatAmount, getDatePlaceholder } from "../utils/format";
import InlineAutocomplete from "./InlineAutocomplete";

interface SeriesModalProps {
  onMutated: () => void;
}

type Mode = 'create' | 'view' | 'extend';

export default function SeriesModal({ onMutated }: SeriesModalProps) {
  const series = useAppStore((s) => s.seriesModalSeries);
  const seriesModalDefaultType = useAppStore((s) => s.seriesModalDefaultType);
  const closeSeriesModal = useAppStore((s) => s.closeSeriesModal);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const queryClient = useQueryClient();

  const isEditing = series !== null;
  const [mode, setMode] = useState<Mode>(isEditing ? 'view' : 'create');

  // ── Create form state ─────────────────────────────────────────────────────

  const [seriesType, setSeriesType] = useState<'recurring' | 'installment'>(seriesModalDefaultType ?? 'recurring');
  const [payee, setPayee] = useState(isEditing ? series!.payee : "");
  const [narration, setNarration] = useState(isEditing ? series!.narration : "");
  const [startDate, setStartDate] = useState(formatDateFull(today(), operatingCurrency));
  const [endDate, setEndDate] = useState("");
  const [count, setCount] = useState("");
  const [amount, setAmount] = useState(isEditing ? series!.amount_per_txn : "");
  const [amountIsTotal, setAmountIsTotal] = useState(false);
  const [currency, setCurrency] = useState(isEditing ? series!.currency : operatingCurrency);
  const [accountFrom, setAccountFrom] = useState(isEditing ? series!.account_from : "");
  const [accountTo, setAccountTo] = useState(isEditing ? series!.account_to : "");

  // ── Extend form state ─────────────────────────────────────────────────────

  const [extendEndDate, setExtendEndDate] = useState("");
  const [extendAmount, setExtendAmount] = useState("");
  const [extendCurrency, setExtendCurrency] = useState("");

  // ── UI state ──────────────────────────────────────────────────────────────

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const payeeRef = useRef<HTMLInputElement>(null);
  const datePlaceholder = getDatePlaceholder(operatingCurrency);

  const accountNamesQuery = useQuery({
    queryKey: ["account-names"],
    queryFn: () => fetchAccountNames(),
  });
  const accountNames = accountNamesQuery.data?.accounts || [];

  useEffect(() => {
    if (mode === 'create') payeeRef.current?.focus();
  }, [mode]);

  // ── Create ────────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (saving) return;
    setError(null);
    setSaving(true);

    try {
      const parsedStart = parseSmartDate(startDate);
      const amountNum = parseFloat(amount);
      if (!payee.trim() && !narration.trim()) {
        setError("Payee or narration is required.");
        return;
      }
      if (!parsedStart) {
        setError("Start date is required.");
        return;
      }
      if (isNaN(amountNum) || amountNum <= 0) {
        setError("Amount must be a positive number.");
        return;
      }
      if (!currency.trim()) {
        setError("Currency is required.");
        return;
      }
      if (!accountFrom.trim() || !accountTo.trim()) {
        setError("Both accounts are required.");
        return;
      }

      if (seriesType === 'recurring') {
        if (!endDate.trim()) {
          setError("End date is required for recurring series.");
          return;
        }
        const parsedEnd = parseSmartDate(endDate);
        const result = await createSeries({
          type: 'recurring',
          payee: payee.trim(),
          narration: narration.trim(),
          start_date: parsedStart,
          end_date: parsedEnd,
          amount: amountNum,
          currency: currency.trim().toUpperCase(),
          account_from: accountFrom.trim(),
          account_to: accountTo.trim(),
        });
        if (!result.success) {
          setError(result.errors?.join(", ") || "Failed to create series.");
          return;
        }
      } else {
        const countNum = parseInt(count, 10);
        if (isNaN(countNum) || countNum <= 0) {
          setError("Count must be a positive integer for installment series.");
          return;
        }
        const result = await createSeries({
          type: 'installment',
          payee: payee.trim(),
          narration: narration.trim(),
          start_date: parsedStart,
          count: countNum,
          amount: amountNum,
          amount_is_total: amountIsTotal,
          currency: currency.trim().toUpperCase(),
          account_from: accountFrom.trim(),
          account_to: accountTo.trim(),
        });
        if (!result.success) {
          setError(result.errors?.join(", ") || "Failed to create series.");
          return;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["series"] });
      onMutated();
      closeSeriesModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ── Extend ────────────────────────────────────────────────────────────────

  async function handleExtend() {
    if (saving || !series) return;
    setError(null);
    setSaving(true);

    try {
      if (!extendEndDate.trim()) {
        setError("New end date is required.");
        return;
      }
      const parsedEnd = parseSmartDate(extendEndDate);
      const extAmountNum = extendAmount ? parseFloat(extendAmount) : undefined;
      const result = await extendSeries(series.series_id, {
        new_end_date: parsedEnd,
        new_amount: extAmountNum,
        new_currency: extendCurrency.trim().toUpperCase() || undefined,
      });
      if (!result.success) {
        setError(result.errors?.join(", ") || "Failed to extend series.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["series"] });
      onMutated();
      closeSeriesModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  async function handleCancel() {
    if (saving || !series) return;
    setSaving(true);
    setError(null);

    try {
      const result = await cancelSeries(series.series_id);
      if (!result.success) {
        setError(result.errors?.join(", ") || "Failed to cancel series.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["series"] });
      onMutated();
      closeSeriesModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (showCancelConfirm) {
        setShowCancelConfirm(false);
      } else if (mode === 'extend') {
        setMode('view');
      } else {
        closeSeriesModal();
      }
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (mode === 'create') handleCreate();
      else if (mode === 'extend') handleExtend();
    }
  }

  const typeIcon = series?.type === 'installment' ? '#' : '↻';

  return (
    <div className="modal-overlay" onMouseDown={closeSeriesModal}>
      <div
        className="modal series-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="modal-header">
          <span>
            {mode === 'create' && "New Series"}
            {mode === 'view' && `${typeIcon} ${series?.payee || series?.narration}`}
            {mode === 'extend' && `Extend — ${series?.payee || series?.narration}`}
          </span>
          <button onClick={closeSeriesModal}>&times;</button>
        </div>

        <div className="modal-body">

          {/* ── VIEW mode ──────────────────────────────────────────────── */}
          {mode === 'view' && series && (
            <>
              <div className="series-detail-grid">
                <div className="series-detail-row">
                  <span className="series-detail-label">Type</span>
                  <span>
                    <span className={`series-type-badge series-type-${series.type}`}>
                      {series.type}
                    </span>
                  </span>
                </div>
                <div className="series-detail-row">
                  <span className="series-detail-label">Payee</span>
                  <span>{series.payee || "—"}</span>
                </div>
                <div className="series-detail-row">
                  <span className="series-detail-label">Narration</span>
                  <span>{series.narration || "—"}</span>
                </div>
                <div className="series-detail-row">
                  <span className="series-detail-label">Amount</span>
                  <span className="series-detail-amount">
                    {formatAmount(parseFloat(series.amount_per_txn), series.currency)} {series.currency}
                    <span className="series-detail-per-txn"> / transaction</span>
                  </span>
                </div>
                {series.type === 'installment' && (
                  <div className="series-detail-row">
                    <span className="series-detail-label">Total</span>
                    <span className="series-detail-amount">
                      {formatAmount(parseFloat(series.amount_per_txn) * series.total, series.currency)} {series.currency}
                      <span className="series-detail-per-txn"> ({series.total} installments)</span>
                    </span>
                  </div>
                )}
                {series.type === 'recurring' && series.confirmed > 0 && (
                  <div className="series-detail-row">
                    <span className="series-detail-label">Paid</span>
                    <span className="series-detail-amount">
                      {formatAmount(parseFloat(series.amount_per_txn) * series.confirmed, series.currency)} {series.currency}
                      <span className="series-detail-per-txn"> ({series.confirmed} payments)</span>
                    </span>
                  </div>
                )}
                <div className="series-detail-row">
                  <span className="series-detail-label">Progress</span>
                  <span>
                    <span className="series-progress-confirmed">{series.confirmed} confirmed</span>
                    {series.pending > 0 && (
                      <span className="series-progress-pending"> · {series.pending} pending</span>
                    )}
                    {series.type === 'installment' && (
                      <span className="series-progress-total"> / {series.total}</span>
                    )}
                  </span>
                </div>
                <div className="series-detail-row">
                  <span className="series-detail-label">Dates</span>
                  <span>{series.first_date} → {series.last_date}</span>
                </div>
                <div className="series-detail-row">
                  <span className="series-detail-label">From</span>
                  <span className="series-detail-account">{series.account_from || "—"}</span>
                </div>
                <div className="series-detail-row">
                  <span className="series-detail-label">To</span>
                  <span className="series-detail-account">{series.account_to || "—"}</span>
                </div>
              </div>

              {error && <div className="error-msg">{error}</div>}

              {!showCancelConfirm ? (
                <div className="form-actions">
                  <button className="btn" onClick={closeSeriesModal}>Close</button>
                  {series.type === 'recurring' && (
                    <button
                      className="btn btn-primary"
                      onClick={() => { setMode('extend'); setError(null); }}
                    >
                      Extend…
                    </button>
                  )}
                  {series.pending > 0 && (
                    <button
                      className="btn btn-danger"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={saving}
                    >
                      Cancel Series…
                    </button>
                  )}
                </div>
              ) : (
                <div className="close-account-form">
                  <p className="close-account-warning">
                    ⚠ This will delete all {series.pending} pending transactions
                    in this series. {series.confirmed} confirmed transactions will
                    be kept. This cannot be undone.
                  </p>
                  <div className="form-actions">
                    <button
                      className="btn"
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={saving}
                    >
                      Keep Series
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={handleCancel}
                      disabled={saving}
                    >
                      {saving ? "Cancelling…" : "Confirm Cancel"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── EXTEND mode ────────────────────────────────────────────── */}
          {mode === 'extend' && series && (
            <>
              <p className="series-extend-hint">
                Currently ends on <strong>{series.last_date}</strong>.
                New transactions will be appended after that date.
              </p>

              <div className="form-row">
                <div className="form-field">
                  <label>New End Date</label>
                  <input
                    type="text"
                    value={extendEndDate}
                    onChange={(e) => setExtendEndDate(e.target.value)}
                    onBlur={() => {
                      const parsed = parseSmartDate(extendEndDate);
                      if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
                        setExtendEndDate(formatDateFull(parsed, operatingCurrency));
                      }
                    }}
                    placeholder={datePlaceholder}
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>New Amount <span className="acct-optional">(leave blank to keep current)</span></label>
                  <input
                    type="number"
                    step="any"
                    value={extendAmount}
                    onChange={(e) => setExtendAmount(e.target.value)}
                    placeholder={series.amount_per_txn}
                    className="amount-input"
                  />
                </div>
                <div className="form-field" style={{ flex: "0 0 80px" }}>
                  <label>Currency</label>
                  <input
                    type="text"
                    value={extendCurrency}
                    onChange={(e) => setExtendCurrency(e.target.value.toUpperCase())}
                    placeholder={series.currency}
                    maxLength={10}
                    autoComplete="off"
                  />
                </div>
              </div>

              {error && <div className="error-msg">{error}</div>}

              <div className="form-actions">
                <span className="form-hint">
                  {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to save
                </span>
                <button className="btn" onClick={() => { setMode('view'); setError(null); }}>
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleExtend}
                  disabled={saving}
                >
                  {saving ? "Extending…" : "Extend Series"}
                </button>
              </div>
            </>
          )}

          {/* ── CREATE mode ────────────────────────────────────────────── */}
          {mode === 'create' && (
            <>
              {/* Type selector */}
              <div className="form-row">
                <div className="form-field">
                  <label>Series Type</label>
                  <div className="series-type-toggle">
                    <button
                      type="button"
                      className={`series-type-btn${seriesType === 'recurring' ? ' active' : ''}`}
                      onClick={() => setSeriesType('recurring')}
                    >
                      ↻ Recurring
                    </button>
                    <button
                      type="button"
                      className={`series-type-btn${seriesType === 'installment' ? ' active' : ''}`}
                      onClick={() => setSeriesType('installment')}
                    >
                      # Installment
                    </button>
                  </div>
                </div>
              </div>

              {/* Payee + Narration */}
              <div className="form-row">
                <div className="form-field">
                  <label>Payee</label>
                  <input
                    ref={payeeRef}
                    type="text"
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    placeholder="Netflix"
                    autoComplete="off"
                  />
                </div>
                <div className="form-field">
                  <label>Narration</label>
                  <input
                    type="text"
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder={seriesType === 'installment' ? 'TV 65"' : "Monthly subscription"}
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Start Date + End Date/Count */}
              <div className="form-row">
                <div className="form-field" style={{ flex: "0 0 140px" }}>
                  <label>Start Date</label>
                  <input
                    type="text"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    onBlur={() => {
                      const parsed = parseSmartDate(startDate);
                      if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
                        setStartDate(formatDateFull(parsed, operatingCurrency));
                      }
                    }}
                    placeholder={datePlaceholder}
                  />
                </div>

                {seriesType === 'recurring' ? (
                  <div className="form-field" style={{ flex: "0 0 140px" }}>
                    <label>End Date</label>
                    <input
                      type="text"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      onBlur={() => {
                        const parsed = parseSmartDate(endDate);
                        if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
                          setEndDate(formatDateFull(parsed, operatingCurrency));
                        }
                      }}
                      placeholder={datePlaceholder}
                    />
                  </div>
                ) : (
                  <div className="form-field" style={{ flex: "0 0 100px" }}>
                    <label>Installments</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                      placeholder="12"
                    />
                  </div>
                )}
              </div>

              {/* Amount + Currency */}
              <div className="form-row">
                <div className="form-field">
                  <label>
                    Amount
                    {seriesType === 'installment' && (
                      <span className="series-amount-label-hint">
                        {amountIsTotal ? " (total)" : " (per installment)"}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="amount-input"
                  />
                </div>
                <div className="form-field" style={{ flex: "0 0 80px" }}>
                  <label>Currency</label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    placeholder="BRL"
                    maxLength={10}
                    autoComplete="off"
                  />
                </div>
                {seriesType === 'installment' && (
                  <div className="form-field" style={{ flex: "0 0 auto", justifyContent: "flex-end" }}>
                    <label>&nbsp;</label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={amountIsTotal}
                        onChange={(e) => setAmountIsTotal(e.target.checked)}
                      />
                      Amount is total
                    </label>
                  </div>
                )}
              </div>

              {/* Accounts */}
              <div className="form-row">
                <div className="form-field">
                  <label>From Account <span className="acct-optional">(source / payer)</span></label>
                  <InlineAutocomplete
                    value={accountFrom}
                    onChange={setAccountFrom}
                    options={accountNames}
                    placeholder="Liabilities:CreditCard:Nubank"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>To Account <span className="acct-optional">(destination / expense)</span></label>
                  <InlineAutocomplete
                    value={accountTo}
                    onChange={setAccountTo}
                    options={accountNames}
                    placeholder="Expenses:Entertainment"
                  />
                </div>
              </div>

              {error && <div className="error-msg">{error}</div>}

              <div className="form-actions">
                <span className="form-hint">
                  {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to save
                </span>
                <button className="btn" onClick={closeSeriesModal}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={saving}
                >
                  {saving ? "Creating…" : "Create Series"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

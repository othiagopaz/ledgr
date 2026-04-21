import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSeries, fetchTransactions, editTransaction } from "../api/client";
import { useAppStore } from "../stores/appStore";
import { formatDateFull, formatAmount, formatInstallmentBadge } from "../utils/format";
import type { Transaction, SeriesSummary } from "../types";
import PageHeader from "./PageHeader";

type Filter = 'all' | 'recurring' | 'installment' | 'pending';

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  recurring: 'Recurring',
  installment: 'Installments',
  pending: 'Pending',
};

const FILTER_TABS = (Object.keys(FILTER_LABELS) as Filter[]).map((key) => ({
  key,
  label: FILTER_LABELS[key],
}));

function SeriesTypeIcon({ type }: { type: 'recurring' | 'installment' }) {
  return (
    <span className={`series-icon series-icon-${type}`} title={type}>
      {type === 'recurring' ? 'rec' : '#'}
    </span>
  );
}

interface SeriesSummaryRowProps {
  summary: SeriesSummary;
  onViewSeries: (s: SeriesSummary) => void;
}

function SeriesSummaryRow({ summary, onViewSeries }: SeriesSummaryRowProps) {
  const pct = summary.total > 0
    ? Math.round((summary.confirmed / summary.total) * 100)
    : 0;

  return (
    <tr
      className="series-summary-row"
      onClick={() => onViewSeries(summary)}
      style={{ cursor: "pointer" }}
    >
      <td>
        <SeriesTypeIcon type={summary.type} />
      </td>
      <td>
        <span className="series-summary-payee">{summary.payee || summary.narration}</span>
        {summary.payee && summary.narration !== summary.payee && (
          <span className="series-summary-narration"> — {summary.narration}</span>
        )}
      </td>
      <td>
        <span className={`series-type-badge series-type-${summary.type}`}>
          {summary.type}
        </span>
      </td>
      <td>
        {summary.type === 'installment' ? (
          <span className="series-progress">
            <span className="series-progress-bar-wrap">
              <span
                className="series-progress-bar-fill"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="series-progress-label">
              {summary.confirmed}/{summary.total}
            </span>
          </span>
        ) : (
          <span className="series-progress-label">
            {summary.confirmed} confirmed
            {summary.pending > 0 && (
              <span className="series-progress-pending"> · {summary.pending} pending</span>
            )}
          </span>
        )}
      </td>
      <td className="series-summary-dates">
        {summary.first_date} → {summary.last_date}
      </td>
      <td className="num">
        {formatAmount(parseFloat(summary.amount_per_txn), summary.currency)}
        <span className="series-currency-label"> {summary.currency}</span>
      </td>
    </tr>
  );
}

export default function SeriesView() {
  const openSeriesModal = useAppStore((s) => s.openSeriesModal);
  const openTxnModal = useAppStore((s) => s.openTxnModal);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);
  const txnModalOpen = useAppStore((s) => s.txnModalOpen);
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>('all');
  const [selectedLinenos, setSelectedLinenos] = useState<Set<number>>(new Set());
  const [reconciling, setReconciling] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [expandedSplits, setExpandedSplits] = useState<Set<number>>(new Set());

  const tableRef = useRef<HTMLDivElement>(null);

  // Scroll to top before paint on mount
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Refocus table when modal closes
  useEffect(() => {
    if (!txnModalOpen) {
      requestAnimationFrame(() => tableRef.current?.focus({ preventScroll: true }));
    }
  }, [txnModalOpen]);

  // Auto-select first row on mount and when filter changes
  useEffect(() => {
    setSelectedRowIndex(0);
    requestAnimationFrame(() => tableRef.current?.focus({ preventScroll: true }));
  }, [filter]);

  const seriesQuery = useQuery({
    queryKey: ["series"],
    queryFn: () => fetchSeries(),
  });

  const txnsQuery = useQuery({
    queryKey: ["transactions", undefined, viewMode],
    queryFn: () => fetchTransactions(undefined, undefined, undefined, viewMode),
  });

  const allSeries = seriesQuery.data?.series || [];
  const allTxns = txnsQuery.data?.transactions || [];

  const seriesTxns = allTxns.filter((t) => t.metadata['ledgr-series'] != null);
  const pendingTxns = allTxns.filter(
    (t) => t.flag === '!' && t.metadata['ledgr-series'] == null
  );

  const filteredTxns = (() => {
    switch (filter) {
      case 'recurring':
        return seriesTxns.filter((t) => t.metadata['ledgr-series-type'] === 'recurring');
      case 'installment':
        return seriesTxns.filter((t) => t.metadata['ledgr-series-type'] === 'installment');
      case 'pending':
        return [...seriesTxns.filter((t) => t.flag === '!'), ...pendingTxns];
      default:
        return [...seriesTxns, ...pendingTxns];
    }
  })();

  // Dedup by lineno
  const seen = new Set<number>();
  const displayTxns = filteredTxns.filter((t) => {
    if (t.lineno == null) return true;
    if (seen.has(t.lineno)) return false;
    seen.add(t.lineno);
    return true;
  });

  // Sort ascending: oldest first, newest at bottom (like AccountRegister)
  displayTxns.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.lineno ?? 0) - (b.lineno ?? 0)
  );

  // Auto-select first row once data loads
  const hasData = displayTxns.length > 0;
  useEffect(() => {
    if (hasData && selectedRowIndex === null) {
      setSelectedRowIndex(0);
      requestAnimationFrame(() => tableRef.current?.focus({ preventScroll: true }));
    }
  }, [hasData]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSeries = (() => {
    if (filter === 'all' || filter === 'pending') return allSeries;
    return allSeries.filter((s) => s.type === filter);
  })();

  function toggleSelect(lineno: number) {
    setSelectedLinenos((prev) => {
      const next = new Set(prev);
      if (next.has(lineno)) next.delete(lineno);
      else next.add(lineno);
      return next;
    });
  }

  function toggleSelectAll() {
    const eligibleLinenos = displayTxns
      .filter((t) => t.flag === '!' && t.lineno != null)
      .map((t) => t.lineno as number);

    if (eligibleLinenos.every((ln) => selectedLinenos.has(ln))) {
      setSelectedLinenos(new Set());
    } else {
      setSelectedLinenos(new Set(eligibleLinenos));
    }
  }

  async function handleReconcileSelected() {
    if (reconciling || selectedLinenos.size === 0) return;
    setReconciling(true);
    try {
      const toReconcile = displayTxns.filter(
        (t) => t.lineno != null && selectedLinenos.has(t.lineno) && t.flag === '!'
      );
      for (const txn of toReconcile) {
        await editTransaction({
          lineno: txn.lineno!,
          date: txn.date,
          flag: '*',
          payee: txn.payee,
          narration: txn.narration,
          postings: txn.postings.map((p) => ({
            account: p.account,
            amount: p.amount ? parseFloat(p.amount) : undefined,
            currency: p.currency ?? undefined,
          })),
        });
      }
      setSelectedLinenos(new Set());
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
    } finally {
      setReconciling(false);
    }
  }

  async function handleQuickReconcile(txn: Transaction) {
    if (txn.lineno == null) return;
    const newFlag = txn.flag === '*' ? '!' : '*';
    await editTransaction({
      lineno: txn.lineno,
      date: txn.date,
      flag: newFlag,
      payee: txn.payee,
      narration: txn.narration,
      postings: txn.postings.map((p) => ({
        account: p.account,
        amount: p.amount ? parseFloat(p.amount) : undefined,
        currency: p.currency ?? undefined,
      })),
    });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["series"] });
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedRowIndex((i) =>
        i === null ? 0 : Math.min(i + 1, displayTxns.length - 1)
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedRowIndex((i) =>
        i === null ? 0 : Math.max(i - 1, 0)
      );
    } else if (e.key === 'Enter' && selectedRowIndex !== null) {
      e.preventDefault();
      if (displayTxns[selectedRowIndex]) {
        openTxnModal(displayTxns[selectedRowIndex]);
      }
    } else if (e.key === ' ' && selectedRowIndex !== null) {
      e.preventDefault();
      const txn = displayTxns[selectedRowIndex];
      if (txn?.flag === '!' && txn.lineno != null) {
        toggleSelect(txn.lineno);
      }
    } else if ((e.key === 'r' || e.key === 'R') && selectedRowIndex !== null) {
      e.preventDefault();
      const txn = displayTxns[selectedRowIndex];
      if (txn?.lineno != null) {
        handleQuickReconcile(txn);
      }
    }
  }, [displayTxns, selectedRowIndex, openTxnModal]); // eslint-disable-line react-hooks/exhaustive-deps

  function getDescription(txn: Transaction): string {
    return [txn.payee, txn.narration].filter(Boolean).join(" — ");
  }

  function getSeriesType(txn: Transaction): 'recurring' | 'installment' | null {
    const t = txn.metadata['ledgr-series-type'];
    if (t === 'recurring' || t === 'installment') return t;
    return null;
  }

  function summarizeAccounts(txn: Transaction): string {
    if (txn.postings.length <= 2) {
      return txn.postings.map((p) => p.account.split(":").slice(-2).join(":")).join(" → ");
    }
    return `${txn.postings.length} accounts`;
  }

  function summarizeAmount(txn: Transaction): string {
    const positives = txn.postings.filter((p) => p.amount && parseFloat(p.amount) > 0);
    if (positives.length === 0) return "";
    const total = positives.reduce((sum, p) => sum + parseFloat(p.amount!), 0);
    const cur = positives[0].currency || operatingCurrency;
    return formatAmount(total, cur);
  }

  const pendingEligibleCount = displayTxns.filter(
    (t) => t.flag === '!' && t.lineno != null
  ).length;

  const isLoading = seriesQuery.isLoading || txnsQuery.isLoading;

  return (
    <div className="reports-view">
      <PageHeader<Filter>
        title="Series & Scheduled"
        action={
          <button
            className="btn btn-primary"
            onClick={() => openSeriesModal(undefined, filter === 'recurring' || filter === 'installment' ? filter : undefined)}
          >
            + New Series
          </button>
        }
        tabs={FILTER_TABS}
        activeTab={filter}
        onTabChange={(f) => {
          setFilter(f);
          setSelectedLinenos(new Set());
          setSelectedRowIndex(null);
        }}
      />

      {isLoading && <div className="report-loading">Loading…</div>}

      {!isLoading && (
        <div className="reports-content" style={{ maxWidth: 'none' }}>
          {/* Series summaries */}
          {filteredSeries.length > 0 && (
            <div className="series-summaries">
              <div className="series-section-label">Series</div>
              <table className="series-summary-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Payee / Narration</th>
                    <th style={{ width: 110 }}>Type</th>
                    <th style={{ width: 200 }}>Progress</th>
                    <th>Dates</th>
                    <th className="num" style={{ width: 120 }}>Per Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSeries.map((s) => (
                    <SeriesSummaryRow
                      key={s.series_id}
                      summary={s}
                      onViewSeries={openSeriesModal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredSeries.length === 0 && filter !== 'pending' && (
            <div className="series-empty-hint">
              No {filter === 'all' ? '' : filter + ' '}series yet.{' '}
              <button
                className="btn-link"
                onClick={() => openSeriesModal(undefined, filter === 'recurring' || filter === 'installment' ? filter : undefined)}
              >
                Create one
              </button>
            </div>
          )}

          {/* Transactions table */}
          <div className="series-transactions">
            <div className="series-section-label">
              Transactions
              {selectedLinenos.size > 0 && (
                <button
                  className="btn btn-primary series-reconcile-btn"
                  onClick={handleReconcileSelected}
                  disabled={reconciling}
                >
                  {reconciling
                    ? "Reconciling…"
                    : `Reconcile ${selectedLinenos.size} selected`}
                </button>
              )}
            </div>

            {displayTxns.length === 0 ? (
              <div className="series-empty-hint">No transactions to show.</div>
            ) : (
              <div
                className="register"
                tabIndex={0}
                ref={tableRef}
                onKeyDown={handleKeyDown}
                onClick={() => tableRef.current?.focus()}
              >
                <table className="series-txn-table">
                  <thead>
                    <tr>
                      <th style={{ width: 28 }}>
                        {pendingEligibleCount > 0 && (
                          <input
                            type="checkbox"
                            title="Select all pending"
                            checked={
                              pendingEligibleCount > 0 &&
                              displayTxns
                                .filter((t) => t.flag === '!' && t.lineno != null)
                                .every((t) => selectedLinenos.has(t.lineno!))
                            }
                            onChange={() => toggleSelectAll()}
                          />
                        )}
                      </th>
                      <th style={{ width: 110 }}>Date</th>
                      <th style={{ width: 20 }}>F</th>
                      <th>Payee / Narration</th>
                      <th>Accounts</th>
                      <th className="num" style={{ width: 100 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTxns.flatMap((txn, i) => {
                      const isPending = txn.flag === '!';
                      const isSelected = txn.lineno != null && selectedLinenos.has(txn.lineno);
                      const isRowSelected = selectedRowIndex === i;
                      const sType = getSeriesType(txn);
                      const isSplit = txn.postings.length > 2;
                      const isExpanded = expandedSplits.has(i);

                      const mainRow = (
                        <tr
                          key={txn.lineno ?? i}
                          className={`register-row${isPending ? ' pending' : ''}${isSelected ? ' row-selected' : ''}${isRowSelected ? ' row-selected' : ''}${isSplit ? ' register-row-split' : ''}`}
                          onClick={() => {
                            setSelectedRowIndex(i);
                            openTxnModal(txn);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <td
                            className="series-txn-check"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRowIndex(i);
                            }}
                          >
                            {isPending && txn.lineno != null && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (txn.lineno != null) toggleSelect(txn.lineno);
                                }}
                              />
                            )}
                          </td>
                          <td>{formatDateFull(txn.date, operatingCurrency)}</td>
                          <td className={txn.flag === '*' ? 'flag-confirmed' : 'flag-pending'}>
                            {txn.flag}
                          </td>
                          <td>
                            {sType === 'recurring' && (
                              <span className="series-inline-badge series-inline-recurring">Recurring</span>
                            )}
                            {sType === 'installment' && (
                              <span className="series-inline-badge series-inline-installment">
                                {txn.metadata['ledgr-series-seq'] != null && txn.metadata['ledgr-series-total'] != null
                                  ? formatInstallmentBadge(txn.metadata['ledgr-series-seq'], txn.metadata['ledgr-series-total'])
                                  : '#'}
                              </span>
                            )}
                            <span>{getDescription(txn) || "—"}</span>
                          </td>
                          <td className="accounts-summary">
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
                              summarizeAccounts(txn)
                            )}
                          </td>
                          <td className="num amount">
                            {summarizeAmount(txn)}
                          </td>
                        </tr>
                      );

                      if (!isSplit || !isExpanded) return [mainRow];

                      const splitRows = txn.postings.map((p, pi) => {
                        const amt = p.amount ? parseFloat(p.amount) : 0;
                        const shortAcct = p.account.split(":").length > 2
                          ? p.account.split(":").slice(1).join(":")
                          : p.account;
                        return (
                          <tr key={`${i}-split-${pi}`} className="register-split-row">
                            <td></td>
                            <td></td>
                            <td></td>
                            <td
                              className="register-split-account"
                              colSpan={2}
                            >
                              {shortAcct}
                            </td>
                            <td className={`num amount ${amt > 0 ? "positive" : amt < 0 ? "negative" : ""}`}>
                              {amt !== 0 ? formatAmount(Math.abs(amt), operatingCurrency) : ""}
                            </td>
                          </tr>
                        );
                      });

                      return [mainRow, ...splitRows];
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

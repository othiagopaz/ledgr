import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchBudget,
  setBudgetAllocation,
  copyBudgetMonth,
  fetchAccountNames,
} from '../api/client';
import { useAppStore } from '../stores/appStore';
import { today } from '../utils/dateUtils';
import PageHeader from './PageHeader';
import BudgetSection from './budget/BudgetSection';
import BudgetSummary from './budget/BudgetSummary';

/** Current month as "YYYY-MM" from the app's today(). */
function currentMonth(): string {
  return today().slice(0, 7);
}

/** Shift a "YYYY-MM" string by ±n months. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const zero = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(zero / 12);
  const nm = (zero % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Human-readable month label, e.g. "June 2026". */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  try {
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return month;
  }
}

export default function BudgetView() {
  const [month, setMonth] = useState<string>(currentMonth);
  const viewMode = useAppStore((s) => s.viewMode);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const budgetNavRequestId = useAppStore((s) => s.budgetNavRequestId);
  const budgetNavConsumedId = useAppStore((s) => s.budgetNavConsumedId);
  const budgetNavAction = useAppStore((s) => s.budgetNavAction);
  const consumeBudgetNav = useAppStore((s) => s.consumeBudgetNav);
  const queryClient = useQueryClient();

  const includePending = viewMode !== 'actual';

  const { data, isLoading, error } = useQuery({
    queryKey: ['budget', month, viewMode],
    queryFn: () => fetchBudget(month, viewMode),
  });

  const accountNamesQuery = useQuery({
    queryKey: ['account-names'],
    queryFn: fetchAccountNames,
  });
  const accountOptions = accountNamesQuery.data?.accounts || [];

  const [savingAccount, setSavingAccount] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const setAllocMutation = useMutation({
    mutationFn: ({ account, amount }: { account: string; amount: string | null }) =>
      setBudgetAllocation(month, account, amount, viewMode),
    onMutate: ({ account }) => {
      setSavingAccount(account);
      setActionError(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', month] });
    },
    onError: (e: Error) => setActionError(e.message),
    onSettled: () => setSavingAccount(null),
  });

  const copyMutation = useMutation({
    mutationFn: (fromMonth: string) =>
      copyBudgetMonth(fromMonth, month, viewMode),
    onMutate: () => setActionError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', month] });
    },
    onError: (e: Error) => setActionError(e.message),
  });

  function handleSetAllocation(account: string, amount: string | null) {
    setAllocMutation.mutate({ account, amount });
  }

  function handleCopyLastMonth() {
    copyMutation.mutate(shiftMonth(month, -1));
  }

  // Consume Cmd+K budget navigation signals. The consumed-id is tracked in the
  // store, so a fresh signal fires exactly once — even when the command both
  // opens the Budget tab (fresh mount) and fires the signal — while a stale
  // signal never replays on remount.
  // Bumped to ask a section to open its add-envelope row (from Cmd+K).
  const [addEnvelopeSignal, setAddEnvelopeSignal] = useState(0);
  useEffect(() => {
    if (budgetNavRequestId <= budgetNavConsumedId) return;
    if (budgetNavAction === 'next-month') setMonth((m) => shiftMonth(m, 1));
    else if (budgetNavAction === 'prev-month') setMonth((m) => shiftMonth(m, -1));
    else if (budgetNavAction === 'copy-last-month') handleCopyLastMonth();
    else if (budgetNavAction === 'add-envelope') setAddEnvelopeSignal((n) => n + 1);
    consumeBudgetNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetNavRequestId, budgetNavConsumedId, budgetNavAction]);

  const currency = data?.operating_currency || operatingCurrency;

  return (
    <div className="reports-view">
      <PageHeader
        title="Budget"
        action={
          <div className="budget-stepper">
            <button
              className="btn"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="budget-month-label">{monthLabel(month)}</span>
            <button
              className="btn"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Next month"
            >
              ›
            </button>
            <button
              className="btn"
              onClick={handleCopyLastMonth}
              disabled={copyMutation.isPending}
              title="Copy all envelopes from the previous month"
            >
              {copyMutation.isPending ? 'Copying…' : 'Copy last month'}
            </button>
          </div>
        }
      />

      {isLoading && <div className="report-loading">Loading…</div>}
      {error && (
        <div className="report-empty">Failed to load budget.</div>
      )}

      {data && (
        <div className="reports-content budget-content">
          <BudgetSummary
            sections={data.sections}
            bridge={data.bridge}
            currency={currency}
            ghostCount={data.ghost_count}
          />

          {actionError && (
            <div className="budget-action-error">{actionError}</div>
          )}

          {data.warnings.length > 0 && (
            <div className="budget-warnings">
              {data.warnings.map((w, i) => (
                <div key={i} className="budget-warning">
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {data.sections.map((section) => (
            <BudgetSection
              key={section.key}
              section={section}
              month={month}
              currency={currency}
              includePending={includePending}
              onSetAllocation={handleSetAllocation}
              savingAccount={savingAccount}
              accountOptions={accountOptions}
              openAddSignal={section.key === 'expenses' ? addEnvelopeSignal : 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

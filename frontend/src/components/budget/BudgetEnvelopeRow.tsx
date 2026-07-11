import { useState, useRef, useEffect } from 'react';
import { formatAmount, amountSignClass } from '../../utils/format';
import { periodToDateRange } from '../../utils/dateUtils';
import { useAppStore } from '../../stores/appStore';
import type { BudgetEnvelope } from '../../types';
import EnvelopeBar from './EnvelopeBar';

interface BudgetEnvelopeRowProps {
  envelope: BudgetEnvelope;
  sectionKey: 'income' | 'expenses' | 'allocations';
  /** Budget month as "YYYY-MM" — used for the drill-down date range. */
  month: string;
  currency: string;
  includePending: boolean;
  /** Commit a new allocation (or null/empty to clear). */
  onSetAllocation: (account: string, amount: string | null) => void;
  saving: boolean;
}

function shortAccount(account: string): string {
  const parts = account.split(':');
  return parts.length > 1 ? parts.slice(1).join(':') : account;
}

export default function BudgetEnvelopeRow({
  envelope,
  sectionKey,
  month,
  currency,
  includePending,
  onSetAllocation,
  saving,
}: BudgetEnvelopeRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const openDrill = useAppStore((s) => s.openDrill);

  function openTransactions() {
    const { from_date, to_date } = periodToDateRange(month);
    openDrill({
      account: envelope.account,
      fromDate: from_date,
      toDate: to_date,
      label: `${shortAccount(envelope.account)} · ${month}`,
    });
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit() {
    if (editing) return; // already editing — don't reset the draft
    setDraft(envelope.allocated ? String(envelope.allocated) : '');
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : trimmed;
    // Compare numerically so "500.00" vs 500 and a bare focus+blur on a
    // zero (unbudgeted) envelope don't fire a redundant no-op PUT.
    const nextNum = next === null ? 0 : parseFloat(next);
    if (Number.isNaN(nextNum)) return;
    if (nextNum === envelope.allocated) return; // no change
    onSetAllocation(envelope.account, next);
  }

  const variant = sectionKey === 'income' ? 'income' : 'spend';
  // For income, "free" near zero is the goal (target met); for spend, negative
  // free is overspend. amountSignClass colours by sign; we want the row's free
  // figure to read green when healthy. Spend: free >= 0 healthy. Income: free
  // <= 0 means target met/exceeded.
  const freeClass =
    variant === 'income'
      ? envelope.free <= 0
        ? 'positive'
        : 'amount-zero'
      : amountSignClass(envelope.free);

  const isGhost = envelope.is_ghost;

  return (
    <tr className={`budget-envelope-row${isGhost ? ' budget-envelope-ghost' : ''}`}>
      <td
        className="budget-envelope-name budget-envelope-drill"
        title="View transactions"
        onClick={openTransactions}
      >
        {shortAccount(envelope.account)}
        {isGhost && (
          <span className="budget-ghost-tag" title="Has activity but no budget">
            unbudgeted
          </span>
        )}
      </td>
      <td className="budget-envelope-bar-cell">
        <EnvelopeBar
          allocated={envelope.allocated}
          realized={envelope.realized}
          pending={envelope.pending}
          pacedAllocation={envelope.paced_allocation}
          variant={variant}
          includePending={includePending}
        />
      </td>
      <td className="num budget-col-allocated" onClick={startEdit}>
        {editing ? (
          <input
            ref={inputRef}
            className="num budget-alloc-input"
            type="number"
            step="0.01"
            min="0"
            value={draft}
            disabled={saving}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
              }
            }}
          />
        ) : isGhost ? (
          <span className="budget-alloc-display budget-alloc-set" title="Click to budget this account">
            Set budget
          </span>
        ) : (
          <span className="budget-alloc-display" title="Click to edit">
            {formatAmount(envelope.allocated, currency)}
          </span>
        )}
      </td>
      <td className={`num budget-col-realized ${amountSignClass(envelope.realized)}`}>
        {formatAmount(envelope.realized, currency)}
      </td>
      <td className="num budget-col-pending">
        {envelope.pending !== 0 ? formatAmount(envelope.pending, currency) : '—'}
      </td>
      <td
        className={`num budget-col-free ${freeClass}`}
        title="Allocated − Realized. Negative = over plan; positive = under plan."
      >
        {formatAmount(envelope.free, currency)}
      </td>
    </tr>
  );
}

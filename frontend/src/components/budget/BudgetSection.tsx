import { useState } from 'react';
import { formatAmount, amountSignClass } from '../../utils/format';
import type { BudgetSection as BudgetSectionData, BudgetEnvelope } from '../../types';
import BudgetEnvelopeRow from './BudgetEnvelopeRow';
import AddEnvelopeRow from './AddEnvelopeRow';

type SortKey = 'account' | 'allocated' | 'realized' | 'free';
type SortDir = 'asc' | 'desc';

function sortValue(env: BudgetEnvelope, key: SortKey): number | string {
  if (key === 'account') return env.account.toLowerCase();
  return env[key];
}

interface BudgetSectionProps {
  section: BudgetSectionData;
  /** Budget month as "YYYY-MM" — used for drill-down date range. */
  month: string;
  currency: string;
  includePending: boolean;
  onSetAllocation: (account: string, amount: string | null) => void;
  savingAccount: string | null;
  /** All account names, for the "add envelope" picker. */
  accountOptions: string[];
  /** Bumped (from Cmd+K) to auto-open this section's add-envelope row. */
  openAddSignal: number;
}

export default function BudgetSection({
  section,
  month,
  currency,
  includePending,
  onSetAllocation,
  savingAccount,
  accountOptions,
  openAddSignal,
}: BudgetSectionProps) {
  const { subtotal } = section;
  const existingAccounts = new Set(section.envelopes.map((e) => e.account));

  // Column sort (per section). Default (sortKey null): budgeted first, ghosts
  // last — the original order. Clicking a header sorts by that column and
  // toggles asc/desc; clicking a third time returns to the default.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null); // third click clears
    }
  }

  const orderedEnvelopes = [...section.envelopes];
  if (sortKey === null) {
    orderedEnvelopes.sort((a, b) => Number(a.is_ghost) - Number(b.is_ghost));
  } else {
    orderedEnvelopes.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }
  const freeClass =
    section.key === 'income'
      ? subtotal.free <= 0
        ? 'positive'
        : 'amount-zero'
      : amountSignClass(subtotal.free);

  return (
    <div className="budget-section">
      <table className="budget-table">
        <thead>
          <tr>
            <th
              className="budget-col-name budget-col-sortable"
              onClick={() => toggleSort('account')}
            >
              {section.label}{sortIndicator('account')}
            </th>
            <th className="budget-col-bar"></th>
            <th
              className="num budget-col-allocated budget-col-sortable"
              onClick={() => toggleSort('allocated')}
            >
              Allocated{sortIndicator('allocated')}
            </th>
            <th
              className="num budget-col-realized budget-col-sortable"
              onClick={() => toggleSort('realized')}
            >
              Realized{sortIndicator('realized')}
            </th>
            <th
              className="num budget-col-free budget-col-sortable"
              onClick={() => toggleSort('free')}
            >
              Variance{sortIndicator('free')}
            </th>
          </tr>
        </thead>
        <tbody>
          {section.envelopes.length === 0 && (
            <tr className="budget-empty-row">
              <td colSpan={5}>No envelopes budgeted in this section.</td>
            </tr>
          )}
          {orderedEnvelopes.map((env) => (
            <BudgetEnvelopeRow
              key={env.account}
              envelope={env}
              sectionKey={section.key}
              month={month}
              currency={currency}
              includePending={includePending}
              onSetAllocation={onSetAllocation}
              saving={savingAccount === env.account}
            />
          ))}
          <AddEnvelopeRow
            sectionKey={section.key}
            accountOptions={accountOptions}
            existingAccounts={existingAccounts}
            onAdd={(account, amount) => onSetAllocation(account, amount)}
            openSignal={openAddSignal}
          />
        </tbody>
        {section.envelopes.length > 0 && (
          <tfoot>
            <tr className="budget-subtotal-row">
              <td className="budget-col-name">Subtotal</td>
              <td className="budget-col-bar"></td>
              <td className="num budget-col-allocated">
                {formatAmount(subtotal.allocated, currency)}
              </td>
              <td className={`num budget-col-realized ${amountSignClass(subtotal.realized)}`}>
                {formatAmount(subtotal.realized, currency)}
              </td>
              <td className={`num budget-col-free ${freeClass}`}>
                {formatAmount(subtotal.free, currency)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

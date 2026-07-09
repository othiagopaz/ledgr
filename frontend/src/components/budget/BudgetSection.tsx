import { formatAmount, amountSignClass } from '../../utils/format';
import type { BudgetSection as BudgetSectionData } from '../../types';
import BudgetEnvelopeRow from './BudgetEnvelopeRow';
import AddEnvelopeRow from './AddEnvelopeRow';

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
  // Real budgeted envelopes first, ghost (unbudgeted-activity) rows after.
  const orderedEnvelopes = [...section.envelopes].sort(
    (a, b) => Number(a.is_ghost) - Number(b.is_ghost),
  );
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
            <th className="budget-col-name">{section.label}</th>
            <th className="budget-col-bar"></th>
            <th className="num budget-col-allocated">Allocated</th>
            <th className="num budget-col-realized">Realized</th>
            <th className="num budget-col-pending">Pending</th>
            <th className="num budget-col-free">Free</th>
          </tr>
        </thead>
        <tbody>
          {section.envelopes.length === 0 && (
            <tr className="budget-empty-row">
              <td colSpan={6}>No envelopes budgeted in this section.</td>
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
              <td className="num budget-col-pending">
                {subtotal.pending !== 0
                  ? formatAmount(subtotal.pending, currency)
                  : '—'}
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

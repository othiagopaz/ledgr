import { formatAmount } from '../../utils/format';
import type { BudgetSection, BudgetBridge, BudgetBridgeLine } from '../../types';

interface BudgetSummaryProps {
  sections: BudgetSection[];
  bridge: BudgetBridge;
  currency: string;
  ghostCount: number;
}

function sectionLine(sections: BudgetSection[], key: string): BudgetBridgeLine {
  const s = sections.find((x) => x.key === key)?.subtotal;
  return {
    allocated: s?.allocated ?? 0,
    realized: s?.realized ?? 0,
    pending: s?.pending ?? 0,
  };
}

const COLS = ['allocated', 'realized'] as const;
type Col = (typeof COLS)[number];

/**
 * Indirect-method cash bridge at the top of the Budget view:
 *
 *   Income − Expenses = Net Income
 *   Net Income − Allocations − Non-cash adjustment = Net Cash Flow
 *
 * Columns: Allocated (plan) / Realized (now) / Planned / Δ Variance.
 * Net Cash Flow (Realized) ties to the Cash Flow Statement — it is the "truth"
 * number. Variance (Realized − Allocated) is the deviation from the plan: on the
 * Net cash flow row it answers "did the month close at zero?" and on each
 * section it shows where the drift came from, so the user knows which line to
 * adjust. The "Non-cash adjustment" row is kept (it is what makes Net Cash Flow
 * tie to the Cash Flow Statement) but rendered as a quiet reconciliation line,
 * not a budgeting decision.
 */
export default function BudgetSummary({
  sections,
  bridge,
  currency,
  ghostCount,
}: BudgetSummaryProps) {
  const income = sectionLine(sections, 'income');
  const expenses = sectionLine(sections, 'expenses');

  function cell(value: number): string {
    return formatAmount(Math.abs(value) < 0.005 ? 0 : value, currency);
  }

  type Row = {
    label: string;
    line: BudgetBridgeLine;
    /** outflow rows display as negatives (Expenses, Allocations, Non-cash) */
    outflow?: boolean;
    emphasis?: 'net-cash';
    /** quiet reconciliation line (the cash-timing plug) */
    reconcile?: boolean;
    /** hide the variance cell (not an actionable deviation) */
    noVariance?: boolean;
    hint?: string;
  };

  // The budget is a cash plan: Income − Expenses − Allocations − Cash timing =
  // Net cash flow (target 0). No accrual "Net income" line — every row already
  // counts only what touches cash, except the deliberate accrual of Expenses
  // (credit-card purchases), whose timing gap is the "Cash timing" line.
  const hasTiming = Math.abs(bridge.other_non_cash.realized) >= 0.005;
  const rows: Row[] = [
    { label: 'Income', line: income },
    { label: 'Expenses', line: expenses, outflow: true },
    { label: 'Allocations', line: bridge.allocations, outflow: true },
    ...(hasTiming
      ? [{
          label: 'Cash timing',
          line: bridge.other_non_cash,
          outflow: true,
          reconcile: true,
          noVariance: true,
          hint: 'cards / bills — ties to Cash Flow',
        } as Row]
      : []),
    { label: 'Net cash flow', line: bridge.net_cash_flow, emphasis: 'net-cash' },
  ];

  function display(r: Row, col: Col): number {
    const v = r.line[col];
    // Outflow magnitudes are stored positive; show them as negatives in the
    // bridge so the column visibly subtracts down to the total.
    return r.outflow ? -v : v;
  }

  // Variance on the displayed values: Realized − Allocated. Positive is
  // favourable everywhere because outflows are already shown as negatives
  // (spending less than planned → realized less negative → positive variance).
  function variance(r: Row): number {
    return display(r, 'realized') - display(r, 'allocated');
  }

  function varianceClass(r: Row, v: number): string {
    if (Math.abs(v) < 0.005) return 'budget-var-zero';
    if (r.emphasis === 'net-cash') {
      // The plan's target is zero cash; ANY deviation is something to act on.
      return 'budget-var-deviation';
    }
    return v > 0 ? 'budget-var-favorable' : 'budget-var-adverse';
  }

  return (
    <div className="budget-summary">
      <table className="budget-summary-table">
        <thead>
          <tr>
            <th className="budget-summary-label">Summary</th>
            <th className="num">
              Allocated <span className="budget-summary-hint">plan</span>
            </th>
            <th className="num">
              Realized <span className="budget-summary-hint">now</span>
            </th>
            <th className="num">
              Δ Variance <span className="budget-summary-hint">vs plan</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = variance(r);
            return (
              <tr
                key={r.label}
                className={
                  (r.emphasis ? `budget-summary-${r.emphasis}` : '') +
                  (r.reconcile ? ' budget-summary-reconcile' : '')
                }
              >
                <td className="budget-summary-label">
                  {r.label}
                  {r.hint && <span className="budget-summary-hint"> · {r.hint}</span>}
                </td>
                {COLS.map((col) => (
                  <td key={col} className="num">
                    {cell(display(r, col))}
                  </td>
                ))}
                <td className={`num ${r.noVariance ? '' : varianceClass(r, v)}`}>
                  {r.noVariance ? '—' : cell(v)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="budget-summary-caption">
        Realized ties to the Cash Flow Statement — the month's real cash. Variance
        (Realized − Allocated) is your deviation from the plan; a non-zero Net
        cash flow variance means there is cash left to allocate (or a shortfall to
        cover) to close the month at zero.
      </div>
      {ghostCount > 0 && (
        <div className="budget-summary-ghosts">
          {ghostCount} unbudgeted {ghostCount === 1 ? 'account' : 'accounts'} with
          activity included — set a budget to plan {ghostCount === 1 ? 'it' : 'them'}.
        </div>
      )}
    </div>
  );
}

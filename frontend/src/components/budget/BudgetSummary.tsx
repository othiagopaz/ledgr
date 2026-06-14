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

const COLS = ['allocated', 'realized', 'pending'] as const;
type Col = (typeof COLS)[number];

/**
 * Indirect-method cash bridge at the top of the Budget view:
 *
 *   Income − Expenses = Net Income
 *   Net Income − Allocations − Other non-cash adjustments = Net Cash Flow
 *
 * Three columns (Allocated / Realized / Planned). Net Cash Flow (Realized) ties
 * to the Cash Flow Statement. A final "Projected net cash" row shows the cash
 * left if every remaining budget is consumed (0 = the plan fully consumes the
 * month). Outflow rows (Expenses, Allocations, Other) are shown as negatives.
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
    /** outflow rows display as negatives (Expenses, Allocations, Other) */
    outflow?: boolean;
    emphasis?: 'net-income' | 'net-cash';
  };

  const rows: Row[] = [
    { label: 'Income', line: income },
    { label: 'Expenses', line: expenses, outflow: true },
    { label: 'Net income', line: bridge.net_income, emphasis: 'net-income' },
    { label: 'Allocations', line: bridge.allocations, outflow: true },
    { label: 'Other non-cash adjustments', line: bridge.other_non_cash, outflow: true },
    { label: 'Net cash flow', line: bridge.net_cash_flow, emphasis: 'net-cash' },
  ];

  function display(r: Row, col: Col): number {
    const v = r.line[col];
    // Outflow magnitudes are stored positive; show them as negatives in the
    // bridge so the column visibly subtracts down to the total.
    return r.outflow ? -v : v;
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
            <th className="num">Planned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              className={r.emphasis ? `budget-summary-${r.emphasis}` : ''}
            >
              <td className="budget-summary-label">{r.label}</td>
              {COLS.map((col) => {
                const v = display(r, col);
                return (
                  <td key={col} className="num">
                    {col === 'pending' && r.line.pending === 0
                      ? '—'
                      : cell(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="budget-summary-caption">
        Realized ties to the Cash Flow Statement; Allocated is the projection if
        the plan plays out.
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

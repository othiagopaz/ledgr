import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchIncomeStatement } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { formatAmount } from "../../utils/format";
import { IntervalSelector } from "./IncomeExpenseChart";
import type { AccountReportNode, OtherCurrencyAmount } from "../../types";

function formatOtherCurrencies(items?: OtherCurrencyAmount[]): string {
  if (!items || items.length === 0) return "";
  return items
    .map(({ amount, currency }) => {
      const num = parseFloat(amount);
      return `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    })
    .join("\n");
}

function aggregateOtherTotals(nodes: AccountReportNode[]): OtherCurrencyAmount[] {
  const agg: Record<string, number> = {};
  for (const n of nodes) {
    for (const item of n.other_total || []) {
      agg[item.currency] = (agg[item.currency] || 0) + parseFloat(item.amount);
    }
  }
  return Object.entries(agg)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ amount: String(amount), currency }));
}

function hasAnyOtherData(nodes: AccountReportNode[]): boolean {
  for (const n of nodes) {
    if (n.other_total && n.other_total.length > 0) return true;
    if (hasAnyOtherData(n.children)) return true;
  }
  return false;
}

export default function IncomeStatement() {
  const [interval, setInterval] = useState("monthly");
  const [expandAll, setExpandAll] = useState(false);
  const [expandKey, setExpandKey] = useState(0);
  const currency = useAppStore((s) => s.operatingCurrency);

  const { data, isLoading } = useQuery({
    queryKey: ["income-statement", interval],
    queryFn: () => fetchIncomeStatement(undefined, undefined, interval),
  });

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (!data) return <div className="report-empty">No data</div>;

  const { income, expenses, periods, net_income, other_net_income } = data;
  const showOther = hasAnyOtherData(income) || hasAnyOtherData(expenses);
  const colCount = periods.length + 2 + (showOther ? 1 : 0);

  const toggleExpandAll = () => {
    setExpandAll((prev) => !prev);
    setExpandKey((k) => k + 1);
  };

  return (
    <div className="report-statement">
      <div className="report-chart-controls">
        <IntervalSelector value={interval} onChange={setInterval} />
        <button className="interval-btn" onClick={toggleExpandAll}>
          {expandAll ? "Collapse All" : "Expand All"}
        </button>
      </div>
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead>
            <tr>
              <th className="report-table-account">Account</th>
              {periods.map((p) => (
                <th key={p} className="report-table-num">{p}</th>
              ))}
              <th className="report-table-num report-table-total">Total</th>
              {showOther && <th className="report-table-num report-table-other">Other</th>}
            </tr>
          </thead>
          <tbody key={expandKey}>
            {/* Income section */}
            <tr className="report-table-section-header">
              <td colSpan={colCount}>Income</td>
            </tr>
            {income.map((node) => (
              <ReportTreeRows key={node.name} node={node} periods={periods} currency={currency} depth={0} showOther={showOther} defaultExpanded={expandAll} />
            ))}
            <tr className="report-table-subtotal">
              <td>Total Income</td>
              {periods.map((p) => (
                <td key={p} className="report-table-num positive">
                  {formatAmount(
                    income.reduce((sum, n) => sum + (n.totals[p] || 0), 0),
                    currency
                  )}
                </td>
              ))}
              <td className="report-table-num report-table-total positive">
                {formatAmount(income.reduce((sum, n) => sum + n.total, 0), currency)}
              </td>
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(aggregateOtherTotals(income))}
                </td>
              )}
            </tr>

            {/* Expenses section */}
            <tr className="report-table-section-header">
              <td colSpan={colCount}>Expenses</td>
            </tr>
            {expenses.map((node) => (
              <ReportTreeRows key={node.name} node={node} periods={periods} currency={currency} depth={0} showOther={showOther} defaultExpanded={expandAll} />
            ))}
            <tr className="report-table-subtotal">
              <td>Total Expenses</td>
              {periods.map((p) => (
                <td key={p} className="report-table-num negative">
                  {formatAmount(
                    expenses.reduce((sum, n) => sum + (n.totals[p] || 0), 0),
                    currency
                  )}
                </td>
              ))}
              <td className="report-table-num report-table-total negative">
                {formatAmount(expenses.reduce((sum, n) => sum + n.total, 0), currency)}
              </td>
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(aggregateOtherTotals(expenses))}
                </td>
              )}
            </tr>

            {/* Net Income */}
            <tr className="report-table-grand-total">
              <td>Net Income</td>
              {periods.map((p) => {
                const val = net_income[p] || 0;
                return (
                  <td key={p} className={`report-table-num ${val >= 0 ? "positive" : "negative"}`}>
                    {formatAmount(val, currency)}
                  </td>
                );
              })}
              <td className="report-table-num report-table-total">
                {formatAmount(
                  Object.values(net_income).reduce((a, b) => a + b, 0),
                  currency
                )}
              </td>
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(other_net_income)}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportTreeRows({
  node,
  periods,
  currency,
  depth,
  showOther,
  defaultExpanded,
}: {
  node: AccountReportNode;
  periods: string[];
  currency: string;
  depth: number;
  showOther: boolean;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;
  const shortName = node.name.split(":").pop() || node.name;

  return (
    <>
      <tr
        className={`report-tree-row ${hasChildren ? "report-tree-parent" : ""}`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <td
          className="report-table-account"
          style={{ paddingLeft: `${16 + depth * 20}px` }}
        >
          {hasChildren && (
            <span className="report-tree-toggle">{expanded ? "▾" : "▸"}</span>
          )}
          {shortName}
        </td>
        {periods.map((p) => (
          <td key={p} className="report-table-num">
            {node.totals[p] ? formatAmount(node.totals[p], currency) : "—"}
          </td>
        ))}
        <td className="report-table-num report-table-total">
          {node.total ? formatAmount(node.total, currency) : "—"}
        </td>
        {showOther && (
          <td className="report-table-num report-table-other other-currencies">
            {formatOtherCurrencies(node.other_total)}
          </td>
        )}
      </tr>
      {expanded &&
        node.children.map((child) => (
          <ReportTreeRows
            key={child.name}
            node={child}
            periods={periods}
            currency={currency}
            depth={depth + 1}
            showOther={showOther}
            defaultExpanded={defaultExpanded}
          />
        ))}
    </>
  );
}

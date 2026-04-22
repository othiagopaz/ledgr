import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchIncomeStatement } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useFilterParams } from "../../hooks/useFilterParams";
import { formatAmount, amountSignClass } from "../../utils/format";
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
  const viewMode = useAppStore((s) => s.viewMode);
  const filters = useFilterParams();

  const { data, isLoading } = useQuery({
    queryKey: ["income-statement", interval, viewMode, filters],
    queryFn: () => fetchIncomeStatement(interval, viewMode, filters),
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
              <ReportTreeRows key={node.name} node={node} periods={periods} currency={currency} depth={0} showOther={showOther} defaultExpanded={expandAll} signFactor={1} />
            ))}
            <SubtotalRow
              label="Total Income"
              nodes={income}
              periods={periods}
              currency={currency}
              signFactor={1}
              showOther={showOther}
            />

            {/* Expenses section */}
            <tr className="report-table-section-header">
              <td colSpan={colCount}>Expenses</td>
            </tr>
            {expenses.map((node) => (
              <ReportTreeRows key={node.name} node={node} periods={periods} currency={currency} depth={0} showOther={showOther} defaultExpanded={expandAll} signFactor={-1} />
            ))}
            <SubtotalRow
              label="Total Expenses"
              nodes={expenses}
              periods={periods}
              currency={currency}
              signFactor={-1}
              showOther={showOther}
            />

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
              {(() => {
                const niTotal = Object.values(net_income).reduce((a, b) => a + b, 0);
                return (
                  <td className={`report-table-num report-table-total ${amountSignClass(niTotal)}`}>
                    {formatAmount(niTotal, currency)}
                  </td>
                );
              })()}
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

function SubtotalRow({
  label,
  nodes,
  periods,
  currency,
  signFactor,
  showOther,
}: {
  label: string;
  nodes: AccountReportNode[];
  periods: string[];
  currency: string;
  signFactor: 1 | -1;
  showOther: boolean;
}) {
  const totalSum = nodes.reduce((sum, n) => sum + n.total, 0) * signFactor;
  return (
    <tr className="report-table-subtotal">
      <td>{label}</td>
      {periods.map((p) => {
        const v = nodes.reduce((sum, n) => sum + (n.totals[p] || 0), 0) * signFactor;
        return (
          <td key={p} className={`report-table-num ${amountSignClass(v)}`}>
            {formatAmount(v, currency)}
          </td>
        );
      })}
      <td className={`report-table-num report-table-total ${amountSignClass(totalSum)}`}>
        {formatAmount(totalSum, currency)}
      </td>
      {showOther && (
        <td className="report-table-num report-table-other other-currencies">
          {formatOtherCurrencies(aggregateOtherTotals(nodes))}
        </td>
      )}
    </tr>
  );
}

function ReportTreeRows({
  node,
  periods,
  currency,
  depth,
  showOther,
  defaultExpanded,
  signFactor,
}: {
  node: AccountReportNode;
  periods: string[];
  currency: string;
  depth: number;
  showOther: boolean;
  defaultExpanded: boolean;
  signFactor: 1 | -1;
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
        {periods.map((p) => {
          const raw = node.totals[p];
          if (!raw) return <td key={p} className="report-table-num">—</td>;
          const v = raw * signFactor;
          return (
            <td key={p} className={`report-table-num ${amountSignClass(v)}`}>
              {formatAmount(v, currency)}
            </td>
          );
        })}
        {(() => {
          if (!node.total) return <td className="report-table-num report-table-total">—</td>;
          const v = node.total * signFactor;
          return (
            <td className={`report-table-num report-table-total ${amountSignClass(v)}`}>
              {formatAmount(v, currency)}
            </td>
          );
        })()}
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
            signFactor={signFactor}
          />
        ))}
    </>
  );
}

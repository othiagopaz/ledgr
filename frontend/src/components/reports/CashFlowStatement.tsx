import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCashFlow } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { formatAmount } from "../../utils/format";
import { IntervalSelector } from "./IncomeExpenseChart";
import type { CashFlowSection } from "../../types";

export default function CashFlowStatement() {
  const [interval, setInterval] = useState("monthly");
  const currency = useAppStore((s) => s.operatingCurrency);

  const { data, isLoading } = useQuery({
    queryKey: ["cashflow", interval],
    queryFn: () => fetchCashFlow(undefined, undefined, interval),
  });

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (!data) return <div className="report-empty">No data</div>;

  const { periods, operating, investing, financing, transfers, net_cashflow, opening_balance, closing_balance } = data;

  const hasTransfers = transfers.total !== 0;

  return (
    <div className="report-statement">
      <div className="report-chart-controls">
        <IntervalSelector value={interval} onChange={setInterval} />
      </div>
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead>
            <tr>
              <th className="report-table-account">Cash Flow</th>
              {periods.map((p) => (
                <th key={p} className="report-table-num">{p}</th>
              ))}
              <th className="report-table-num report-table-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* Operating */}
            <CashFlowSectionRows
              label="Operating"
              section={operating}
              periods={periods}
              currency={currency}
            />

            {/* Investing */}
            {(investing.total !== 0 || investing.items.length > 0) && (
              <CashFlowSectionRows
                label="Investing"
                section={investing}
                periods={periods}
                currency={currency}
              />
            )}

            {/* Financing */}
            {(financing.total !== 0 || financing.items.length > 0) && (
              <CashFlowSectionRows
                label="Financing"
                section={financing}
                periods={periods}
                currency={currency}
              />
            )}

            {/* Transfers (shown only if non-zero) */}
            {hasTransfers && (
              <CashFlowSectionRows
                label="Transfers"
                section={transfers}
                periods={periods}
                currency={currency}
              />
            )}

            {/* Net Cash Flow */}
            <tr className="report-table-grand-total">
              <td>Net Cash Flow</td>
              {periods.map((p) => {
                const val = net_cashflow[p] || 0;
                return (
                  <td key={p} className={`report-table-num ${val >= 0 ? "positive" : "negative"}`}>
                    {formatAmount(val, currency)}
                  </td>
                );
              })}
              <td className="report-table-num report-table-total">
                {formatAmount(
                  Object.values(net_cashflow).reduce((a, b) => a + b, 0),
                  currency
                )}
              </td>
            </tr>

            {/* Opening/Closing balances */}
            <tr className="cashflow-balance-row">
              <td colSpan={periods.length + 2} style={{ height: 8 }} />
            </tr>
            <tr className="cashflow-balance-row">
              <td>Opening Cash Balance</td>
              {periods.map((p) => (
                <td key={p} className="report-table-num">
                  {formatAmount(opening_balance[p] || 0, currency)}
                </td>
              ))}
              <td className="report-table-num report-table-total">
                {formatAmount(opening_balance[periods[0]] || 0, currency)}
              </td>
            </tr>
            <tr className="cashflow-balance-row cashflow-closing">
              <td>Closing Cash Balance</td>
              {periods.map((p) => (
                <td key={p} className="report-table-num">
                  {formatAmount(closing_balance[p] || 0, currency)}
                </td>
              ))}
              <td className="report-table-num report-table-total">
                {formatAmount(
                  closing_balance[periods[periods.length - 1]] || 0,
                  currency
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashFlowSectionRows({
  label,
  section,
  periods,
  currency,
}: {
  label: string;
  section: CashFlowSection;
  periods: string[];
  currency: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <>
      {/* Section header */}
      <tr className="report-table-section-header">
        <td colSpan={periods.length + 2}>{label}</td>
      </tr>

      {/* Line items */}
      {expanded &&
        section.items.map((item) => (
          <tr key={item.full_name} className="report-tree-row">
            <td className="report-table-account" style={{ paddingLeft: 36 }}>
              {item.name}
            </td>
            {periods.map((p) => (
              <td key={p} className="report-table-num">
                {item.totals[p] != null
                  ? formatAmount(item.totals[p], currency)
                  : "—"}
              </td>
            ))}
            <td className="report-table-num report-table-total">
              {item.total ? formatAmount(item.total, currency) : "—"}
            </td>
          </tr>
        ))}

      {/* Subtotal */}
      <tr
        className="report-table-subtotal cashflow-subtotal-clickable"
        onClick={() => setExpanded(!expanded)}
      >
        <td>
          <span className="report-tree-toggle">{expanded ? "▾" : "▸"}</span>
          {label} subtotal
        </td>
        {periods.map((p) => {
          const val = section.totals[p] || 0;
          return (
            <td
              key={p}
              className={`report-table-num ${val >= 0 ? "positive" : "negative"}`}
            >
              {formatAmount(val, currency)}
            </td>
          );
        })}
        <td className={`report-table-num report-table-total ${section.total >= 0 ? "positive" : "negative"}`}>
          {formatAmount(section.total, currency)}
        </td>
      </tr>
    </>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCashFlow } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useFilterParams } from "../../hooks/useFilterParams";
import { formatAmount, amountSignClass } from "../../utils/format";
import { IntervalSelector } from "./IncomeExpenseChart";
import type { CashFlowSection, OtherCurrencyAmount } from "../../types";

function formatOtherCurrencies(items?: OtherCurrencyAmount[]): string {
  if (!items || items.length === 0) return "";
  return items
    .map(({ amount, currency }) => {
      const num = parseFloat(amount);
      return `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    })
    .join("\n");
}

export default function CashFlowStatement() {
  const [interval, setInterval] = useState("monthly");
  const [expandAll, setExpandAll] = useState(false);
  const [expandKey, setExpandKey] = useState(0);
  const currency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);
  const filters = useFilterParams();

  const { data, isLoading } = useQuery({
    queryKey: ["cashflow", interval, viewMode, filters],
    queryFn: () => fetchCashFlow(interval, viewMode, filters),
  });

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (!data) return <div className="report-empty">No data</div>;

  const {
    periods, operating, investing, financing, transfers,
    net_cashflow, opening_balance, closing_balance,
    other_net_cashflow, other_opening_balance, other_closing_balance,
  } = data;

  const hasTransfers = transfers.total !== 0;

  const showOther =
    (other_net_cashflow && other_net_cashflow.length > 0) ||
    [operating, investing, financing, transfers].some(
      (s) => s.other_items && s.other_items.length > 0
    );

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
              <th className="report-table-account">Cash Flow</th>
              {periods.map((p) => (
                <th key={p} className="report-table-num">{p}</th>
              ))}
              <th className="report-table-num report-table-total">Total</th>
              {showOther && (
                <th className="report-table-num report-table-other">Other</th>
              )}
            </tr>
          </thead>
          <tbody key={expandKey}>
            {/* Operating */}
            <CashFlowSectionRows
              label="Operating"
              section={operating}
              periods={periods}
              currency={currency}
              defaultExpanded={expandAll}
              showOther={showOther}
            />

            {/* Investing */}
            {(investing.total !== 0 || investing.items.length > 0) && (
              <CashFlowSectionRows
                label="Investing"
                section={investing}
                periods={periods}
                currency={currency}
                defaultExpanded={expandAll}
                showOther={showOther}
              />
            )}

            {/* Financing */}
            {(financing.total !== 0 || financing.items.length > 0) && (
              <CashFlowSectionRows
                label="Financing"
                section={financing}
                periods={periods}
                currency={currency}
                defaultExpanded={expandAll}
                showOther={showOther}
              />
            )}

            {/* Transfers (shown only if non-zero) */}
            {hasTransfers && (
              <CashFlowSectionRows
                label="Transfers"
                section={transfers}
                periods={periods}
                currency={currency}
                defaultExpanded={expandAll}
                showOther={showOther}
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
              {(() => {
                const ncfTotal = Object.values(net_cashflow).reduce((a, b) => a + b, 0);
                return (
                  <td className={`report-table-num report-table-total ${amountSignClass(ncfTotal)}`}>
                    {formatAmount(ncfTotal, currency)}
                  </td>
                );
              })()}
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(other_net_cashflow)}
                </td>
              )}
            </tr>

            {/* Opening/Closing balances */}
            <tr className="cashflow-balance-row">
              <td colSpan={periods.length + 2 + (showOther ? 1 : 0)} style={{ height: 8 }} />
            </tr>
            <tr className="cashflow-balance-row">
              <td>Opening Cash Balance</td>
              {periods.map((p) => {
                const val = opening_balance[p] || 0;
                return (
                  <td key={p} className={`report-table-num ${amountSignClass(val)}`}>
                    {formatAmount(val, currency)}
                  </td>
                );
              })}
              {(() => {
                const val = opening_balance[periods[0]] || 0;
                return (
                  <td className={`report-table-num report-table-total ${amountSignClass(val)}`}>
                    {formatAmount(val, currency)}
                  </td>
                );
              })()}
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(other_opening_balance)}
                </td>
              )}
            </tr>
            <tr className="cashflow-balance-row cashflow-closing">
              <td>Closing Cash Balance</td>
              {periods.map((p) => {
                const val = closing_balance[p] || 0;
                return (
                  <td key={p} className={`report-table-num ${amountSignClass(val)}`}>
                    {formatAmount(val, currency)}
                  </td>
                );
              })}
              {(() => {
                const val = closing_balance[periods[periods.length - 1]] || 0;
                return (
                  <td className={`report-table-num report-table-total ${amountSignClass(val)}`}>
                    {formatAmount(val, currency)}
                  </td>
                );
              })()}
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(other_closing_balance)}
                </td>
              )}
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
  defaultExpanded,
  showOther,
}: {
  label: string;
  section: CashFlowSection;
  periods: string[];
  currency: string;
  defaultExpanded: boolean;
  showOther: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <>
      {/* Section header */}
      <tr className="report-table-section-header">
        <td colSpan={periods.length + 2 + (showOther ? 1 : 0)}>{label}</td>
      </tr>

      {/* Line items */}
      {expanded &&
        section.items.map((item) => (
          <tr key={item.full_name} className="report-tree-row">
            <td className="report-table-account" style={{ paddingLeft: 36 }}>
              {item.name}
            </td>
            {periods.map((p) => (
              <td key={p} className={`report-table-num ${item.totals[p] != null ? amountSignClass(item.totals[p]) : ""}`}>
                {item.totals[p] != null
                  ? formatAmount(item.totals[p], currency)
                  : "—"}
              </td>
            ))}
            <td className={`report-table-num report-table-total ${item.total ? amountSignClass(item.total) : ""}`}>
              {item.total ? formatAmount(item.total, currency) : "—"}
            </td>
            {showOther && <td className="report-table-num report-table-other" />}
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
        {showOther && <td className="report-table-num report-table-other" />}
      </tr>
    </>
  );
}

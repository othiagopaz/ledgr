import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBalanceSheet } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useFilterParams } from "../../hooks/useFilterParams";
import { formatAmount } from "../../utils/format";
import type { BalanceSheetNode, OtherCurrencyAmount } from "../../types";

function formatOtherCurrencies(items?: OtherCurrencyAmount[]): string {
  if (!items || items.length === 0) return "";
  return items
    .map(({ amount, currency }) => {
      const num = parseFloat(amount);
      return `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    })
    .join("\n");
}

export default function BalanceSheet() {
  const [expandAll, setExpandAll] = useState(false);
  const [expandKey, setExpandKey] = useState(0);
  const currency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);
  const filters = useFilterParams();

  const { data, isLoading } = useQuery({
    queryKey: ["balance-sheet", viewMode, filters],
    queryFn: () => fetchBalanceSheet(viewMode, filters),
  });

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (!data) return <div className="report-empty">No data</div>;

  const { assets, liabilities, equity, totals, other_totals } = data;
  const showOther = !!(
    other_totals &&
    (other_totals.assets?.length || other_totals.liabilities?.length || other_totals.equity?.length)
  );
  const colCount = 2 + (showOther ? 1 : 0);

  const toggleExpandAll = () => {
    setExpandAll((prev) => !prev);
    setExpandKey((k) => k + 1);
  };

  return (
    <div className="report-statement">
      <div className="report-chart-controls">
        <button className="interval-btn" onClick={toggleExpandAll}>
          {expandAll ? "Collapse All" : "Expand All"}
        </button>
      </div>
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead>
            <tr>
              <th className="report-table-account">Account</th>
              <th className="report-table-num">Balance</th>
              {showOther && <th className="report-table-num report-table-other">Other</th>}
            </tr>
          </thead>
          <tbody key={expandKey}>
            {/* Assets */}
            <tr className="report-table-section-header">
              <td colSpan={colCount}>Assets</td>
            </tr>
            {assets.map((node) => (
              <BalanceTreeRows key={node.name} node={node} currency={currency} depth={0} showOther={showOther} defaultExpanded={expandAll} />
            ))}
            <tr className="report-table-subtotal">
              <td>Total Assets</td>
              <td className="report-table-num positive">
                {formatAmount(totals.assets, currency)}
              </td>
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(other_totals?.assets)}
                </td>
              )}
            </tr>

            {/* Liabilities */}
            <tr className="report-table-section-header">
              <td colSpan={colCount}>Liabilities</td>
            </tr>
            {liabilities.map((node) => (
              <BalanceTreeRows key={node.name} node={node} currency={currency} depth={0} showOther={showOther} defaultExpanded={expandAll} />
            ))}
            <tr className="report-table-subtotal">
              <td>Total Liabilities</td>
              <td className="report-table-num negative">
                {formatAmount(totals.liabilities, currency)}
              </td>
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(other_totals?.liabilities)}
                </td>
              )}
            </tr>

            {/* Equity */}
            <tr className="report-table-section-header">
              <td colSpan={colCount}>Equity</td>
            </tr>
            {equity.map((node) => (
              <BalanceTreeRows key={node.name} node={node} currency={currency} depth={0} showOther={showOther} defaultExpanded={expandAll} />
            ))}
            <tr className="report-table-subtotal">
              <td>Total Equity</td>
              <td className="report-table-num">
                {formatAmount(totals.equity, currency)}
              </td>
              {showOther && (
                <td className="report-table-num report-table-other other-currencies">
                  {formatOtherCurrencies(other_totals?.equity)}
                </td>
              )}
            </tr>

            {/* Grand total */}
            <tr className="report-table-grand-total">
              <td>Liabilities + Equity</td>
              <td className="report-table-num">
                {formatAmount(totals.liabilities + totals.equity, currency)}
              </td>
              {showOther && <td className="report-table-num report-table-other" />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BalanceTreeRows({
  node,
  currency,
  depth,
  showOther,
  defaultExpanded,
}: {
  node: BalanceSheetNode;
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
        <td className="report-table-num">
          {node.balance ? formatAmount(node.balance, currency) : "—"}
        </td>
        {showOther && (
          <td className="report-table-num report-table-other other-currencies">
            {formatOtherCurrencies(node.other_balance)}
          </td>
        )}
      </tr>
      {expanded &&
        node.children.map((child) => (
          <BalanceTreeRows
            key={child.name}
            node={child}
            currency={currency}
            depth={depth + 1}
            showOther={showOther}
            defaultExpanded={defaultExpanded}
          />
        ))}
    </>
  );
}

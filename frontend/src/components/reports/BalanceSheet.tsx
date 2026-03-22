import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBalanceSheet } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { formatAmount } from "../../utils/format";
import type { BalanceSheetNode } from "../../types";

export default function BalanceSheet() {
  const [asOfDate, setAsOfDate] = useState("");
  const currency = useAppStore((s) => s.operatingCurrency);

  const { data, isLoading } = useQuery({
    queryKey: ["balance-sheet", asOfDate],
    queryFn: () => fetchBalanceSheet(asOfDate || undefined),
  });

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (!data) return <div className="report-empty">No data</div>;

  const { assets, liabilities, equity, totals } = data;

  return (
    <div className="report-statement">
      <div className="report-chart-controls">
        <label className="report-date-label">
          As of:
          <input
            type="date"
            className="report-date-input"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </label>
        {asOfDate && (
          <button className="interval-btn" onClick={() => setAsOfDate("")}>
            Latest
          </button>
        )}
      </div>
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead>
            <tr>
              <th className="report-table-account">Account</th>
              <th className="report-table-num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Assets */}
            <tr className="report-table-section-header">
              <td colSpan={2}>Assets</td>
            </tr>
            {assets.map((node) => (
              <BalanceTreeRows key={node.name} node={node} currency={currency} depth={0} />
            ))}
            <tr className="report-table-subtotal">
              <td>Total Assets</td>
              <td className="report-table-num positive">
                {formatAmount(totals.assets, currency)}
              </td>
            </tr>

            {/* Liabilities */}
            <tr className="report-table-section-header">
              <td colSpan={2}>Liabilities</td>
            </tr>
            {liabilities.map((node) => (
              <BalanceTreeRows key={node.name} node={node} currency={currency} depth={0} />
            ))}
            <tr className="report-table-subtotal">
              <td>Total Liabilities</td>
              <td className="report-table-num negative">
                {formatAmount(totals.liabilities, currency)}
              </td>
            </tr>

            {/* Equity */}
            <tr className="report-table-section-header">
              <td colSpan={2}>Equity</td>
            </tr>
            {equity.map((node) => (
              <BalanceTreeRows key={node.name} node={node} currency={currency} depth={0} />
            ))}
            <tr className="report-table-subtotal">
              <td>Total Equity</td>
              <td className="report-table-num">
                {formatAmount(totals.equity, currency)}
              </td>
            </tr>

            {/* Grand total */}
            <tr className="report-table-grand-total">
              <td>Liabilities + Equity</td>
              <td className="report-table-num">
                {formatAmount(totals.liabilities + totals.equity, currency)}
              </td>
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
}: {
  node: BalanceSheetNode;
  currency: string;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
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
      </tr>
      {expanded &&
        node.children.map((child) => (
          <BalanceTreeRows
            key={child.name}
            node={child}
            currency={currency}
            depth={depth + 1}
          />
        ))}
    </>
  );
}

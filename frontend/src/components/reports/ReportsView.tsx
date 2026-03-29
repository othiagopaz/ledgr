import { useState } from "react";
import IncomeExpenseChart from "./IncomeExpenseChart";
import NetWorthChart from "./NetWorthChart";
import AccountBalanceChart from "./AccountBalanceChart";
import IncomeStatement from "./IncomeStatement";
import BalanceSheet from "./BalanceSheet";
import CashFlowStatement from "./CashFlowStatement";

type ReportTab = "charts" | "income-statement" | "cash-flow" | "balance-sheet";

export default function ReportsView() {
  const [activeTab, setActiveTab] = useState<ReportTab>("charts");

  return (
    <div className="reports-view">
      <div className="series-view-header">
        <h2>Reports</h2>
      </div>
      <div className="reports-nav" style={{ marginTop: 12 }}>
        {(
          [
            ["charts", "Charts"],
            ["income-statement", "Income Statement"],
            ["cash-flow", "Cash Flow"],
            ["balance-sheet", "Balance Sheet"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`reports-nav-btn ${activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="reports-content">
        {activeTab === "charts" && (
          <>
            <div className="report-section">
              <h3 className="report-section-title">Income vs Expenses</h3>
              <IncomeExpenseChart />
            </div>
            <div className="report-section">
              <h3 className="report-section-title">Net Worth</h3>
              <NetWorthChart />
            </div>
            <div className="report-section">
              <h3 className="report-section-title">Account Balance</h3>
              <AccountBalanceChart />
            </div>
          </>
        )}
        {activeTab === "income-statement" && (
          <div className="report-section">
            <h3 className="report-section-title">Income Statement (P&L)</h3>
            <IncomeStatement />
          </div>
        )}
        {activeTab === "cash-flow" && (
          <div className="report-section">
            <h3 className="report-section-title">Cash Flow Statement</h3>
            <CashFlowStatement />
          </div>
        )}
        {activeTab === "balance-sheet" && (
          <div className="report-section">
            <h3 className="report-section-title">Balance Sheet</h3>
            <BalanceSheet />
          </div>
        )}
      </div>
    </div>
  );
}

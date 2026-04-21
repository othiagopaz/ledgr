import { useState } from "react";
import IncomeExpenseChart from "./IncomeExpenseChart";
import NetWorthChart from "./NetWorthChart";
import AccountBalanceChart from "./AccountBalanceChart";
import IncomeStatement from "./IncomeStatement";
import BalanceSheet from "./BalanceSheet";
import CashFlowStatement from "./CashFlowStatement";
import PageHeader from "../PageHeader";

type ReportTab = "charts" | "income-statement" | "cash-flow" | "balance-sheet";

const REPORT_TABS = [
  { key: "charts", label: "Charts" },
  { key: "income-statement", label: "Income Statement" },
  { key: "cash-flow", label: "Cash Flow" },
  { key: "balance-sheet", label: "Balance Sheet" },
] as const satisfies readonly { key: ReportTab; label: string }[];

export default function ReportsView() {
  const [activeTab, setActiveTab] = useState<ReportTab>("charts");

  return (
    <div className="reports-view">
      <PageHeader<ReportTab>
        title="Reports"
        tabs={REPORT_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

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

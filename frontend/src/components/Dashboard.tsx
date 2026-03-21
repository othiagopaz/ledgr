import { useQuery } from "@tanstack/react-query";
import { fetchAccounts, fetchTransactions, fetchOptions } from "../api/client";
import { useAppStore } from "../stores/appStore";
import { formatAmount, formatDateShort } from "../utils/format";
import type { AccountNode, Transaction } from "../types";

function sumTopLevelBalance(accounts: AccountNode[], typeName: string): number {
  const node = accounts.find((a) => a.name === typeName);
  if (!node) return 0;
  let total = 0;
  for (const b of node.balance) {
    total += parseFloat(b.number);
  }
  return total;
}

interface SummaryCardProps {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  muted?: boolean;
}

function SummaryCard({ label, value, positive, negative, muted }: SummaryCardProps) {
  let colorClass = "";
  if (positive) colorClass = "positive";
  else if (negative) colorClass = "negative";
  else if (muted) colorClass = "";

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-label">{label}</div>
      <div className={`dashboard-card-value ${colorClass}`}>{value}</div>
    </div>
  );
}

function RecentTransactions({
  transactions,
  currency,
  onSelect,
}: {
  transactions: Transaction[];
  currency: string;
  onSelect: (account: string) => void;
}) {
  // Show last 10 transactions, newest first
  const recent = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  if (recent.length === 0) {
    return <div className="dashboard-empty">No transactions yet</div>;
  }

  return (
    <table className="dashboard-recent-table">
      <thead>
        <tr>
          <th style={{ width: 70 }}>Date</th>
          <th>Description</th>
          <th>Account</th>
          <th className="num" style={{ width: 100 }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {recent.map((txn, i) => {
          const description = [txn.payee, txn.narration].filter(Boolean).join(" — ");
          // Find the "most interesting" posting (not Income/Equity)
          const mainPosting = txn.postings.find(
            (p) => !p.account.startsWith("Income:") && !p.account.startsWith("Equity:")
          ) || txn.postings[0];
          const amount = mainPosting?.amount ? parseFloat(mainPosting.amount) : 0;
          const shortAccount = mainPosting?.account
            ? mainPosting.account.split(":").slice(1).join(":")
            : "";

          return (
            <tr
              key={i}
              className="dashboard-recent-row"
              onClick={() => mainPosting?.account && onSelect(mainPosting.account)}
            >
              <td className="dashboard-recent-date">
                {formatDateShort(txn.date, currency)}
              </td>
              <td>{description || "—"}</td>
              <td className="dashboard-recent-account">{shortAccount}</td>
              <td className={`num amount ${amount >= 0 ? "positive" : "negative"}`}>
                {formatAmount(amount, currency)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface DashboardProps {
  onSelectAccount: (account: string) => void;
}

export default function Dashboard({ onSelectAccount }: DashboardProps) {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const optionsQuery = useQuery({
    queryKey: ["options"],
    queryFn: fetchOptions,
  });

  const txnsQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: () => fetchTransactions(),
  });

  const accounts = accountsQuery.data?.accounts || [];
  const errors = accountsQuery.data?.errors || [];
  const transactions = txnsQuery.data?.transactions || [];
  const title = optionsQuery.data?.title || "Ledgr";

  const assets = sumTopLevelBalance(accounts, "Assets");
  const liabilities = sumTopLevelBalance(accounts, "Liabilities");
  const income = sumTopLevelBalance(accounts, "Income");
  const expenses = sumTopLevelBalance(accounts, "Expenses");
  const netWorth = assets + liabilities;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>{title}</h2>
      </div>

      <div className="dashboard-cards">
        <SummaryCard
          label="Assets"
          value={formatAmount(assets, operatingCurrency)}
          positive={assets > 0}
        />
        <SummaryCard
          label="Liabilities"
          value={formatAmount(liabilities, operatingCurrency)}
          negative={liabilities < 0}
        />
        <SummaryCard
          label="Net Worth"
          value={formatAmount(netWorth, operatingCurrency)}
          positive={netWorth > 0}
          negative={netWorth < 0}
        />
        <SummaryCard
          label="Income"
          value={formatAmount(Math.abs(income), operatingCurrency)}
          positive
        />
        <SummaryCard
          label="Expenses"
          value={formatAmount(expenses, operatingCurrency)}
          negative={expenses > 0}
        />
      </div>

      {/* 3-Statement placeholder */}
      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <h3>Financial Statements</h3>
          <span className="dashboard-coming-soon">Coming soon</span>
        </div>
        <div className="dashboard-placeholder">
          <div className="dashboard-placeholder-item">
            <span>P&L — Monthly income vs expenses breakdown</span>
          </div>
          <div className="dashboard-placeholder-item">
            <span>Cashflow — Net cash movement with off-balance items</span>
          </div>
          <div className="dashboard-placeholder-item">
            <span>Balance Sheet — Assets, liabilities and equity snapshot</span>
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <h3>Recent Transactions</h3>
          <span className="dashboard-count">{transactions.length} total</span>
        </div>
        <RecentTransactions
          transactions={transactions}
          currency={operatingCurrency}
          onSelect={onSelectAccount}
        />
      </div>

      {/* Stats footer */}
      <div className="dashboard-stats">
        <span>{accounts.length} accounts</span>
        <span>·</span>
        <span>{transactions.length} transactions</span>
        {errors.length > 0 && (
          <>
            <span>·</span>
            <span className="negative">{errors.length} error{errors.length !== 1 ? "s" : ""}</span>
          </>
        )}
      </div>
    </div>
  );
}

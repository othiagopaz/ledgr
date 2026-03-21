import type { Transaction } from "../types";
import { useAppStore } from "../stores/appStore";
import { formatAmount } from "../utils/format";

interface StatusBarProps {
  account: string | null;
  transactions: Transaction[];
}

export default function StatusBar({ account, transactions }: StatusBarProps) {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);

  if (!account || transactions.length === 0) {
    return (
      <div className="status-bar">
        <span>Select an account to view stats</span>
        <span className="kbd-hints">⌘K search · N new</span>
      </div>
    );
  }

  let clearedCount = 0;
  let clearedSum = 0;
  let projectedCount = 0;
  let projectedSum = 0;

  for (const txn of transactions) {
    const posting = txn.postings.find((p) => p.account === account);
    const amt = posting?.amount ? parseFloat(posting.amount) : 0;
    if (txn.flag === "!") {
      projectedCount++;
      projectedSum += amt;
    } else {
      clearedCount++;
      clearedSum += amt;
    }
  }

  const totalBalance = clearedSum + projectedSum;

  return (
    <div className="status-bar">
      <div className="status-group">
        <span className="status-item">
          <span className="status-dot dot-confirmed" />
          {clearedCount} cleared: {formatAmount(clearedSum, operatingCurrency)}
        </span>
        <span className="status-item">
          <span className="status-dot dot-pending" />
          {projectedCount} projected:{" "}
          {formatAmount(projectedSum, operatingCurrency)}
        </span>
        <span>|</span>
        <span>
          Balance: {formatAmount(totalBalance, operatingCurrency)}
        </span>
        <span>|</span>
        <span>{transactions.length} txns</span>
      </div>
      <span className="kbd-hints">⌘K search · N new</span>
    </div>
  );
}

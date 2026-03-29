import type { Transaction } from "../types";
import { useAppStore } from "../stores/appStore";
import { formatAmount } from "../utils/format";

interface StatusBarProps {
  account: string | null;
  transactions: Transaction[];
}

export default function StatusBar({ account, transactions }: StatusBarProps) {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const { tabs, activeTabId } = useAppStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const viewType = activeTab?.type || "dashboard";

  const viewMode = useAppStore((s) => s.viewMode);

  // Build context-aware keyboard hints
  const viewLabel = viewMode === 'combined' ? 'Actual + Planned' : 'Actual';
  const hints: string[] = ["⌘K search", `P ${viewLabel}`];

  if (viewType === "register") {
    hints.push("N new", "⌥N modal", "Enter edit", "E advanced", "R reconcile", "Del delete");
  } else if (viewType === "accounts") {
    hints.push("↑↓ navigate", "← → expand", "Enter open");
  } else {
    hints.push("N new", "⌥N modal");
  }

  if (viewType !== "register" || !account || transactions.length === 0) {
    return (
      <div className="status-bar">
        <span></span>
        <span className="kbd-hints">{hints.join(" · ")}</span>
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
      <span className="kbd-hints">{hints.join(" · ")}</span>
    </div>
  );
}

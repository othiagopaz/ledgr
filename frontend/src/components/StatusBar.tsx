import type { Transaction } from "../types";
import { useAppStore } from "../stores/appStore";
import { formatAmount, amountSignClass, getLocale } from "../utils/format";
import { formatUnits } from "../utils/holdings";
import { useCommoditiesUi } from "../stores/commoditiesUiStore";

interface StatusBarProps {
  account: string | null;
  transactions: Transaction[];
  openingBalance?: string;
}

export default function StatusBar({ account, transactions, openingBalance }: StatusBarProps) {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const { tabs, activeTabId } = useAppStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const viewType = activeTab?.type || "dashboard";

  const viewMode = useAppStore((s) => s.viewMode);

  // Build context-aware keyboard hints
  const accountsSubTab = useCommoditiesUi((s) => s.accountsTab);
  const viewLabel = viewMode === 'combined' ? 'Actual + Planned' : 'Actual';
  const hints: string[] = ["⌘K search", `P ${viewLabel}`];

  // Keep these in step with the real key handlers:
  //   register → AccountRegister.handleKeyDown
  //   accounts → AccountTree (keydown effect)
  //   series   → SeriesView.handleKeyDown
  // Enter and E differ on purpose: Enter edits in place, E opens the Composer.
  if (viewType === "register") {
    hints.push(
      "↑↓ navigate", "N new", "⌘I compose",
      "Enter edit", "E modal", "R reconcile", "Del delete",
    );
  } else if (viewType === "accounts" && accountsSubTab === "accounts") {
    hints.push("↑↓ navigate", "← → expand", "Space expand", "Enter open", "E edit account");
  } else if (viewType === "accounts") {
    // Commodities sub-tab: the tree (and its key handlers) is unmounted.
    hints.push("⌘K New Commodity", "⌘K Update Price");
  } else if (viewType === "series") {
    hints.push("↑↓ navigate", "Enter edit", "R reconcile", "Space select");
  } else {
    hints.push("⌘I compose");
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

  // Totals are per currency: an account holding BRL plus 100 PETR4 must not
  // add shares to reais. Sum the operating currency when the account has any
  // OC posting; otherwise (a USD wallet) sum the one other currency and say so.
  const postingsHere = transactions
    .map((txn) => ({ txn, posting: txn.postings.find((p) => p.account === account) }))
    .filter((x) => x.posting && x.posting.amount);
  const currencies = new Set(postingsHere.map((x) => x.posting!.currency ?? operatingCurrency));
  const totalsCurrency = currencies.has(operatingCurrency) || currencies.size === 0
    ? operatingCurrency
    : [...currencies][0];
  const fmt = (n: number) => totalsCurrency === operatingCurrency
    ? formatAmount(n, operatingCurrency)
    : `${formatUnits(String(n), null, getLocale(operatingCurrency))} ${totalsCurrency}`;
  for (const txn of transactions) {
    const posting = txn.postings.find((p) => p.account === account);
    const inTotals = (posting?.currency ?? operatingCurrency) === totalsCurrency;
    const amt = posting?.amount && inTotals ? parseFloat(posting.amount) : 0;
    if (txn.flag === "!") {
      projectedCount++;
      projectedSum += amt;
    } else {
      clearedCount++;
      clearedSum += amt;
    }
  }

  // The opening balance is stated in the operating currency (see the router).
  const opening = openingBalance && totalsCurrency === operatingCurrency ? parseFloat(openingBalance) : 0;
  const totalBalance = opening + clearedSum + projectedSum;

  return (
    <div className="status-bar">
      <div className="status-group">
        <span className="status-item">
          <span className="status-dot dot-confirmed" />
          {clearedCount} cleared:{" "}
          <span className={amountSignClass(clearedSum)}>
            {fmt(clearedSum)}
          </span>
        </span>
        <span className="status-item">
          <span className="status-dot dot-pending" />
          {projectedCount} projected:{" "}
          <span className={amountSignClass(projectedSum)}>
            {fmt(projectedSum)}
          </span>
        </span>
        <span>|</span>
        <span>
          Balance:{" "}
          <span className={amountSignClass(totalBalance)}>
            {fmt(totalBalance)}
          </span>
        </span>
        <span>|</span>
        <span>{transactions.length} txns</span>
      </div>
      <span className="kbd-hints">{hints.join(" · ")}</span>
    </div>
  );
}

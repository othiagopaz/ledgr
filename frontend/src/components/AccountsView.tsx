import { useQuery } from "@tanstack/react-query";
import { fetchAccounts } from "../api/client";
import AccountTree from "./AccountTree";
import { useAppStore } from "../stores/appStore";

interface AccountsViewProps {
  onSelectAccount: (account: string) => void;
}

export default function AccountsView({ onSelectAccount }: AccountsViewProps) {
  const { tabs, activeTabId } = useAppStore();

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const accounts = accountsQuery.data?.accounts || [];

  // Find which register account is active (if any) for highlighting
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const selectedAccount = activeTab?.type === "register" ? activeTab.account || null : null;

  return (
    <div className="accounts-view">
      <div className="accounts-view-header">
        <h2>Accounts</h2>
      </div>
      <div className="accounts-view-tree">
        {accountsQuery.isLoading ? (
          <div className="dashboard-empty">Loading accounts...</div>
        ) : (
          <AccountTree
            accounts={accounts}
            selectedAccount={selectedAccount}
            onSelect={onSelectAccount}
          />
        )}
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { fetchAccounts } from "../api/client";
import AccountTree from "./AccountTree";
import PageHeader from "./PageHeader";
import { useAppStore } from "../stores/appStore";
import { useFilterParams } from "../hooks/useFilterParams";
import type { AccountNode } from "../types";

interface AccountsViewProps {
  onSelectAccount: (account: string) => void;
}

export default function AccountsView({ onSelectAccount }: AccountsViewProps) {
  const { tabs, activeTabId } = useAppStore();
  const viewMode = useAppStore((s) => s.viewMode);
  const openAcctModal = useAppStore((s) => s.openAcctModal);

  // Respect the global filters like every other view. Without them this view
  // loaded the whole ledger *and* cache-missed against the shared ["accounts",
  // viewMode, filters] key that App/Dashboard already populate — two full
  // fetches of the same data on a large ledger.
  const filters = useFilterParams();

  const accountsQuery = useQuery({
    queryKey: ["accounts", viewMode, filters],
    queryFn: () => fetchAccounts(viewMode, filters),
  });

  const accounts = accountsQuery.data?.accounts || [];

  // Highlight the account currently open in a register tab
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const selectedAccount =
    activeTab?.type === "register" ? activeTab.account || null : null;

  function handleEdit(node: AccountNode) {
    openAcctModal(node);
  }

  return (
    <div className="accounts-view">
      <PageHeader
        title="Accounts"
        action={
          <button
            className="btn btn-primary"
            onClick={() => openAcctModal()}
            title="New account (A)"
          >
            + New Account
          </button>
        }
      />
      <div className="accounts-view-tree">
        {accountsQuery.isLoading ? (
          <div className="dashboard-empty">Loading accounts…</div>
        ) : (
          <AccountTree
            accounts={accounts}
            selectedAccount={selectedAccount}
            onSelect={onSelectAccount}
            onEdit={handleEdit}
          />
        )}
      </div>
    </div>
  );
}

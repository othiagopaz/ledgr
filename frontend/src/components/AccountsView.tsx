import { useQuery } from "@tanstack/react-query";
import { fetchAccounts } from "../api/client";
import AccountTree from "./AccountTree";
import PageHeader from "./PageHeader";
import CommoditiesView from "./commodities/CommoditiesView";
import { useAppStore } from "../stores/appStore";
import { useCommoditiesUi, type AccountsSubTab } from "../stores/commoditiesUiStore";
import { useFilterParams } from "../hooks/useFilterParams";
import type { AccountNode } from "../types";

const ACCOUNTS_TABS = [
  { key: "accounts", label: "Accounts" },
  { key: "commodities", label: "Commodities" },
] as const satisfies readonly { key: AccountsSubTab; label: string }[];

interface AccountsViewProps {
  onSelectAccount: (account: string) => void;
}

export default function AccountsView({ onSelectAccount }: AccountsViewProps) {
  const { tabs, activeTabId } = useAppStore();
  const viewMode = useAppStore((s) => s.viewMode);
  const openAcctModal = useAppStore((s) => s.openAcctModal);
  const showClosed = useAppStore((s) => s.showClosedAccounts);
  const toggleShowClosed = useAppStore((s) => s.toggleShowClosedAccounts);

  // Accounts | Commodities (PLAN-commodities-ux §3.3). The Accounts tab is the
  // pre-existing view, untouched; Commodities is the catalog + prices surface.
  // The sub-tab is store state so Cmd+K (View Commodities, New Commodity,
  // Update Price) can land on it directly.
  const subTab = useCommoditiesUi((s) => s.accountsTab);
  const setSubTab = useCommoditiesUi((s) => s.setAccountsTab);
  const openPriceModal = useCommoditiesUi((s) => s.openPriceModal);
  const openCommodityModal = useCommoditiesUi((s) => s.openCommodityModal);

  // Respect the global filters like every other view. Without them this view
  // loaded the whole ledger *and* cache-missed against the shared ["accounts",
  // viewMode, filters] key that App/Dashboard already populate — two full
  // fetches of the same data on a large ledger.
  const filters = useFilterParams();

  // `showClosed` belongs in the key: it changes what the server returns, and
  // leaving it out would serve the pruned tree from cache after the toggle.
  const accountsQuery = useQuery({
    queryKey: ["accounts", viewMode, filters, showClosed],
    queryFn: () => fetchAccounts(viewMode, filters, showClosed),
  });

  const accounts = accountsQuery.data?.accounts || [];
  const closedCount = accountsQuery.data?.closed_count ?? 0;

  // Highlight the account currently open in a register tab
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const selectedAccount =
    activeTab?.type === "register" ? activeTab.account || null : null;

  function handleEdit(node: AccountNode) {
    openAcctModal(node);
  }

  const accountsActions = (
    <div className="accounts-view-actions">
      {closedCount > 0 && (
        <button
          className="btn"
          onClick={toggleShowClosed}
          title="Toggle inactive accounts"
        >
          {showClosed ? "Hide" : "Show"} inactive ({closedCount})
        </button>
      )}
      <button
        className="btn btn-primary"
        onClick={() => openAcctModal()}
        title="New account (A)"
      >
        + New Account
      </button>
    </div>
  );

  const commoditiesActions = (
    <div className="accounts-view-actions">
      <button
        className="btn"
        onClick={() => openPriceModal()}
        title="Record a price for a commodity (Cmd+K → Update Price)"
      >
        Update price
      </button>
      <button
        className="btn btn-primary"
        onClick={() => openCommodityModal()}
        title="Declare a commodity (Cmd+K → New Commodity)"
      >
        + New commodity
      </button>
    </div>
  );

  return (
    <div className="accounts-view">
      <PageHeader<AccountsSubTab>
        title="Accounts"
        tabs={ACCOUNTS_TABS}
        activeTab={subTab}
        onTabChange={setSubTab}
        action={subTab === "accounts" ? accountsActions : commoditiesActions}
      />
      {subTab === "accounts" ? (
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
      ) : (
        <CommoditiesView />
      )}
    </div>
  );
}

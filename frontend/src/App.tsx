import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAccounts, fetchTransactions, fetchOptions } from "./api/client";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import AccountsView from "./components/AccountsView";
import AccountRegister from "./components/AccountRegister";
import AllTransactionsView from "./components/AllTransactionsView";
import ReportsView from "./components/reports/ReportsView";
import TransactionModal from "./components/TransactionModal";
import PlannedToggle from "./components/PlannedToggle";
import TabBar from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import CommandPalette from "./components/CommandPalette";
import { useAppStore } from "./stores/appStore";
import { useKeyboardNav } from "./hooks/useKeyboardNav";

export default function App() {
  const queryClient = useQueryClient();
  const theme = useAppStore((s) => s.theme);
  const { tabs, activeTabId, openTab } = useAppStore();
  const setOperatingCurrency = useAppStore((s) => s.setOperatingCurrency);
  const setLocale = useAppStore((s) => s.setLocale);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const txnModalOpen = useAppStore((s) => s.txnModalOpen);
  const viewMode = useAppStore((s) => s.viewMode);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const selectedAccount = activeTab?.type === "register" ? activeTab.account : null;

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Currency & Locale
  useEffect(() => {
    fetchOptions().then((opts) => {
      if (opts.operating_currency.length > 0) {
        setOperatingCurrency(opts.operating_currency[0]);
      }
      if (opts.locale) {
        setLocale(opts.locale);
      }
    });
  }, [setOperatingCurrency, setLocale]);

  // Keyboard nav
  useKeyboardNav();

  // Cmd+W to close tab
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        const { activeTabId, closeTab } = useAppStore.getState();
        if (activeTabId) closeTab(activeTabId);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const accountsQuery = useQuery({
    queryKey: ["accounts", viewMode],
    queryFn: () => fetchAccounts(viewMode),
  });

  const txnsQuery = useQuery({
    queryKey: ["transactions", selectedAccount, viewMode],
    queryFn: () => fetchTransactions(selectedAccount || undefined, undefined, undefined, viewMode),
    enabled: !!selectedAccount,
  });

  function handleMutated() {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  function handleSelectAccount(accountName: string) {
    const shortName =
      accountName.split(":").length > 2
        ? accountName.split(":").slice(1).join(":")
        : accountName;
    openTab({
      id: `register:${accountName}`,
      type: "register",
      account: accountName,
      label: shortName,
    });
  }

  const errors = accountsQuery.data?.errors || [];

  function handleOpenReports() {
    openTab({ id: "reports", type: "report", label: "Reports" });
  }

  // Determine what to render in main content
  function renderMainContent() {
    if (!activeTab) {
      return <Dashboard onSelectAccount={handleSelectAccount} onOpenReports={handleOpenReports} />;
    }

    switch (activeTab.type) {
      case "dashboard":
        return <Dashboard onSelectAccount={handleSelectAccount} onOpenReports={handleOpenReports} />;

      case "accounts":
        return <AccountsView onSelectAccount={handleSelectAccount} />;

      case "register":
        if (selectedAccount && txnsQuery.data) {
          return (
            <AccountRegister
              account={selectedAccount}
              transactions={txnsQuery.data.transactions}
              onMutated={handleMutated}
            />
          );
        }
        return <div className="welcome">Loading transactions...</div>;

      case "report":
        return <ReportsView />;

      default:
        return <AllTransactionsView onMutated={handleMutated} />;
    }
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>Ledgr</h1>
        <PlannedToggle />
      </div>

      {errors.length > 0 && (
        <div className="error-banner">
          <strong>
            {errors.length} parsing error{errors.length > 1 ? "s" : ""}:
          </strong>{" "}
          {errors.slice(0, 3).join(" | ")}
          {errors.length > 3 && ` ... and ${errors.length - 3} more`}
        </div>
      )}

      <div className="app-body">
        <Sidebar errorCount={errors.length} />

        <div className="main-content">
          <TabBar />
          <div className="register-content">
            {renderMainContent()}
          </div>
        </div>
      </div>

      <StatusBar
        account={selectedAccount || null}
        transactions={txnsQuery.data?.transactions || []}
      />

      {commandPaletteOpen && <CommandPalette />}
      {txnModalOpen && <TransactionModal onMutated={handleMutated} />}
    </div>
  );
}

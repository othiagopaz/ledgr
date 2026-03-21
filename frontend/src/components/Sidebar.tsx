import { useAppStore } from "../stores/appStore";

interface SidebarProps {
  errorCount: number;
}

export default function Sidebar({ errorCount }: SidebarProps) {
  const { tabs, activeTabId, openTab } = useAppStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeType = activeTab?.type || null;

  // Collect recently opened account tabs (most recent first, deduped)
  const recentAccounts = tabs
    .filter((t) => t.type === "register" && t.account)
    .slice(-5)
    .reverse();

  function openDashboard() {
    openTab({ id: "dashboard", type: "dashboard", label: "Dashboard" });
  }

  function openAccounts() {
    openTab({ id: "accounts", type: "accounts", label: "Accounts" });
  }

  return (
    <div className="sidebar">
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item${activeType === "dashboard" || (!activeTabId) ? " active" : ""}`}
          onClick={openDashboard}
        >
          Dashboard
        </button>

        <button
          className={`sidebar-nav-item${activeType === "accounts" ? " active" : ""}`}
          onClick={openAccounts}
        >
          Accounts
        </button>

        {errorCount > 0 && (
          <button className="sidebar-nav-item sidebar-nav-errors">
            Errors
            <span className="sidebar-badge">{errorCount}</span>
          </button>
        )}
      </nav>

      {recentAccounts.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-header">Recent</div>
          {recentAccounts.map((tab) => (
            <button
              key={tab.id}
              className={`sidebar-recent-item${tab.id === activeTabId ? " active" : ""}`}
              onClick={() => useAppStore.getState().setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-footer">
        <button
          className="sidebar-nav-item sidebar-nav-subtle"
          onClick={() => useAppStore.getState().setCommandPaletteOpen(true)}
        >
          Command Palette
          <span className="sidebar-kbd">⌘K</span>
        </button>
      </div>
    </div>
  );
}

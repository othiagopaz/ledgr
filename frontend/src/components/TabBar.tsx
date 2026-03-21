import { useState } from "react";
import { useAppStore } from "../stores/appStore";

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, setCommandPaletteOpen } =
    useAppStore();
  const [overflowOpen, setOverflowOpen] = useState(false);

  const MAX_VISIBLE = 8;
  const visibleTabs = tabs.slice(0, MAX_VISIBLE);
  const overflowTabs = tabs.slice(MAX_VISIBLE);

  return (
    <div className="tab-bar">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-item${tab.id === activeTabId ? " active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span>{tab.label}</span>
          <span
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            &times;
          </span>
        </button>
      ))}

      {overflowTabs.length > 0 && (
        <div className="tab-overflow">
          <button
            className="tab-item"
            onClick={() => setOverflowOpen(!overflowOpen)}
          >
            ...
          </button>
          {overflowOpen && (
            <div className="tab-overflow-menu">
              {overflowTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab-item${tab.id === activeTabId ? " active" : ""}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setOverflowOpen(false);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        className="tab-add"
        onClick={() => setCommandPaletteOpen(true)}
        title="Open command palette (⌘K)"
      >
        +
      </button>
    </div>
  );
}

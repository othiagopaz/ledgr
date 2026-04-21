import type { ReactNode } from "react";

export interface PageTab<K extends string = string> {
  key: K;
  label: string;
}

interface PageHeaderProps<K extends string = string> {
  title: string;
  action?: ReactNode;
  tabs?: readonly PageTab<K>[];
  activeTab?: K;
  onTabChange?: (key: K) => void;
}

/**
 * Shared page header for main-pane views (Accounts, Reports, Series,
 * and future surfaces). Renders the page title on the left with an
 * optional action slot on the right, and an optional tab row underneath
 * with Midnight-accent underline on the active tab.
 */
export default function PageHeader<K extends string = string>({
  title,
  action,
  tabs,
  activeTab,
  onTabChange,
}: PageHeaderProps<K>) {
  return (
    <div className="page-header">
      <div className="page-header-row">
        <h2 className="page-header-title">{title}</h2>
        {action && <div className="page-header-action">{action}</div>}
      </div>
      {tabs && tabs.length > 0 && (
        <div className="page-header-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              className={`page-header-tab${activeTab === t.key ? " active" : ""}`}
              onClick={() => onTabChange?.(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import type { AccountNode, Balance } from "../types";

interface Props {
  accounts: AccountNode[];
  selectedAccount: string | null;
  onSelect: (account: string) => void;
}

function isZeroBalance(balances: Balance[]): boolean {
  return balances.every((b) => parseFloat(b.number) === 0);
}

function BalanceDisplay({ balances }: { balances: Balance[] }) {
  if (balances.length === 0) return <span className="balance amount">—</span>;

  // Group by currency, summing positions (for cost-basis positions of same commodity)
  const byCurrency = new Map<string, number>();
  for (const b of balances) {
    byCurrency.set(b.currency, (byCurrency.get(b.currency) || 0) + parseFloat(b.number));
  }

  const entries = Array.from(byCurrency.entries());

  // Single currency — show inline
  if (entries.length === 1) {
    const [currency, number] = entries[0];
    const formatted = number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (
      <span className="balance amount">
        {currency === "USD" ? formatted : `${formatted} ${currency}`}
      </span>
    );
  }

  // Multiple currencies — stack vertically
  return (
    <span className="balance amount multi-balance">
      {entries.map(([currency, number]) => {
        const formatted = number.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <span key={currency} className="balance-line">
            {currency === "USD" ? formatted : `${formatted} ${currency}`}
          </span>
        );
      })}
    </span>
  );
}

function AccountGroup({
  node,
  selectedAccount,
  onSelect,
  depth,
}: {
  node: AccountNode;
  selectedAccount: string | null;
  onSelect: (account: string) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(depth > 1);
  const zero = isZeroBalance(node.balance);

  if (depth === 0) {
    // Top-level group
    return (
      <div className="account-group">
        <div
          className="account-group-header"
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className="toggle">{collapsed ? "▸" : "▾"}</span>
          <span>{node.name}</span>
          <BalanceDisplay balances={node.balance} />
        </div>
        {!collapsed &&
          node.children.map((child) => (
            <AccountGroup
              key={child.name}
              node={child}
              selectedAccount={selectedAccount}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  if (node.is_leaf) {
    const shortName = node.name.split(":").pop() || node.name;
    return (
      <div
        className={`account-item${selectedAccount === node.name ? " selected" : ""}${zero ? " zero" : ""}`}
        onClick={() => onSelect(node.name)}
      >
        <span className="indent" style={{ width: (depth - 1) * 12 }} />
        <span className="name">{shortName}</span>
        <BalanceDisplay balances={node.balance} />
      </div>
    );
  }

  // Intermediate node with children
  const shortName = node.name.split(":").pop() || node.name;
  return (
    <>
      <div
        className={`account-item${selectedAccount === node.name ? " selected" : ""}${zero ? " zero" : ""}`}
        onClick={() => {
          setCollapsed(!collapsed);
          onSelect(node.name);
        }}
      >
        <span className="indent" style={{ width: (depth - 1) * 12 }} />
        <span style={{ width: 12, fontSize: 10, color: "#999" }}>
          {collapsed ? "▸" : "▾"}
        </span>
        <span className="name">{shortName}</span>
        <BalanceDisplay balances={node.balance} />
      </div>
      {!collapsed &&
        node.children.map((child) => (
          <AccountGroup
            key={child.name}
            node={child}
            selectedAccount={selectedAccount}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </>
  );
}

export default function AccountTree({ accounts, selectedAccount, onSelect }: Props) {
  return (
    <div>
      {accounts.map((acct) => (
        <AccountGroup
          key={acct.name}
          node={acct}
          selectedAccount={selectedAccount}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  );
}

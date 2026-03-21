import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAccounts, fetchTransactions } from "./api/client";
import AccountTree from "./components/AccountTree";
import AccountRegister from "./components/AccountRegister";
import TransactionForm from "./components/TransactionForm";
export default function App() {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  });

  const txnsQuery = useQuery({
    queryKey: ["transactions", selectedAccount],
    queryFn: () => fetchTransactions(selectedAccount || undefined),
    enabled: !!selectedAccount,
  });

  function handleSuccess() {
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  const accounts = accountsQuery.data?.accounts || [];
  const assets = accounts.find((a) => a.name === "Assets");
  const liabilities = accounts.find((a) => a.name === "Liabilities");

  let netAssets = "—";
  if (assets && liabilities) {
    const a = parseFloat(assets.balance.find((b) => b.currency === "USD")?.number || "0");
    const l = parseFloat(liabilities.balance.find((b) => b.currency === "USD")?.number || "0");
    netAssets = (a + l).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  const income = accounts.find((a) => a.name === "Income");
  const expenses = accounts.find((a) => a.name === "Expenses");
  let profit = "—";
  if (income && expenses) {
    const i = parseFloat(income.balance.find((b) => b.currency === "USD")?.number || "0");
    const e = parseFloat(expenses.balance.find((b) => b.currency === "USD")?.number || "0");
    profit = (-(i + e)).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>Ledgr</h1>
        <button className="header-btn" onClick={() => setShowForm(true)}>
          + Transaction
        </button>
      </div>

      <div className="app-body">
        <div className="sidebar">
          {accountsQuery.data && (
            <AccountTree
              accounts={accounts}
              selectedAccount={selectedAccount}
              onSelect={setSelectedAccount}
            />
          )}
        </div>

        <div className="main-content">
          {selectedAccount && txnsQuery.data ? (
            <AccountRegister
              account={selectedAccount}
              transactions={txnsQuery.data.transactions}
            />
          ) : (
            <div className="welcome">
              Select an account to view transactions
            </div>
          )}
        </div>
      </div>

      <div className="app-footer">
        <span>Net Assets: {netAssets}</span>
        <span>Profit: {profit}</span>
      </div>

      {showForm && (
        <TransactionForm
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}

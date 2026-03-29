import type {
  AccountsResponse,
  TransactionsResponse,
  MutationResponse,
  TransactionInput,
  EditTransactionInput,
  ErrorsResponse,
  OptionsResponse,
  ViewMode,
  AccountInput,
  AccountUpdateInput,
  CloseAccountInput,
  AccountTypesResponse,
  AccountWarningsResponse,
} from "../types";

const BASE = "";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(BASE + url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchAccounts(viewMode: ViewMode = "combined"): Promise<AccountsResponse> {
  const params = new URLSearchParams();
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  const qs = params.toString();
  return get(`/api/accounts${qs ? "?" + qs : ""}`);
}

export async function fetchTransactions(
  account?: string,
  fromDate?: string,
  toDate?: string,
  viewMode: ViewMode = "combined"
): Promise<TransactionsResponse> {
  const params = new URLSearchParams();
  if (account) params.set("account", account);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  const qs = params.toString();
  return get(`/api/transactions${qs ? "?" + qs : ""}`);
}

export async function addTransaction(
  input: TransactionInput
): Promise<MutationResponse> {
  const res = await fetch(BASE + "/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function editTransaction(
  input: EditTransactionInput
): Promise<MutationResponse> {
  const res = await fetch(BASE + "/api/transactions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function deleteTransaction(
  lineno: number
): Promise<MutationResponse> {
  const res = await fetch(BASE + `/api/transactions/${lineno}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchAccountNames(): Promise<{ accounts: string[] }> {
  return get("/api/account-names");
}

// Account CRUD

export interface AccountMutationResponse {
  success: boolean;
  account?: {
    name: string;
    ledgr_type: string;
    open_date: string;
    currencies: string[];
    metadata: Record<string, string>;
  };
  errors?: string[];
}

export async function fetchAccountTypes(): Promise<AccountTypesResponse> {
  return get("/api/account-types");
}

export async function fetchAccountWarnings(): Promise<AccountWarningsResponse> {
  return get("/api/accounts/warnings");
}

async function mutateAccount(
  url: string,
  method: "POST" | "PUT",
  body: unknown
): Promise<AccountMutationResponse> {
  const res = await fetch(BASE + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function createAccount(
  input: AccountInput
): Promise<AccountMutationResponse> {
  return mutateAccount("/api/accounts", "POST", input);
}

export async function updateAccount(
  input: AccountUpdateInput
): Promise<AccountMutationResponse> {
  return mutateAccount("/api/accounts", "PUT", input);
}

export async function closeAccount(
  input: CloseAccountInput
): Promise<{ success: boolean; account: string; close_date: string }> {
  const res = await fetch(BASE + "/api/accounts/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPayees(): Promise<{ payees: string[] }> {
  return get("/api/payees");
}

export async function fetchErrors(): Promise<ErrorsResponse> {
  return get("/api/errors");
}

export async function fetchOptions(): Promise<OptionsResponse> {
  return get("/api/options");
}

export interface Suggestion {
  payee: string;
  account: string | null;
  amount: string | null;
  currency: string | null;
}

export async function fetchSuggestions(payee: string): Promise<Suggestion> {
  return get(`/api/suggestions?payee=${encodeURIComponent(payee)}`);
}

// Reports

import type {
  IncomeStatementResponse,
  BalanceSheetResponse,
  CashFlowResponse,
  IncomeExpenseResponse,
  NetWorthResponse,
  AccountBalanceResponse,
} from "../types";

export async function fetchIncomeExpenseSeries(
  interval = "monthly",
  viewMode: ViewMode = "combined"
): Promise<IncomeExpenseResponse> {
  const params = new URLSearchParams({ interval });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  return get(`/api/reports/income-expense?${params}`);
}

export async function fetchAccountBalanceSeries(
  account: string,
  interval = "monthly",
  viewMode: ViewMode = "combined"
): Promise<AccountBalanceResponse> {
  const params = new URLSearchParams({ account, interval });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  return get(`/api/reports/account-balance?${params}`);
}

export async function fetchNetWorthSeries(
  interval = "monthly",
  viewMode: ViewMode = "combined"
): Promise<NetWorthResponse> {
  const params = new URLSearchParams({ interval });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  return get(`/api/reports/net-worth?${params}`);
}

export async function fetchIncomeStatement(
  fromDate?: string,
  toDate?: string,
  interval = "monthly",
  viewMode: ViewMode = "combined"
): Promise<IncomeStatementResponse> {
  const params = new URLSearchParams({ interval });
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  return get(`/api/reports/income-statement?${params}`);
}

export async function fetchBalanceSheet(
  asOfDate?: string,
  viewMode: ViewMode = "combined"
): Promise<BalanceSheetResponse> {
  const params = new URLSearchParams();
  if (asOfDate) params.set("as_of_date", asOfDate);
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  const qs = params.toString();
  return get(`/api/reports/balance-sheet${qs ? "?" + qs : ""}`);
}

export async function fetchCashFlow(
  fromDate?: string,
  toDate?: string,
  interval = "monthly",
  viewMode: ViewMode = "combined"
): Promise<CashFlowResponse> {
  const params = new URLSearchParams({ interval });
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  return get(`/api/reports/cashflow?${params}`);
}

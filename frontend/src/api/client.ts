import type {
  AccountsResponse,
  Transaction,
  TransactionsResponse,
  MutationResponse,
  TransactionInput,
  EditTransactionInput,
  ErrorsResponse,
  OptionsResponse,
  ViewMode,
  GlobalFilters,
  AccountInput,
  AccountUpdateInput,
  CloseAccountInput,
  CloseAccountResponse,
  ReopenAccountResponse,
  RenameAccountInput,
  RenameAccountResponse,
  AccountTypesResponse,
  AccountWarningsResponse,
  SeriesListResponse,
  SeriesCreateIn,
  SeriesCreateResponse,
  SeriesExtendIn,
  SeriesExtendResponse,
  SeriesReviseIn,
  SeriesReviseResponse,
  SeriesCancelResponse,
  BudgetResponse,
} from "../types";

const BASE = "";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(BASE + url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** POST with JSON body, surfacing FastAPI's `detail` as the error message. */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

function appendFilters(params: URLSearchParams, f?: GlobalFilters): void {
  if (!f) return;
  if (f.account) params.set("account", f.account);
  if (f.from_date) params.set("from_date", f.from_date);
  if (f.to_date) params.set("to_date", f.to_date);
  if (f.tags?.length) {
    for (const tag of f.tags) params.append("tags", tag);
  }
  if (f.payee) params.set("payee", f.payee);
}

export async function fetchAccounts(
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
  includeClosed = false,
): Promise<AccountsResponse> {
  const params = new URLSearchParams();
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
  if (includeClosed) params.set("include_closed", "true");
  const qs = params.toString();
  return get(`/api/accounts${qs ? "?" + qs : ""}`);
}

export async function fetchTransactions(
  account?: string,
  fromDate?: string,
  toDate?: string,
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
): Promise<TransactionsResponse> {
  const params = new URLSearchParams();
  // Legacy positional params — prefer GlobalFilters
  if (account) params.set("account", account);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
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
  lineno: number,
  filename?: string | null,
): Promise<MutationResponse> {
  // `filename` disambiguates `lineno`, which repeats across included files.
  const qs = filename ? `?filename=${encodeURIComponent(filename)}` : "";
  const res = await fetch(BASE + `/api/transactions/${lineno}${qs}`, {
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
): Promise<CloseAccountResponse> {
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

export async function reopenAccount(
  name: string,
): Promise<ReopenAccountResponse> {
  return post("/api/accounts/reopen", { name });
}

/**
 * Rename an account and every posting that references it.
 *
 * Pass `dry_run` to get the impact (how many occurrences, in which files)
 * without writing anything — the UI always previews before committing, because
 * a rename reaches across the main ledger and every included file.
 */
export async function renameAccount(
  input: RenameAccountInput,
): Promise<RenameAccountResponse> {
  return post("/api/accounts/rename", input);
}

export async function fetchPayees(): Promise<{ payees: string[] }> {
  return get("/api/payees");
}

export async function fetchTags(): Promise<{ tags: string[] }> {
  return get("/api/tags");
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
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
): Promise<IncomeExpenseResponse> {
  const params = new URLSearchParams({ interval });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
  return get(`/api/reports/income-expense?${params}`);
}

export async function fetchAccountBalanceSeries(
  account: string,
  interval = "monthly",
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
): Promise<AccountBalanceResponse> {
  const params = new URLSearchParams({ account, interval });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
  return get(`/api/reports/account-balance?${params}`);
}

export async function fetchNetWorthSeries(
  interval = "monthly",
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
): Promise<NetWorthResponse> {
  const params = new URLSearchParams({ interval });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
  return get(`/api/reports/net-worth?${params}`);
}

export async function fetchIncomeStatement(
  interval = "monthly",
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
): Promise<IncomeStatementResponse> {
  const params = new URLSearchParams({ interval });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
  return get(`/api/reports/income-statement?${params}`);
}

export async function fetchBalanceSheet(
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
): Promise<BalanceSheetResponse> {
  const params = new URLSearchParams();
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
  const qs = params.toString();
  return get(`/api/reports/balance-sheet${qs ? "?" + qs : ""}`);
}

export async function fetchCashFlow(
  interval = "monthly",
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
): Promise<CashFlowResponse> {
  const params = new URLSearchParams({ interval });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
  return get(`/api/reports/cashflow?${params}`);
}

// Series

export async function fetchSeries(
  viewMode: ViewMode = "combined",
  filters?: GlobalFilters,
): Promise<SeriesListResponse> {
  const params = new URLSearchParams();
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  appendFilters(params, filters);
  const qs = params.toString();
  return get(`/api/series${qs ? "?" + qs : ""}`);
}

/** Every occurrence of a series, oldest first.
 *
 * Queries by series id rather than by account: membership is metadata, so this
 * still returns occurrences whose legs point at a different account (e.g. the
 * already-confirmed ones after a revise re-pointed the pending run).
 */
export async function fetchSeriesTransactions(
  seriesId: string,
): Promise<{ transactions: Transaction[]; count: number }> {
  return get(`/api/series/${encodeURIComponent(seriesId)}/transactions`);
}

export async function createSeries(
  input: SeriesCreateIn
): Promise<SeriesCreateResponse> {
  const res = await fetch("/api/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function extendSeries(
  seriesId: string,
  input: SeriesExtendIn
): Promise<SeriesExtendResponse> {
  const res = await fetch(`/api/series/${encodeURIComponent(seriesId)}/extend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function reviseSeries(
  seriesId: string,
  input: SeriesReviseIn
): Promise<SeriesReviseResponse> {
  const res = await fetch(`/api/series/${encodeURIComponent(seriesId)}/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // Surface the FastAPI validation detail (e.g. count below confirmed).
    let detail = `${res.status} ${res.statusText}`;
    try { detail = (await res.json()).detail || detail; } catch { /* keep default */ }
    throw new Error(detail);
  }
  return res.json();
}

export async function cancelSeries(
  seriesId: string
): Promise<SeriesCancelResponse> {
  const res = await fetch(`/api/series/${encodeURIComponent(seriesId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Budget — owns its own month stepper; not coupled to global filters.

export async function fetchBudget(
  month: string,
  viewMode: ViewMode = "combined",
): Promise<BudgetResponse> {
  const params = new URLSearchParams({ month });
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  return get(`/api/budget?${params}`);
}

export async function setBudgetAllocation(
  month: string,
  account: string,
  amount: string | null,
  viewMode: ViewMode = "combined",
): Promise<BudgetResponse> {
  const params = new URLSearchParams();
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  const qs = params.toString();
  const res = await fetch(`/api/budget${qs ? "?" + qs : ""}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, account, amount }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function copyBudgetMonth(
  fromMonth: string,
  toMonth: string,
  viewMode: ViewMode = "combined",
): Promise<BudgetResponse> {
  const params = new URLSearchParams();
  if (viewMode !== "combined") params.set("view_mode", viewMode);
  const qs = params.toString();
  const res = await fetch(`/api/budget/copy${qs ? "?" + qs : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from_month: fromMonth, to_month: toMonth }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

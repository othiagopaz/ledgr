import type {
  AccountsResponse,
  TransactionsResponse,
  MutationResponse,
  TransactionInput,
  EditTransactionInput,
  ErrorsResponse,
  OptionsResponse,
} from "../types";

const BASE = "";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(BASE + url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchAccounts(): Promise<AccountsResponse> {
  return get("/api/accounts");
}

export async function fetchTransactions(
  account?: string,
  fromDate?: string,
  toDate?: string
): Promise<TransactionsResponse> {
  const params = new URLSearchParams();
  if (account) params.set("account", account);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
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

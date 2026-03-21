export interface Balance {
  number: string;
  currency: string;
  cost?: string | null;
  cost_currency?: string;
  cost_date?: string | null;
}

export interface AccountNode {
  name: string;
  type: string;
  balance: Balance[];
  children: AccountNode[];
  is_leaf: boolean;
}

export interface Posting {
  account: string;
  amount: string | null;
  currency: string | null;
  cost?: string | null;
  cost_currency?: string;
  cost_date?: string | null;
  price?: string | null;
  price_currency?: string;
}

export interface Transaction {
  date: string;
  flag: string;
  payee: string;
  narration: string;
  tags: string[];
  links: string[];
  lineno: number | null;
  postings: Posting[];
}

export interface AccountsResponse {
  accounts: AccountNode[];
  errors: string[];
}

export interface TransactionsResponse {
  transactions: Transaction[];
  count: number;
}

export interface PostingInput {
  account: string;
  amount?: number | null;
  currency?: string | null;
  cost?: number | null;
  cost_currency?: string | null;
  price?: number | null;
  price_currency?: string | null;
}

export interface TransactionInput {
  date: string;
  flag: string;
  payee: string;
  narration: string;
  postings: PostingInput[];
}

export interface EditTransactionInput extends TransactionInput {
  lineno: number;
}

export interface MutationResponse {
  success: boolean;
  transaction?: Transaction;
  errors?: string[];
}

export interface LedgerError {
  message: string;
  source: string | null;
  entry: string | null;
}

export interface ErrorsResponse {
  errors: LedgerError[];
  count: number;
}

export interface OptionsResponse {
  operating_currency: string[];
  title: string;
  filename: string;
  locale: string | null;
}

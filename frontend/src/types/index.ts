export interface Balance {
  number: string;
  currency: string;
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
}

export interface Transaction {
  date: string;
  flag: string;
  payee: string;
  narration: string;
  tags: string[];
  links: string[];
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
}

export interface TransactionInput {
  date: string;
  flag: string;
  payee: string;
  narration: string;
  postings: PostingInput[];
}

export interface MutationResponse {
  success: boolean;
  transaction?: Transaction;
  errors?: string[];
}

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
  tags?: string[];
  links?: string[];
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

// Report types

export interface IncomeExpensePoint {
  period: string;
  income: number;
  expenses: number;
}

export interface AccountBalancePoint {
  period: string;
  balance: number;
}

export interface NetWorthPoint {
  period: string;
  assets: number;
  liabilities: number;
  net_worth: number;
}

export interface OtherCurrencyAmount {
  amount: string;
  currency: string;
}

export interface AccountReportNode {
  name: string;
  totals: Record<string, number>;
  total: number;
  other_totals?: Record<string, OtherCurrencyAmount[]>;
  other_total?: OtherCurrencyAmount[];
  children: AccountReportNode[];
}

export interface BalanceSheetNode {
  name: string;
  balance: number;
  other_balance?: OtherCurrencyAmount[];
  children: BalanceSheetNode[];
}

export interface IncomeStatementResponse {
  income: AccountReportNode[];
  expenses: AccountReportNode[];
  periods: string[];
  net_income: Record<string, number>;
  operating_currency: string;
  other_net_income?: OtherCurrencyAmount[];
}

export interface BalanceSheetResponse {
  assets: BalanceSheetNode[];
  liabilities: BalanceSheetNode[];
  equity: BalanceSheetNode[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  operating_currency: string;
  other_totals?: {
    assets: OtherCurrencyAmount[];
    liabilities: OtherCurrencyAmount[];
    equity: OtherCurrencyAmount[];
  };
}

export interface CashFlowItem {
  name: string;
  full_name: string;
  totals: Record<string, number>;
  total: number;
}

export interface CashFlowSection {
  totals: Record<string, number>;
  total: number;
  items: CashFlowItem[];
}

export interface CashFlowResponse {
  periods: string[];
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  transfers: CashFlowSection;
  net_cashflow: Record<string, number>;
  opening_balance: Record<string, number>;
  closing_balance: Record<string, number>;
}

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
  ledgr_type: string | null;
  open_date: string | null;
  currencies: string[];
  metadata: Record<string, string>;
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
  metadata: Record<string, string | number>;
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

// View mode
export type ViewMode = 'actual' | 'combined';

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

export interface IncomeExpenseResponse {
  series: IncomeExpensePoint[];
  planned_series?: IncomeExpensePoint[];
}

export interface NetWorthResponse {
  series: NetWorthPoint[];
  planned_series?: NetWorthPoint[];
}

export interface AccountBalanceResponse {
  series: AccountBalancePoint[];
  planned_series?: AccountBalancePoint[];
}

export interface IncomeStatementResponse {
  income: AccountReportNode[];
  expenses: AccountReportNode[];
  periods: string[];
  net_income: Record<string, number>;
  operating_currency: string;
  other_net_income?: OtherCurrencyAmount[];
  planned_income?: AccountReportNode[];
  planned_expenses?: AccountReportNode[];
  planned_net_income?: Record<string, number>;
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
  planned_assets?: BalanceSheetNode[];
  planned_liabilities?: BalanceSheetNode[];
  planned_equity?: BalanceSheetNode[];
  planned_totals?: { assets: number; liabilities: number; equity: number };
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
  other_items?: CashFlowItem[];
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
  operating_currency: string;
  other_net_cashflow?: OtherCurrencyAmount[];
  other_opening_balance?: OtherCurrencyAmount[];
  other_closing_balance?: OtherCurrencyAmount[];
  planned_operating?: CashFlowSection;
  planned_investing?: CashFlowSection;
  planned_financing?: CashFlowSection;
  planned_transfers?: CashFlowSection;
  planned_net_cashflow?: Record<string, number>;
}

// Series types

export interface PostingSpec {
  account: string;
  amount: string | null;   // null = auto-balance
  currency: string | null;
}

export interface SeriesCreateIn {
  type: 'recurring' | 'installment';
  payee: string;
  narration: string;
  start_date: string;
  end_date?: string;
  count?: number;
  currency: string;
  postings: PostingSpec[];
  amount_is_total?: boolean;
}

export interface SeriesExtendIn {
  new_end_date: string;
  new_amount?: number;
  new_currency?: string;
}

export interface SeriesExtendResponse {
  success: boolean;
  series_id?: string;
  count?: number;
  transactions_created?: number;
  errors?: string[];
}

export interface SeriesSummary {
  series_id: string;
  type: 'recurring' | 'installment';
  payee: string;
  narration: string;
  amount_per_txn: string;
  currency: string;
  total: number;
  confirmed: number;
  pending: number;
  first_date: string;
  last_date: string;
  account_from: string;
  account_to: string;
  postings: PostingSpec[];
  is_split: boolean;
}

export interface SeriesListResponse {
  series: SeriesSummary[];
}

export interface SeriesCreateResponse {
  success: boolean;
  series_id?: string;
  count?: number;
  transactions_created?: number;
  errors?: string[];
}

export interface SeriesCancelResponse {
  success: boolean;
  deleted: number;
  kept: number;
  errors?: string[];
}

// Account CRUD types

export interface AccountInput {
  name: string;
  currencies?: string[];
  date?: string;
  ledgr_type?: string;
  metadata?: Record<string, string>;
}

export interface AccountUpdateInput {
  name: string;
  ledgr_type?: string;
  currencies?: string[];
  metadata?: Record<string, string>;
}

export interface CloseAccountInput {
  name: string;
  date?: string;
}

export interface AccountTypeOption {
  value: string;
  label: string;
}

export interface AccountTypesResponse {
  types: Record<string, AccountTypeOption[]>;
}

export interface AccountWarning {
  account: string;
  message: string;
  open_date: string;
  lineno: number;
}

export interface AccountWarningsResponse {
  warnings: AccountWarning[];
}

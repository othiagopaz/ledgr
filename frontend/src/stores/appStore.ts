import { create } from 'zustand';
import type { Transaction, ViewMode, AccountNode, SeriesSummary, TxnModalMode, PeriodPreset, FilterState, ComposerScope, ComposerOpts } from '../types';
import type { DrillTarget } from '../components/TransactionDrawer';

interface Tab {
  id: string;
  type: 'register' | 'report' | 'accounts' | 'dashboard' | 'series' | 'budget';
  account?: string;
  reportType?: string;
  label: string;
}

// Budget view navigation signal (Cmd+K → BudgetView). Mirrors the
// newTxnRequestId signal pattern: a counter the palette bumps, carrying the
// requested action; BudgetView consumes the latest one. See frontend guidelines
// "Signal pattern".
export type BudgetNavAction =
  | 'next-month'
  | 'prev-month'
  | 'copy-last-month'
  | 'add-envelope';

interface AppState {
  // Tabs
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Signal: request opening a new transaction row (from Cmd+N, command palette)
  newTxnRequestId: number;
  requestNewTransaction: () => void;

  // Signal: budget view navigation (from command palette). The consumed-id
  // lives in the store (not a component ref) so it survives BudgetView
  // unmount/remount — a fresh signal fires exactly once, a stale one never
  // replays on remount.
  budgetNavRequestId: number;
  budgetNavConsumedId: number;
  budgetNavAction: BudgetNavAction | null;
  requestBudgetNav: (action: BudgetNavAction) => void;
  consumeBudgetNav: () => void;

  // Composer (unified posting surface — replaces the old txn + series modals).
  composerOpen: boolean;
  composerTxn: Transaction | null;          // editing one occurrence / plain txn
  composerSeries: SeriesSummary | null;     // editing a whole series
  composerScope: ComposerScope;             // 'occurrence' | 'series'
  composerInitial: 'split' | 'repeat' | null; // pre-disclosure for a new draft
  openComposer: (opts?: ComposerOpts) => void;
  escalateToSeries: () => void;             // occurrence → whole-series scope (path 3)
  closeComposer: () => void;
  // Back-compat shims — existing call-sites (register rows, Cmd+N, palette,
  // SeriesView) still call these; they now open the Composer.
  openTxnModal: (txn?: Transaction, mode?: TxnModalMode) => void;
  openSeriesModal: (series?: SeriesSummary, defaultType?: 'recurring' | 'installment') => void;

  // Drill-down drawer (report cell / budget row → transactions for account+period)
  drillTarget: DrillTarget | null;
  openDrill: (target: DrillTarget) => void;
  closeDrill: () => void;

  // Default payment account (from ledgr-option)
  defaultPaymentAccount: string | null;
  setDefaultPaymentAccount: (account: string | null) => void;

  // Account modal
  acctModalOpen: boolean;
  acctModalAccount: AccountNode | null; // null = create, non-null = edit
  openAcctModal: (account?: AccountNode) => void;
  closeAcctModal: () => void;


  // UI
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  focusZone: 'sidebar' | 'register' | 'tabbar';
  setFocusZone: (zone: 'sidebar' | 'register' | 'tabbar') => void;

  // Planned toggle (actual = only * txns, combined = all txns)
  viewMode: ViewMode;
  toggleViewMode: () => void;
  setViewMode: (mode: ViewMode) => void;

  // Global filters
  periodPreset: PeriodPreset | null;
  fromDate: string | null;
  toDate: string | null;
  account: string | null;
  tags: string[];
  payee: string | null;
  setFilter: (patch: Partial<FilterState>) => void;
  clearFilters: () => void;
  clearFilter: (key: keyof FilterState) => void;
  hasActiveFilters: () => boolean;

  // Config
  operatingCurrency: string;
  setOperatingCurrency: (currency: string) => void;
  locale: string | null;
  setLocale: (locale: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Tabs
  tabs: [],
  activeTabId: null,

  openTab: (tab) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.id === tab.id);
    if (existing) {
      set({ activeTabId: existing.id });
    } else {
      set({ tabs: [...tabs, tab], activeTabId: tab.id });
    }
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const newTabs = tabs.filter((t) => t.id !== tabId);
    let newActiveId = activeTabId;

    if (activeTabId === tabId) {
      if (newTabs.length === 0) {
        newActiveId = null;
      } else if (idx < newTabs.length) {
        newActiveId = newTabs[idx].id;
      } else {
        newActiveId = newTabs[newTabs.length - 1].id;
      }
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  // New transaction signal
  newTxnRequestId: 0,
  requestNewTransaction: () =>
    set((s) => ({ newTxnRequestId: s.newTxnRequestId + 1 })),

  // Budget navigation signal
  budgetNavRequestId: 0,
  budgetNavConsumedId: 0,
  budgetNavAction: null,
  requestBudgetNav: (action) =>
    set((s) => ({
      budgetNavRequestId: s.budgetNavRequestId + 1,
      budgetNavAction: action,
    })),
  consumeBudgetNav: () =>
    set((s) => ({ budgetNavConsumedId: s.budgetNavRequestId })),

  // Composer
  composerOpen: false,
  composerTxn: null,
  composerSeries: null,
  composerScope: 'occurrence',
  composerInitial: null,
  openComposer: (opts) => {
    if (opts && 'txn' in opts) {
      set({
        composerOpen: true, composerTxn: opts.txn, composerSeries: null,
        composerScope: 'occurrence', composerInitial: null,
      });
    } else if (opts && 'series' in opts) {
      set({
        composerOpen: true, composerTxn: null, composerSeries: opts.series,
        composerScope: 'series', composerInitial: null,
      });
    } else {
      set({
        composerOpen: true, composerTxn: null, composerSeries: null,
        composerScope: 'occurrence',
        composerInitial: (opts && 'initial' in opts && opts.initial) || null,
      });
    }
  },
  escalateToSeries: () => set({ composerScope: 'series' }),
  closeComposer: () => set({
    composerOpen: false, composerTxn: null, composerSeries: null,
    composerScope: 'occurrence', composerInitial: null,
  }),
  // Shims → Composer.
  openTxnModal: (txn, mode) => get().openComposer(
    txn ? { txn } : { initial: mode === 'advanced' ? 'split' : undefined }
  ),
  openSeriesModal: (series, defaultType) => get().openComposer(
    series ? { series } : (defaultType ? { initial: 'repeat' } : { initial: 'repeat' })
  ),

  drillTarget: null,
  openDrill: (target) => set({ drillTarget: target }),
  closeDrill: () => set({ drillTarget: null }),

  // Default payment account
  defaultPaymentAccount: null,
  setDefaultPaymentAccount: (account) => set({ defaultPaymentAccount: account }),

  // Account modal
  acctModalOpen: false,
  acctModalAccount: null,
  openAcctModal: (account) => set({ acctModalOpen: true, acctModalAccount: account || null }),
  closeAcctModal: () => set({ acctModalOpen: false, acctModalAccount: null }),

  // UI
  theme: 'light',
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  focusZone: 'sidebar',
  setFocusZone: (zone) => set({ focusZone: zone }),

  // Planned toggle
  viewMode: 'combined',
  toggleViewMode: () =>
    set((s) => ({
      viewMode: s.viewMode === 'combined' ? 'actual' : 'combined',
    })),
  setViewMode: (mode) => set({ viewMode: mode }),

  // Global filters — default = all null/empty = no filters = "All time"
  periodPreset: null,
  fromDate: null,
  toDate: null,
  account: null,
  tags: [],
  payee: null,

  setFilter: (patch) => set((s) => {
    const next = { ...patch };
    // When setting a preset, clear custom dates
    if ('periodPreset' in next && next.periodPreset !== null) {
      next.fromDate = null;
      next.toDate = null;
    }
    // When setting custom dates, clear preset
    if (('fromDate' in next || 'toDate' in next) && !('periodPreset' in next)) {
      next.periodPreset = null;
    }
    return {
      periodPreset: next.periodPreset !== undefined ? next.periodPreset : s.periodPreset,
      fromDate: next.fromDate !== undefined ? next.fromDate : s.fromDate,
      toDate: next.toDate !== undefined ? next.toDate : s.toDate,
      account: next.account !== undefined ? next.account : s.account,
      tags: next.tags !== undefined ? next.tags : s.tags,
      payee: next.payee !== undefined ? next.payee : s.payee,
    };
  }),

  clearFilters: () => set({
    periodPreset: null, fromDate: null, toDate: null,
    account: null, tags: [], payee: null,
  }),

  clearFilter: (key) => {
    if (key === 'tags') {
      set({ tags: [] });
    } else if (key === 'periodPreset') {
      set({ periodPreset: null, fromDate: null, toDate: null });
    } else if (key === 'fromDate' || key === 'toDate') {
      set({ periodPreset: null, fromDate: null, toDate: null });
    } else {
      set({ [key]: null });
    }
  },

  hasActiveFilters: () => {
    const s = get();
    return !!(s.periodPreset || s.fromDate || s.toDate || s.account || s.tags.length || s.payee);
  },

  // Config
  operatingCurrency: 'USD',
  setOperatingCurrency: (currency) => set({ operatingCurrency: currency }),
  locale: null,
  setLocale: (locale) => set({ locale }),
}));

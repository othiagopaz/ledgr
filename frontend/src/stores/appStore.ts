import { create } from 'zustand';
import type { Transaction, ViewMode, AccountNode } from '../types';

interface Tab {
  id: string;
  type: 'register' | 'report' | 'accounts' | 'dashboard';
  account?: string;
  reportType?: string;
  label: string;
}

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

  // Transaction modal
  txnModalOpen: boolean;
  txnModalTransaction: Transaction | null;
  openTxnModal: (txn?: Transaction) => void;
  closeTxnModal: () => void;

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

  // Transaction modal
  txnModalOpen: false,
  txnModalTransaction: null,
  openTxnModal: (txn) => set({ txnModalOpen: true, txnModalTransaction: txn || null }),
  closeTxnModal: () => set({ txnModalOpen: false, txnModalTransaction: null }),

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

  // Config
  operatingCurrency: 'USD',
  setOperatingCurrency: (currency) => set({ operatingCurrency: currency }),
  locale: null,
  setLocale: (locale) => set({ locale }),
}));

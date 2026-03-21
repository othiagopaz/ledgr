import { create } from 'zustand';

interface Tab {
  id: string;
  type: 'register' | 'report';
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

  // UI
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  focusZone: 'sidebar' | 'register' | 'tabbar';
  setFocusZone: (zone: 'sidebar' | 'register' | 'tabbar') => void;

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

  // UI
  theme: 'dark',
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  focusZone: 'sidebar',
  setFocusZone: (zone) => set({ focusZone: zone }),

  // Config
  operatingCurrency: 'USD',
  setOperatingCurrency: (currency) => set({ operatingCurrency: currency }),
  locale: null,
  setLocale: (locale) => set({ locale }),
}));

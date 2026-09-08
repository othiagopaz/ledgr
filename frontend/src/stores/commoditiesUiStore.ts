import { create } from 'zustand';

/**
 * UI state for the commodities surfaces (PLAN-commodities-ux §3.2–3.3).
 *
 * Why a second store: `appStore.ts` is being edited concurrently by another
 * FE stream (Composer), so this stream only adds `conversion` there. Everything
 * else the palette needs to reach — the Holdings / Commodities sub-tabs and
 * the two commodity modals — lives here. Same conventions as appStore (plain
 * setters, selectors for reads). Fold into appStore once the streams merge.
 *
 * The sub-tabs are *state*, not one-shot signals: the palette sets them and
 * the view simply renders whatever is set, so there is no effect syncing a
 * request into local state (and the chosen sub-tab survives tab switches).
 */

export type ReportsSubTab =
  | 'charts'
  | 'income-statement'
  | 'cash-flow'
  | 'balance-sheet'
  | 'holdings';

export type AccountsSubTab = 'accounts' | 'commodities';

interface CommoditiesUiState {
  /** Active sub-tab of the Reports page (PageHeader tabs). */
  reportsTab: ReportsSubTab;
  setReportsTab: (tab: ReportsSubTab) => void;

  /** Active sub-tab of the Accounts page: Accounts | Commodities. */
  accountsTab: AccountsSubTab;
  setAccountsTab: (tab: AccountsSubTab) => void;

  /** Update-price modal; `priceModalBase` pre-selects the commodity. */
  priceModalOpen: boolean;
  priceModalBase: string | null;
  openPriceModal: (base?: string) => void;
  closePriceModal: () => void;

  /** New / declare / edit commodity modal; `commodityModalSymbol` pre-fills it. */
  commodityModalOpen: boolean;
  commodityModalSymbol: string | null;
  openCommodityModal: (symbol?: string) => void;
  closeCommodityModal: () => void;
}

export const useCommoditiesUi = create<CommoditiesUiState>((set) => ({
  reportsTab: 'charts',
  setReportsTab: (tab) => set({ reportsTab: tab }),

  accountsTab: 'accounts',
  setAccountsTab: (tab) => set({ accountsTab: tab }),

  priceModalOpen: false,
  priceModalBase: null,
  openPriceModal: (base) => set({ priceModalOpen: true, priceModalBase: base ?? null }),
  closePriceModal: () => set({ priceModalOpen: false, priceModalBase: null }),

  commodityModalOpen: false,
  commodityModalSymbol: null,
  openCommodityModal: (symbol) =>
    set({ commodityModalOpen: true, commodityModalSymbol: symbol ?? null }),
  closeCommodityModal: () => set({ commodityModalOpen: false, commodityModalSymbol: null }),
}));

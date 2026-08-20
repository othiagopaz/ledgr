import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, DEFAULT_PERIOD_PRESET } from "./appStore";
import { resolvePeriodDates } from "../utils/dateUtils";

// These lock in the "app opens scoped to the current year" behaviour. The point
// is performance: an unbounded first paint loads the whole ledger on every
// page. The scope must therefore be the *initial* state — not something a
// component applies after mounting — and "clear" must never silently widen it
// back to the full file.

describe("default period filter", () => {
  beforeEach(() => {
    useAppStore.setState({
      periodPreset: DEFAULT_PERIOD_PRESET,
      fromDate: null,
      toDate: null,
      account: null,
      tags: [],
      payee: null,
    });
  });

  it("starts on the current year, so the first fetch is already bounded", () => {
    const s = useAppStore.getState();
    expect(s.periodPreset).toBe("this-year");

    // The very first render must already resolve to a bounded window.
    const { from_date, to_date } = resolvePeriodDates(s);
    const year = new Date().getFullYear();
    expect(from_date).toBe(`${year}-01-01`);
    expect(to_date).toBe(`${year + 1}-01-01`);
  });

  it("does not count the default year as an active filter", () => {
    // Otherwise "Clear all" would show permanently with nothing to clear.
    expect(useAppStore.getState().hasActiveFilters()).toBe(false);
  });

  it("counts All time as an active filter, so it can be cleared back", () => {
    useAppStore.getState().setFilter({
      periodPreset: null, fromDate: null, toDate: null,
    });
    expect(useAppStore.getState().hasActiveFilters()).toBe(true);
  });

  it("clearFilters returns to the default year, never to unbounded", () => {
    useAppStore.getState().setFilter({
      periodPreset: null, fromDate: null, toDate: null,
    });
    useAppStore.getState().clearFilters();

    const s = useAppStore.getState();
    expect(s.periodPreset).toBe(DEFAULT_PERIOD_PRESET);
    expect(resolvePeriodDates(s).from_date).not.toBeNull();
  });

  it("clearFilters drops the other dimensions", () => {
    useAppStore.getState().setFilter({
      account: "Assets:Bank", tags: ["trip"], payee: "Someone",
    });
    useAppStore.getState().clearFilters();

    const s = useAppStore.getState();
    expect(s.account).toBeNull();
    expect(s.tags).toEqual([]);
    expect(s.payee).toBeNull();
  });

  it("dismissing the period pill returns to the default year", () => {
    // clearFilter('periodPreset') is the store-level reset; the FilterBar's ✕
    // deliberately widens to All time instead, which is its own call.
    useAppStore.getState().setFilter({ periodPreset: "this-month" });
    useAppStore.getState().clearFilter("periodPreset");
    expect(useAppStore.getState().periodPreset).toBe(DEFAULT_PERIOD_PRESET);
  });

  it("keeps a custom range intact once set", () => {
    useAppStore.getState().setFilter({
      fromDate: "2024-03-01", toDate: "2024-04-01",
    });
    const s = useAppStore.getState();
    expect(s.periodPreset).toBeNull();
    expect(resolvePeriodDates(s)).toEqual({
      from_date: "2024-03-01",
      to_date: "2024-04-01",
    });
    expect(s.hasActiveFilters()).toBe(true);
  });
});

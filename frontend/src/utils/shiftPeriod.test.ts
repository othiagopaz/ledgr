import { describe, it, expect } from "vitest";
import { shiftPeriod } from "./dateUtils";

// These lock in the "next/previous period keeps whole-month alignment" fix:
// repeated shifts of a month window must never drift onto broken dates.

describe("shiftPeriod — month-aligned windows", () => {
  const jan2026 = { periodPreset: null, fromDate: "2026-01-01", toDate: "2026-02-01" };

  it("steps a whole month forward, staying on the 1st", () => {
    expect(shiftPeriod(jan2026, 1)).toEqual({
      periodPreset: null,
      fromDate: "2026-02-01",
      toDate: "2026-03-01",
    });
  });

  it("steps a whole month backward", () => {
    expect(shiftPeriod(jan2026, -1)).toEqual({
      periodPreset: null,
      fromDate: "2025-12-01",
      toDate: "2026-01-01",
    });
  });

  it("does NOT drift across February (repeated forward shifts stay aligned)", () => {
    // Jan → Feb → Mar → Apr, always first-of-month, never a 30-day slide.
    let p: { periodPreset: null; fromDate: string | null; toDate: string | null } = jan2026;
    for (let i = 0; i < 3; i++) p = shiftPeriod(p, 1)!;
    expect(p).toEqual({
      periodPreset: null,
      fromDate: "2026-04-01",
      toDate: "2026-05-01",
    });
  });

  it("keeps a whole-year window aligned (12-month span)", () => {
    const year2026 = { periodPreset: null, fromDate: "2026-01-01", toDate: "2027-01-01" };
    expect(shiftPeriod(year2026, 1)).toEqual({
      periodPreset: null,
      fromDate: "2027-01-01",
      toDate: "2028-01-01",
    });
  });
});

describe("shiftPeriod — day windows", () => {
  it("shifts a single day by one day", () => {
    const oneDay = { periodPreset: null, fromDate: "2026-03-10", toDate: "2026-03-11" };
    expect(shiftPeriod(oneDay, 1)).toEqual({
      periodPreset: null,
      fromDate: "2026-03-11",
      toDate: "2026-03-12",
    });
  });

  it("shifts a 7-day window by 7 days", () => {
    const week = { periodPreset: null, fromDate: "2026-03-02", toDate: "2026-03-09" };
    expect(shiftPeriod(week, -1)).toEqual({
      periodPreset: null,
      fromDate: "2026-02-23",
      toDate: "2026-03-02",
    });
  });
});

describe("shiftPeriod — no active window", () => {
  it("returns null when there is nothing to shift", () => {
    expect(shiftPeriod({ periodPreset: "all-time", fromDate: null, toDate: null }, 1)).toBeNull();
  });
});

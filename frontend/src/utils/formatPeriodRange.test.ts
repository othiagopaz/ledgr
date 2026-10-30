import { describe, it, expect } from "vitest";
import { formatPeriodRange, shiftPeriod } from "./dateUtils";

// The period pill turns a shifted window into words: ‹ / › from "This month"
// should read "November", not "2026-11-01 – 2026-12-01".

const now = new Date(2026, 9, 30); // 2026-10-30

describe("formatPeriodRange", () => {
  it("names a single month of the current year", () => {
    expect(formatPeriodRange("2026-11-01", "2026-12-01", now)).toBe("November");
    expect(formatPeriodRange("2026-12-01", "2027-01-01", now)).toBe("December");
  });

  it("adds the year to a month outside the current year", () => {
    expect(formatPeriodRange("2027-01-01", "2027-02-01", now)).toBe("January 2027");
    expect(formatPeriodRange("2025-11-01", "2025-12-01", now)).toBe("November 2025");
  });

  it("names a calendar year by its number", () => {
    expect(formatPeriodRange("2025-01-01", "2026-01-01", now)).toBe("2025");
  });

  it("shows multi-month windows as an inclusive month range", () => {
    expect(formatPeriodRange("2026-09-01", "2026-12-01", now)).toBe("Sep – Nov 2026");
    expect(formatPeriodRange("2025-11-01", "2026-11-01", now)).toBe("Nov 2025 – Oct 2026");
  });

  it("keeps raw dates for windows that aren't whole months", () => {
    expect(formatPeriodRange("2026-11-03", "2026-11-10", now)).toBe("2026-11-03 – 2026-11-10");
    expect(formatPeriodRange("2026-11-01", null, now)).toBe("2026-11-01 – ...");
  });

  it("labels the month you land on after stepping from This month", () => {
    const oct = { periodPreset: null, fromDate: "2026-10-01", toDate: "2026-11-01" };
    const next = shiftPeriod(oct, 1)!;
    expect(formatPeriodRange(next.fromDate, next.toDate, now)).toBe("November");
  });
});

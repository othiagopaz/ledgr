import { useAppStore } from "../stores/appStore";
import type { FilterState } from "../types";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format a Date as YYYY-MM-DD. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve filter state to concrete from_date / to_date values.
 *
 * Presets resolve at call time (so "This month" always reflects now).
 * Returns exclusive end dates matching clamp_opt() semantics:
 * to_date is the day AFTER the last desired day.
 */
export function resolvePeriodDates(
  state: Pick<FilterState, 'periodPreset' | 'fromDate' | 'toDate'>,
): { from_date: string | null; to_date: string | null } {
  // Custom range — return as-is (frontend stores exclusive end dates)
  if (state.fromDate || state.toDate) {
    return { from_date: state.fromDate, to_date: state.toDate };
  }

  if (!state.periodPreset || state.periodPreset === 'all-time') {
    return { from_date: null, to_date: null };
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  switch (state.periodPreset) {
    case 'today':
      return {
        from_date: iso(now),
        to_date: iso(addDays(now, 1)),
      };
    case 'this-week': {
      const day = now.getDay(); // 0=Sun
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      const nextMonday = addDays(monday, 7);
      return { from_date: iso(monday), to_date: iso(nextMonday) };
    }
    case 'this-month':
      return {
        from_date: iso(new Date(y, m, 1)),
        to_date: iso(new Date(y, m + 1, 1)),
      };
    case 'this-year':
      return {
        from_date: iso(new Date(y, 0, 1)),
        to_date: iso(new Date(y + 1, 0, 1)),
      };
    case 'last-30-days':
      return {
        from_date: iso(addDays(now, -29)),
        to_date: iso(addDays(now, 1)),
      };
    case 'last-12-months':
      return {
        from_date: iso(new Date(y, m - 11, 1)),
        to_date: iso(new Date(y, m + 1, 1)),
      };
    case 'ytd':
      return {
        from_date: iso(new Date(y, 0, 1)),
        to_date: iso(addDays(now, 1)),
      };
  }
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

/** Parse YYYY-MM-DD as a local-time midnight Date (no timezone shift). */
function parseLocalISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as YYYY-MM-DD in local time (no timezone shift). */
function formatLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * True when the window is exactly whole calendar months: `from` is a 1st and
 * `to` (exclusive) is a 1st. Such windows must shift by *whole months* and stay
 * month-aligned — stepping by a raw day count would drift onto broken dates
 * (e.g. Feb has 28 days, so a day-count shift lands mid-month next time).
 */
function isMonthAligned(from: Date, to: Date): boolean {
  return from.getDate() === 1 && to.getDate() === 1;
}

/** Whole-month span of a month-aligned window (>= 1). */
function monthSpan(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Shift the currently-active period window by one unit in `direction`
 * (−1 = earlier, +1 = later).
 *
 * The window keeps its own granularity across repeated shifts: a month-aligned
 * window (This month, This year, YTD, or any custom whole-month range) steps by
 * whole months and re-snaps to month boundaries, so "next month" always means
 * the full next calendar month — never a 30-day slide that drops the 1st or
 * last day. Day/week windows step by their exact day length.
 *
 * Returns a partial filter patch ready for `setFilter`, or null if no period is
 * active. `periodPreset` is cleared because the window is now an explicit range.
 */
export function shiftPeriod(
  state: Pick<FilterState, 'periodPreset' | 'fromDate' | 'toDate'>,
  direction: -1 | 1,
): { periodPreset: null; fromDate: string | null; toDate: string | null } | null {
  const { from_date, to_date } = resolvePeriodDates(state);
  if (!from_date || !to_date) return null; // need both ends to shift a window

  const from = parseLocalISO(from_date);
  const to = parseLocalISO(to_date);

  if (isMonthAligned(from, to)) {
    // Step by the window's own month length, staying on month boundaries.
    const span = monthSpan(from, to) || 1;
    const delta = span * direction;
    const newFrom = new Date(from.getFullYear(), from.getMonth() + delta, 1);
    const newTo = new Date(to.getFullYear(), to.getMonth() + delta, 1);
    return {
      periodPreset: null,
      fromDate: formatLocalISO(newFrom),
      toDate: formatLocalISO(newTo),
    };
  }

  // Day/week/custom window — shift by its exact duration in days.
  const days = Math.round((to.getTime() - from.getTime()) / 86400000);
  if (days <= 0) return null;
  const delta = days * direction;
  from.setDate(from.getDate() + delta);
  to.setDate(to.getDate() + delta);
  return {
    periodPreset: null,
    fromDate: formatLocalISO(from),
    toDate: formatLocalISO(to),
  };
}

/**
 * Convert a report period string into an inclusive-start / exclusive-end date
 * range. Inverse of the backend's `date_to_period` (cashflow.py). Handles the
 * three interval shapes the reports emit:
 *   "2026-01"   → month   → 2026-01-01 .. 2026-02-01
 *   "2026-Q1"   → quarter → 2026-01-01 .. 2026-04-01
 *   "2026"      → year    → 2026-01-01 .. 2027-01-01
 * The exclusive `to_date` matches clamp_opt() / resolvePeriodDates semantics.
 */
export function periodToDateRange(
  period: string,
): { from_date: string; to_date: string } {
  const quarter = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarter) {
    const y = Number(quarter[1]);
    const startMonth = (Number(quarter[2]) - 1) * 3; // 0-indexed
    return {
      from_date: formatLocalISO(new Date(y, startMonth, 1)),
      to_date: formatLocalISO(new Date(y, startMonth + 3, 1)),
    };
  }

  const month = period.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    const y = Number(month[1]);
    const m = Number(month[2]) - 1; // 0-indexed
    return {
      from_date: formatLocalISO(new Date(y, m, 1)),
      to_date: formatLocalISO(new Date(y, m + 1, 1)),
    };
  }

  const year = period.match(/^(\d{4})$/);
  if (year) {
    const y = Number(year[1]);
    return {
      from_date: formatLocalISO(new Date(y, 0, 1)),
      to_date: formatLocalISO(new Date(y + 1, 0, 1)),
    };
  }

  throw new Error(`Unrecognized period string: ${period}`);
}

export function parseSmartDate(input: string): string {
  const lower = input.trim().toLowerCase();
  if (lower === "t" || lower === "today") return today();
  if (lower === "y" || lower === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  // Try DD/MM/YYYY or MM/DD/YYYY patterns
  const fullMatch = lower.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fullMatch) {
    const a = parseInt(fullMatch[1]);
    const b = parseInt(fullMatch[2]);
    const year = fullMatch[3];
    if (a > 12) {
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    const locale = useAppStore.getState().locale;
    const currency = useAppStore.getState().operatingCurrency;
    const isDayFirst =
      locale?.startsWith("pt") ||
      locale?.startsWith("de") ||
      locale?.startsWith("es") ||
      locale?.startsWith("fr") ||
      currency === "BRL" ||
      currency === "EUR";
    if (isDayFirst) {
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    return `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  // Try partial date like "03/15" or "15/03"
  const slashMatch = lower.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1]);
    const b = parseInt(slashMatch[2]);
    const year = new Date().getFullYear();
    const locale = useAppStore.getState().locale;
    const currency = useAppStore.getState().operatingCurrency;
    const isDayFirst =
      locale?.startsWith("pt") ||
      locale?.startsWith("de") ||
      locale?.startsWith("es") ||
      locale?.startsWith("fr") ||
      currency === "BRL" ||
      currency === "EUR";
    if (isDayFirst) {
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    return `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  // If it looks like a valid ISO date already, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  return input;
}

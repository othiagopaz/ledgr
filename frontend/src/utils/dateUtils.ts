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
 * Infer the natural pagination step for the currently-active period.
 * Days for day/week presets and custom ranges (by duration),
 * months for month/year presets.
 */
function periodStep(
  state: Pick<FilterState, 'periodPreset' | 'fromDate' | 'toDate'>,
): { unit: 'day' | 'month'; count: number } | null {
  switch (state.periodPreset) {
    case 'today': return { unit: 'day', count: 1 };
    case 'this-week': return { unit: 'day', count: 7 };
    case 'last-30-days': return { unit: 'day', count: 30 };
    case 'this-month': return { unit: 'month', count: 1 };
    case 'this-year':
    case 'last-12-months':
    case 'ytd':
      return { unit: 'month', count: 12 };
    case 'all-time':
    case null:
    case undefined: {
      // Custom range — step by the range's own duration in days.
      const { from_date, to_date } = resolvePeriodDates(state);
      if (!from_date || !to_date) return null;
      const days = Math.round(
        (parseLocalISO(to_date).getTime() - parseLocalISO(from_date).getTime())
        / 86400000,
      );
      return days > 0 ? { unit: 'day', count: days } : null;
    }
  }
}

/**
 * Shift the currently-active period window by one unit in `direction`
 * (−1 = earlier, +1 = later). The unit is inferred from the preset:
 * day for Today, 7-day for This week, month for This month, and so on.
 * For custom ranges, shifts by the range's duration.
 *
 * Returns a partial filter patch ready for `setFilter`, or null if no
 * period is active (nothing to shift).
 */
export function shiftPeriod(
  state: Pick<FilterState, 'periodPreset' | 'fromDate' | 'toDate'>,
  direction: -1 | 1,
): { periodPreset: null; fromDate: string | null; toDate: string | null } | null {
  const step = periodStep(state);
  if (!step) return null;

  const { from_date, to_date } = resolvePeriodDates(state);
  if (!from_date && !to_date) return null;

  const from = from_date ? parseLocalISO(from_date) : null;
  const to = to_date ? parseLocalISO(to_date) : null;
  const delta = step.count * direction;

  if (step.unit === 'day') {
    if (from) from.setDate(from.getDate() + delta);
    if (to) to.setDate(to.getDate() + delta);
  } else {
    if (from) from.setMonth(from.getMonth() + delta);
    if (to) to.setMonth(to.getMonth() + delta);
  }

  return {
    periodPreset: null,
    fromDate: from ? formatLocalISO(from) : null,
    toDate: to ? formatLocalISO(to) : null,
  };
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

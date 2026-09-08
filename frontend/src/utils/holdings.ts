import type { HoldingLot, HoldingPosition } from '../types';

/** A price older than this, in days, is rendered as stale in Holdings. */
export const STALE_PRICE_DAYS = 7;

/** True when the latest price is older than STALE_PRICE_DAYS (null age ⇒ not stale). */
export function isPriceStale(ageDays: number | null | undefined): boolean {
  return ageDays != null && ageDays > STALE_PRICE_DAYS;
}

/** Tooltip for a price cell — only meaningful when the age is known. */
export function priceAgeTitle(ageDays: number | null | undefined): string | undefined {
  if (ageDays == null) return undefined;
  if (ageDays === 0) return 'Price is from today';
  if (ageDays === 1) return 'Price is 1 day old';
  return `Price is ${ageDays} days old`;
}

/** Count of decimals in a decimal string ("33.5" → 1, "100" → 0). */
function decimalsOf(value: string): number {
  const i = value.indexOf('.');
  return i === -1 ? 0 : value.length - i - 1;
}

/**
 * Format a unit quantity. Decimals come across the wire as strings; when the
 * commodity declares a `precision` we honour it, otherwise we keep whatever
 * precision the ledger used (capped so a runaway decimal cannot flood a cell).
 */
export function formatUnits(
  units: string,
  precision: number | null | undefined,
  locale = 'en-US',
): string {
  const n = Number(units);
  if (!Number.isFinite(n)) return units;
  const digits = precision ?? Math.min(decimalsOf(units), 8);
  return n.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** One non-operating-currency position of an account, folded across lots. */
export interface UnitPosition {
  currency: string;
  /** Quantity as a decimal string. */
  number: string;
  /** True when the current lens could not bring this position into the value. */
  unvalued?: boolean;
}

export interface UnitSummary {
  /** Positions that fit on the one-line summary, in display order. */
  shown: UnitPosition[];
  /** How many positions were folded into the `+N` tail. */
  hidden: number;
  /** The one-line summary: `100 PETR4 · 1.000,00 USD · +8`. Empty when there is nothing. */
  line: string;
  /**
   * Every position, one per line, unvalued ones marked — for the cell's
   * tooltip and accessible name. Empty when there is nothing.
   */
  full: string;
}

export const UNIT_SEPARATOR = ' · ';
export const UNVALUED_SUFFIX = ' — not valued under this lens';

/** `100 PETR4`, `1.000,00 USD` — a quantity and its commodity. */
export function unitText(p: UnitPosition, locale = 'en-US'): string {
  return `${formatUnits(p.number, null, locale)} ${p.currency}`;
}

/**
 * Display order for positions. The API carries no per-position value, so
 * "largest share first" is not available and ordering by raw units would
 * compare shares to dollars. Instead: positions the lens *could* value first
 * (they are part of the number above), the leftovers after, alphabetical
 * within each group — deterministic, and the same on every lens.
 */
export function orderUnits<T extends UnitPosition>(units: readonly T[]): T[] {
  return [...units].sort((a, b) => {
    const ua = a.unvalued ? 1 : 0;
    const ub = b.unvalued ? 1 : 0;
    return ua - ub || a.currency.localeCompare(b.currency);
  });
}

/**
 * Bound a list of positions to one line. At most `max` are spelled out; the
 * rest collapse into `+N`, so a broker holding ten tickers takes the same
 * space as one holding two. `full` carries the whole list for the tooltip.
 */
export function summarizeUnits(
  units: readonly UnitPosition[],
  max = 2,
  locale = 'en-US',
): UnitSummary {
  const ordered = orderUnits(units);
  const shown = ordered.slice(0, Math.max(0, max));
  const hidden = ordered.length - shown.length;
  const parts = shown.map((p) => unitText(p, locale));
  if (hidden > 0) parts.push(`+${hidden}`);
  const full = ordered
    .map((p) => unitText(p, locale) + (p.unvalued ? UNVALUED_SUFFIX : ''))
    .join('\n');
  return { shown, hidden, line: parts.join(UNIT_SEPARATOR), full };
}

/**
 * Signed percent with two decimals and an explicit + on gains ("+14.29%").
 * Locale-aware like formatUnits/formatAmount, so "+16,50%" sits next to
 * "850,00" in a pt-BR ledger instead of mixing decimal marks.
 */
export function formatPct(pct: string | null | undefined, locale = 'en-US'): string {
  if (pct == null) return '—';
  const n = Number(pct);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  const body = n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${body}%`;
}

/** Sign class for a decimal string: mirrors utils/format.amountSignClass. */
export function signClassOf(
  value: string | null | undefined,
): 'positive' | 'negative' | 'amount-zero' {
  const n = Number(value ?? 0);
  if (n > 0.000001) return 'positive';
  if (n < -0.000001) return 'negative';
  return 'amount-zero';
}

/** Total cost of one lot (units × unit cost) as a number. */
export function lotTotalCost(lot: HoldingLot): number {
  return Number(lot.units) * Number(lot.cost);
}

/**
 * Whether a position row can expand to show lots. NONE bookings send
 * `lots: null` (Beancount appends negative positions instead of reducing lots,
 * so a lot list would mislead); everything else with at least one lot expands.
 */
export function hasExpandableLots(p: Pick<HoldingPosition, 'lots'>): boolean {
  return Array.isArray(p.lots) && p.lots.length > 0;
}

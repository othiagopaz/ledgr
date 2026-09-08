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

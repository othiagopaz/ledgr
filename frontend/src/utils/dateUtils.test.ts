import { describe, it, expect, afterEach, vi } from 'vitest';
import { today, parseSmartDate } from './dateUtils';

/** Local YYYY-MM-DD from a Date's local components (the correct behaviour). */
function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

describe('today() — local timezone, not UTC', () => {
  afterEach(() => vi.useRealTimers());

  it('returns the LOCAL calendar date', () => {
    expect(today()).toBe(localYMD(new Date()));
  });

  it('does not roll to the next day in the evening (the UTC bug)', () => {
    // 2026-07-07 21:30 local. In a negative-offset zone this is already
    // 2026-07-08 in UTC, so toISOString().slice(0,10) would wrongly say the 8th.
    // today() must report whatever the LOCAL date is for this instant.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 7, 21, 30, 0)); // month is 0-indexed → July
    expect(today()).toBe('2026-07-07');
    // And it must equal the local reconstruction, never the UTC slice when they differ.
    const now = new Date();
    expect(today()).toBe(localYMD(now));
  });

  it('parseSmartDate("yesterday") is local and one day before today()', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 7, 23, 15, 0));
    expect(parseSmartDate('yesterday')).toBe('2026-07-06');
    expect(parseSmartDate('today')).toBe('2026-07-07');
  });
});

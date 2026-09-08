import { describe, it, expect } from 'vitest';
import { niceDomain, niceScale, niceStep, timeDomain } from './PriceChart';

const DAY_MS = 86_400_000;

describe('niceStep', () => {
  it('snaps to 1 / 2 / 2.5 / 5 × 10^k, never below the raw step', () => {
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(1.7)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(120)).toBe(200);
  });
  it('falls back to 1 for a degenerate step', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-3)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
  });
});

describe('niceDomain', () => {
  it('is not forced to zero and hugs the observed range with a little air', () => {
    const [lo, hi] = niceDomain([33, 35, 41, 38]);
    expect(lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(33);
    expect(hi).toBeGreaterThan(41);
    // Padding stays modest: at most one nice step on each side.
    expect(33 - lo).toBeLessThanOrEqual(2);
    expect(hi - 41).toBeLessThanOrEqual(2);
  });
  it('lands on round numbers', () => {
    const [lo, hi] = niceDomain([33, 35, 41, 38]);
    expect(lo).toBe(32);
    expect(hi).toBe(42);
  });
  it('gives a single price a visible band around it', () => {
    const [lo, hi] = niceDomain([40]);
    expect(lo).toBeLessThan(40);
    expect(hi).toBeGreaterThan(40);
  });
  it('handles a flat series and a zero price', () => {
    expect(niceDomain([5.2, 5.2, 5.2])[0]).toBeLessThan(5.2);
    const [lo, hi] = niceDomain([0]);
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(0);
  });
  it('does not leak float noise into the bounds', () => {
    const [lo, hi] = niceDomain([0.1, 0.3]);
    expect(String(lo).length).toBeLessThan(8);
    expect(String(hi).length).toBeLessThan(8);
  });
  it('is defined on empty input', () => {
    expect(niceDomain([])).toEqual([0, 1]);
  });
});

describe('niceScale', () => {
  it('emits ticks on the same step as the domain, ends included', () => {
    const { domain, ticks } = niceScale([38, 41.5]);
    expect(domain).toEqual([37, 42]);
    expect(ticks).toEqual([37, 38, 39, 40, 41, 42]);
  });
  it('keeps a long series to a handful of round ticks', () => {
    const { ticks } = niceScale([22.1, 35.4, 28.9, 24.7]);
    expect(ticks).toEqual([20, 25, 30, 35, 40]);
  });
  it('rounds every tick at the step precision', () => {
    const { ticks } = niceScale([0.1, 0.3]);
    for (const t of ticks) expect(String(t).length).toBeLessThan(8);
  });
});

describe('timeDomain', () => {
  it('uses the data extent when there is a span', () => {
    expect(timeDomain([10, 30, 20])).toEqual([10, 30]);
  });
  it('gives a single date a day either side so the dot has room', () => {
    expect(timeDomain([DAY_MS * 100])).toEqual([DAY_MS * 99, DAY_MS * 101]);
  });
});

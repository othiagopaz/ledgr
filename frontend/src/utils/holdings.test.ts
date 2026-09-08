import { describe, it, expect } from 'vitest';
import {
  isPriceStale, priceAgeTitle, formatUnits, formatPct, signClassOf,
  lotTotalCost, hasExpandableLots, STALE_PRICE_DAYS,
} from './holdings';

describe('price staleness', () => {
  it('is stale strictly past the threshold', () => {
    expect(isPriceStale(STALE_PRICE_DAYS)).toBe(false);
    expect(isPriceStale(STALE_PRICE_DAYS + 1)).toBe(true);
    expect(isPriceStale(99)).toBe(true);
  });
  it('is never stale when the age is unknown', () => {
    expect(isPriceStale(null)).toBe(false);
    expect(isPriceStale(undefined)).toBe(false);
    expect(isPriceStale(0)).toBe(false);
  });
  it('titles read naturally', () => {
    expect(priceAgeTitle(0)).toBe('Price is from today');
    expect(priceAgeTitle(1)).toBe('Price is 1 day old');
    expect(priceAgeTitle(12)).toBe('Price is 12 days old');
    expect(priceAgeTitle(null)).toBeUndefined();
  });
});

describe('formatUnits', () => {
  it('honours the declared precision', () => {
    expect(formatUnits('150', 2)).toBe('150.00');
    expect(formatUnits('1234.5678', 2)).toBe('1,234.57');
    expect(formatUnits('2', 0)).toBe('2');
  });
  it('keeps the ledger precision when none is declared', () => {
    expect(formatUnits('150', null)).toBe('150');
    expect(formatUnits('33.5', null)).toBe('33.5');
    expect(formatUnits('0.12345678', undefined)).toBe('0.12345678');
  });
  it('caps undeclared precision at 8 decimals', () => {
    expect(formatUnits('0.1234567891', null)).toBe('0.12345679');
  });
  it('is locale-aware', () => {
    expect(formatUnits('1234.5', 2, 'pt-BR')).toBe('1.234,50');
  });
  it('passes through non-numeric input untouched', () => {
    expect(formatUnits('n/a', 2)).toBe('n/a');
  });
});

describe('formatPct', () => {
  it('signs gains explicitly and leaves losses to the minus', () => {
    expect(formatPct('14.29')).toBe('+14.29%');
    expect(formatPct('-3.5')).toBe('-3.50%');
    expect(formatPct('0')).toBe('0.00%');
  });
  it('is locale-aware', () => {
    expect(formatPct('16.5', 'pt-BR')).toBe('+16,50%');
    expect(formatPct('-1234.5', 'pt-BR')).toBe('-1.234,50%');
  });
  it('renders a dash when unknown', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
    expect(formatPct('abc')).toBe('—');
  });
});

describe('signClassOf', () => {
  it('maps decimal strings to the report sign classes', () => {
    expect(signClassOf('750.00')).toBe('positive');
    expect(signClassOf('-0.01')).toBe('negative');
    expect(signClassOf('0.00')).toBe('amount-zero');
    expect(signClassOf(null)).toBe('amount-zero');
  });
});

describe('lots', () => {
  it('computes a lot total from units × cost', () => {
    expect(lotTotalCost({ date: '2026-02-01', label: null, units: '100', cost: '33.00' })).toBe(3300);
    expect(lotTotalCost({ date: '2026-03-01', label: null, units: '50', cost: '37.00' })).toBe(1850);
  });
  it('only expands rows that actually carry lots', () => {
    expect(hasExpandableLots({ lots: null })).toBe(false);
    expect(hasExpandableLots({ lots: [] })).toBe(false);
    expect(hasExpandableLots({ lots: [{ date: '2026-02-01', label: null, units: '1', cost: '1' }] })).toBe(true);
  });
});

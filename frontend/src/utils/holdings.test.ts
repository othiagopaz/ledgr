import { describe, it, expect } from 'vitest';
import {
  isPriceStale, priceAgeTitle, formatUnits, formatPct, signClassOf,
  lotTotalCost, hasExpandableLots, STALE_PRICE_DAYS,
  summarizeUnits, orderUnits, unitText, UNVALUED_SUFFIX,
} from './holdings';

describe('summarizeUnits', () => {
  const petr = { currency: 'PETR4', number: '100' };
  const usd = { currency: 'USD', number: '1000.00' };
  const itub = { currency: 'ITUB4', number: '50' };
  const vale = { currency: 'VALE3', number: '10' };

  it('is empty for no positions', () => {
    expect(summarizeUnits([])).toEqual({ shown: [], hidden: 0, line: '', full: '' });
  });
  it('spells out up to the maximum with no tail', () => {
    const s = summarizeUnits([petr, usd]);
    expect(s.line).toBe('100 PETR4 · 1,000.00 USD');
    expect(s.hidden).toBe(0);
    expect(s.shown).toHaveLength(2);
  });
  it('folds the rest into +N', () => {
    const s = summarizeUnits([petr, usd, itub, vale]);
    expect(s.line).toBe('50 ITUB4 · 100 PETR4 · +2');
    expect(s.hidden).toBe(2);
    expect(s.shown.map((p) => p.currency)).toEqual(['ITUB4', 'PETR4']);
  });
  it('honours a different maximum', () => {
    expect(summarizeUnits([petr, usd, itub], 1).line).toBe('50 ITUB4 · +2');
    expect(summarizeUnits([petr, usd, itub], 3).line).toBe('50 ITUB4 · 100 PETR4 · 1,000.00 USD');
    expect(summarizeUnits([petr, usd], 0).line).toBe('+2');
  });
  it('lists every position in full, one per line, marking the unvalued', () => {
    const s = summarizeUnits([petr, { ...usd, unvalued: true }, itub, vale]);
    expect(s.full).toBe(
      ['50 ITUB4', '100 PETR4', '10 VALE3', `1,000.00 USD${UNVALUED_SUFFIX}`].join('\n'),
    );
  });
  it('is locale-aware', () => {
    expect(summarizeUnits([usd, petr], 2, 'pt-BR').line).toBe('100 PETR4 · 1.000,00 USD');
  });
  it('does not mutate its input', () => {
    const input = [usd, petr];
    summarizeUnits(input);
    expect(input.map((p) => p.currency)).toEqual(['USD', 'PETR4']);
  });
});

describe('orderUnits', () => {
  it('puts valued positions first, then alphabetical within each group', () => {
    const ordered = orderUnits([
      { currency: 'ZZZ', number: '1' },
      { currency: 'AAA', number: '1', unvalued: true },
      { currency: 'MMM', number: '1' },
      { currency: 'BBB', number: '1', unvalued: true },
    ]);
    expect(ordered.map((p) => p.currency)).toEqual(['MMM', 'ZZZ', 'AAA', 'BBB']);
  });
  it('treats a missing flag as valued', () => {
    const ordered = orderUnits([{ currency: 'B', number: '1', unvalued: false }, { currency: 'A', number: '1' }]);
    expect(ordered.map((p) => p.currency)).toEqual(['A', 'B']);
  });
});

describe('unitText', () => {
  it('pairs the formatted quantity with its commodity', () => {
    expect(unitText({ currency: 'PETR4', number: '100' })).toBe('100 PETR4');
    expect(unitText({ currency: 'USD', number: '1000.00' }, 'pt-BR')).toBe('1.000,00 USD');
  });
});

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

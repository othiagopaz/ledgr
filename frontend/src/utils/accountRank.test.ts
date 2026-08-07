import { describe, it, expect } from 'vitest';
import {
  accountKind, leafName, parentPath, fuzzyMatch, rankAccounts,
} from './accountRank';

const ACCTS = [
  'Expenses:Food',
  'Expenses:House:Rent',
  'Expenses:House:ResidentialTaxes',
  'Expenses:Entertainment',
  'Liabilities:CreditCard:Personnalite',
  'Assets:Bank:Checking',
  'Assets:Investments:Bucket1',
  'Income:Salary:NetPayment',
];

describe('accountKind', () => {
  it('maps roots to kinds', () => {
    expect(accountKind('Expenses:Food')).toBe('exp');
    expect(accountKind('Income:Salary')).toBe('inc');
    expect(accountKind('Liabilities:CreditCard')).toBe('pay');
    expect(accountKind('Assets:Bank:Checking')).toBe('pay');    // bank-ish → payment
    expect(accountKind('Assets:Investments:X')).toBe('ast');    // other assets → generic
    expect(accountKind('Equity:Opening')).toBe('eq');
  });
});

describe('leafName / parentPath', () => {
  it('splits on colons', () => {
    expect(leafName('Expenses:House:Rent')).toBe('Rent');
    expect(parentPath('Expenses:House:Rent')).toBe('Expenses:House:');
    expect(parentPath('Cash')).toBe('');
  });
});

describe('fuzzyMatch', () => {
  it('matches a subsequence, ignoring spaces and colons', () => {
    expect(fuzzyMatch('resid', 'Expenses:House:ResidentialTaxes')).not.toBeNull();
    expect(fuzzyMatch('exp fo', 'Expenses:Food')).not.toBeNull();
    expect(fuzzyMatch('e:f', 'Expenses:Food')).not.toBeNull();
  });
  it('rejects when chars are out of order or missing', () => {
    expect(fuzzyMatch('zzz', 'Expenses:Food')).toBeNull();
    expect(fuzzyMatch('doof', 'Expenses:Food')).toBeNull();
  });
  it('scores leaf matches better than parent matches', () => {
    const leafHit = fuzzyMatch('food', 'Expenses:Food');      // in leaf
    const parentHit = fuzzyMatch('expenses', 'Expenses:Food'); // in parent
    expect(leafHit!.score).toBeLessThan(parentHit!.score);
  });
  it('empty query matches everything with score 0', () => {
    expect(fuzzyMatch('', 'Anything')).toEqual({ first: -1, last: -1, score: 0 });
  });
});

describe('rankAccounts', () => {
  const usage = new Map<string, number>([
    ['Expenses:Food', 42],
    ['Expenses:House:ResidentialTaxes', 8],
    ['Liabilities:CreditCard:Personnalite', 55],
  ]);

  it('fuzzy-filters then returns matches', () => {
    const r = rankAccounts({ query: 'resid', accounts: ACCTS, usage, recents: [] });
    expect(r[0].name).toBe('Expenses:House:ResidentialTaxes');
  });

  it('floats the payee-usual account to the top with a tag', () => {
    const r = rankAccounts({
      query: '', accounts: ACCTS, usage, recents: [],
      usual: 'Expenses:Entertainment',
    });
    expect(r[0].name).toBe('Expenses:Entertainment');
    expect(r[0].tag).toBe('usual');
  });

  it('floats recents above frequency (but below usual)', () => {
    const r = rankAccounts({
      query: '', accounts: ACCTS, usage, recents: ['Assets:Bank:Checking'],
    });
    expect(r[0].name).toBe('Assets:Bank:Checking');
    expect(r[0].tag).toBe('recent');
  });

  it('ranks by personal frequency when no usual/recent', () => {
    const r = rankAccounts({ query: '', accounts: ACCTS, usage, recents: [] });
    // CreditCard (55) and Food (42) are the most-used → near the top
    expect(r.slice(0, 2).map(x => x.name)).toContain('Liabilities:CreditCard:Personnalite');
    expect(r.slice(0, 2).map(x => x.name)).toContain('Expenses:Food');
  });

  it('respects the limit', () => {
    const r = rankAccounts({ query: '', accounts: ACCTS, usage, recents: [], limit: 3 });
    expect(r).toHaveLength(3);
  });
});

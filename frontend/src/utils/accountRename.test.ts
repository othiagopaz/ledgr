import { describe, it, expect } from 'vitest';
import { renamedTo, affectedAccounts, validateRenameTarget } from './accountRename';

const ACCTS = [
  'Assets:Bank:Main',
  'Assets:Invest:XP',
  'Assets:Invest:XP:Bonds',
  'Assets:Invest:XP:Equities',
  'Assets:Invest:XPTruco',
  'Expenses:Food',
];

describe('renamedTo', () => {
  it('renames the account itself', () => {
    expect(renamedTo('Assets:Invest:XP', 'Assets:Invest:XP', 'Assets:Invest:Rico'))
      .toBe('Assets:Invest:Rico');
  });

  it('carries the child path onto the new parent', () => {
    expect(renamedTo('Assets:Invest:XP:Bonds', 'Assets:Invest:XP', 'Assets:Invest:Rico'))
      .toBe('Assets:Invest:Rico:Bonds');
  });

  it('leaves a lookalike sibling alone', () => {
    // The bug this guards against: a plain startsWith would rewrite XPTruco.
    expect(renamedTo('Assets:Invest:XPTruco', 'Assets:Invest:XP', 'Assets:Invest:Rico'))
      .toBe('Assets:Invest:XPTruco');
  });

  it('leaves unrelated accounts alone', () => {
    expect(renamedTo('Expenses:Food', 'Assets:Invest:XP', 'Assets:Invest:Rico'))
      .toBe('Expenses:Food');
  });

  it('does not match a parent when renaming a child', () => {
    expect(renamedTo('Assets:Invest:XP', 'Assets:Invest:XP:Bonds', 'Assets:Invest:XP:Fixed'))
      .toBe('Assets:Invest:XP');
  });
});

describe('affectedAccounts', () => {
  it('includes the subtree when asked', () => {
    expect(affectedAccounts(ACCTS, 'Assets:Invest:XP', true)).toEqual([
      'Assets:Invest:XP',
      'Assets:Invest:XP:Bonds',
      'Assets:Invest:XP:Equities',
    ]);
  });

  it('excludes children when not asked', () => {
    expect(affectedAccounts(ACCTS, 'Assets:Invest:XP', false))
      .toEqual(['Assets:Invest:XP']);
  });

  it('never includes a lookalike sibling', () => {
    const hit = affectedAccounts(ACCTS, 'Assets:Invest:XP', true);
    expect(hit).not.toContain('Assets:Invest:XPTruco');
  });

  it('returns just the leaf for a leaf account', () => {
    expect(affectedAccounts(ACCTS, 'Expenses:Food', true)).toEqual(['Expenses:Food']);
  });
});

describe('validateRenameTarget', () => {
  it('accepts a valid new name', () => {
    expect(validateRenameTarget('Assets:Bank:Primary', 'Assets:Bank:Main', ACCTS))
      .toBeNull();
  });

  it('rejects an empty name', () => {
    expect(validateRenameTarget('  ', 'Assets:Bank:Main', ACCTS)).toMatch(/Enter a new/);
  });

  it('rejects an unchanged name', () => {
    expect(validateRenameTarget('Assets:Bank:Main', 'Assets:Bank:Main', ACCTS))
      .toMatch(/identical/);
  });

  it('rejects a single-segment name', () => {
    expect(validateRenameTarget('Assets', 'Assets:Bank:Main', ACCTS))
      .toMatch(/two segments/);
  });

  it('rejects empty segments', () => {
    expect(validateRenameTarget('Assets::Main', 'Assets:Bank:Main', ACCTS))
      .toMatch(/non-empty/);
  });

  it('rejects a root change', () => {
    expect(validateRenameTarget('Expenses:Bank:Main', 'Assets:Bank:Main', ACCTS))
      .toMatch(/Cannot change the root/);
  });

  it('rejects a name that already exists', () => {
    expect(validateRenameTarget('Expenses:Food', 'Expenses:Rent', ACCTS))
      .toMatch(/already exists/);
  });

  it('trims before comparing', () => {
    expect(validateRenameTarget('  Assets:Bank:Main  ', 'Assets:Bank:Main', ACCTS))
      .toMatch(/identical/);
  });
});

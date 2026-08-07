import { describe, it, expect } from 'vitest';
import { parseInput, tryParseAmount } from './fastInputParser';

describe('fastInputParser', () => {
  // ── Basic narration ──

  it('treats plain text as narration', () => {
    const result = parseInput('Groceries at the market', 23);
    expect(result.narration).toBe('Groceries at the market');
    expect(result.tokens).toHaveLength(0);
    expect(result.activeTrigger).toBeNull();
  });

  it('returns empty for empty input', () => {
    const result = parseInput('', 0);
    expect(result.narration).toBe('');
    expect(result.tokens).toHaveLength(0);
  });

  // ── Amount ($) ──

  it('parses $ amount', () => {
    const result = parseInput('$150', 4);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]).toMatchObject({ type: 'amount', value: '150' });
    expect(result.narration).toBe('');
  });

  it('parses $ decimal amount', () => {
    const result = parseInput('$29.90', 6);
    expect(result.tokens[0]).toMatchObject({ type: 'amount', value: '29.90' });
  });

  it('detects active trigger when cursor is on $', () => {
    const result = parseInput('$', 1);
    expect(result.activeTrigger).toMatchObject({ type: 'amount', query: '' });
  });

  it('detects active trigger while typing amount', () => {
    const result = parseInput('$15', 3);
    expect(result.activeTrigger).toMatchObject({ type: 'amount', query: '15' });
  });

  // ── Account (>) ──

  it('detects > as account trigger', () => {
    const result = parseInput('>Food', 5);
    expect(result.activeTrigger).toMatchObject({ type: 'account', query: 'Food' });
    // Account triggers don't produce tokens (selected from dropdown)
    expect(result.tokens).toHaveLength(0);
  });

  it('detects empty > trigger', () => {
    const result = parseInput('>', 1);
    expect(result.activeTrigger).toMatchObject({ type: 'account', query: '' });
  });

  // ── Payee (@) ──

  it('detects @ as payee trigger', () => {
    const result = parseInput('@Super', 6);
    expect(result.activeTrigger).toMatchObject({ type: 'payee', query: 'Super' });
  });

  it('detects empty @ trigger', () => {
    const result = parseInput('@', 1);
    expect(result.activeTrigger).toMatchObject({ type: 'payee', query: '' });
  });

  // ── Tag (#) ──

  it('parses # tag', () => {
    const result = parseInput('#groceries', 10);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]).toMatchObject({ type: 'tag', value: 'groceries' });
  });

  it('detects active # trigger', () => {
    const result = parseInput('#gro', 4);
    expect(result.activeTrigger).toMatchObject({ type: 'tag', query: 'gro' });
  });

  // ── Link (^) ──

  it('parses ^ link', () => {
    const result = parseInput('^invoice-123', 12);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]).toMatchObject({ type: 'link', value: 'invoice-123' });
  });

  it('detects active ^ trigger', () => {
    const result = parseInput('^inv', 4);
    expect(result.activeTrigger).toMatchObject({ type: 'link', query: 'inv' });
  });

  // ── Flag (!) ──

  it('parses ! as flag toggle', () => {
    const result = parseInput('!', 1);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]).toMatchObject({ type: 'flag', value: '!' });
  });

  // ── Date detection: keywords ──

  it('parses "today" as date', () => {
    const result = parseInput('today', 5);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].type).toBe('date');
    expect(result.tokens[0].value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses "t" as today shortcut', () => {
    const result = parseInput('t', 1);
    expect(result.tokens[0].type).toBe('date');
  });

  it('parses "yesterday" as date', () => {
    const result = parseInput('yesterday', 9);
    expect(result.tokens[0].type).toBe('date');
    const todayDate = new Date();
    todayDate.setDate(todayDate.getDate() - 1);
    expect(result.tokens[0].value).toBe(todayDate.toISOString().slice(0, 10));
  });

  it('parses "y" as yesterday shortcut', () => {
    const result = parseInput('y', 1);
    expect(result.tokens[0].type).toBe('date');
  });

  it('parses "tomorrow" as date', () => {
    const result = parseInput('tomorrow', 8);
    expect(result.tokens[0].type).toBe('date');
  });

  it('parses "hoje" as today (Portuguese)', () => {
    const result = parseInput('hoje', 4);
    expect(result.tokens[0].type).toBe('date');
  });

  it('parses "ontem" as yesterday (Portuguese)', () => {
    const result = parseInput('ontem', 5);
    expect(result.tokens[0].type).toBe('date');
  });

  it('parses "amanha" as tomorrow (Portuguese, no accent)', () => {
    const result = parseInput('amanha', 6);
    expect(result.tokens[0].type).toBe('date');
  });

  // ── Date detection: patterns ──

  it('parses DD/MM pattern', () => {
    const result = parseInput('15/03', 5);
    expect(result.tokens[0].type).toBe('date');
    const year = new Date().getFullYear();
    expect(result.tokens[0].value).toBe(`${year}-03-15`);
  });

  it('parses DD/MM/YYYY pattern', () => {
    const result = parseInput('25/12/2024', 10);
    expect(result.tokens[0]).toMatchObject({ type: 'date', value: '2024-12-25' });
  });

  it('parses DD-MM-YYYY with dashes', () => {
    const result = parseInput('01-06-2025', 10);
    expect(result.tokens[0]).toMatchObject({ type: 'date', value: '2025-06-01' });
  });

  // ── Combined triggers ──

  it('parses multiple triggers together', () => {
    const text = '$150 #groceries today';
    const result = parseInput(text, text.length);
    expect(result.tokens).toHaveLength(3);
    expect(result.tokens.map(t => t.type)).toEqual(['amount', 'tag', 'date']);
    expect(result.narration).toBe('');
  });

  it('mixes narration with triggers', () => {
    const text = 'Weekly shopping $350 #groceries';
    const result = parseInput(text, text.length);
    expect(result.narration).toBe('Weekly shopping');
    expect(result.tokens.find(t => t.type === 'amount')?.value).toBe('350');
    expect(result.tokens.find(t => t.type === 'tag')?.value).toBe('groceries');
  });

  it('parses all trigger types in any order', () => {
    const text = 'yesterday $100 ! #food ^inv-1 Lunch';
    const result = parseInput(text, text.length);
    const types = result.tokens.map(t => t.type);
    expect(types).toContain('date');
    expect(types).toContain('amount');
    expect(types).toContain('flag');
    expect(types).toContain('tag');
    expect(types).toContain('link');
    expect(result.narration).toBe('Lunch');
  });

  // ── Active trigger detection at cursor position ──

  it('detects active trigger only at cursor', () => {
    const text = '$150 @Super';
    // Cursor at end of @Super
    const result1 = parseInput(text, text.length);
    expect(result1.activeTrigger?.type).toBe('payee');

    // Cursor at end of $150
    const result2 = parseInput(text, 4);
    expect(result2.activeTrigger?.type).toBe('amount');
  });

  it('no active trigger when cursor is on narration', () => {
    const text = '$150 Groceries @';
    const result = parseInput(text, 14); // cursor on "Groceries"
    expect(result.activeTrigger).toBeNull();
  });

  // ── Edge cases ──

  it('handles trigger at start of text', () => {
    const result = parseInput('#tag1 some text', 5);
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].type).toBe('tag');
    expect(result.narration).toBe('some text');
  });

  it('handles trigger at end of text', () => {
    const text = 'some text #tag1';
    const result = parseInput(text, text.length);
    expect(result.tokens).toHaveLength(1);
    expect(result.narration).toBe('some text');
  });

  it('handles trigger in middle of text', () => {
    const result = parseInput('before $50 after', 16);
    expect(result.tokens).toHaveLength(1);
    expect(result.narration).toBe('before after');
  });

  it('preserves token positions', () => {
    const text = 'hello $50 world';
    const result = parseInput(text, text.length);
    const amountToken = result.tokens.find(t => t.type === 'amount')!;
    expect(amountToken.startIndex).toBe(6);
    expect(amountToken.endIndex).toBe(9);
    expect(amountToken.raw).toBe('$50');
  });
});

describe('tryParseAmount — bare money detection (locale-aware)', () => {
  // comma-decimal locale (pt/BRL): "," = decimal, "." = thousands
  it('accepts decimals and thousands in a comma-decimal locale', () => {
    expect(tryParseAmount('212,90', true)).toBe('212,90');
    expect(tryParseAmount('1.234,56', true)).toBe('1.234,56');
    expect(tryParseAmount('1.234', true)).toBe('1.234');       // thousands-only
    expect(tryParseAmount('55,00', true)).toBe('55,00');
  });
  it('accepts decimals and thousands in a dot-decimal locale', () => {
    expect(tryParseAmount('212.90', false)).toBe('212.90');
    expect(tryParseAmount('1,234.56', false)).toBe('1,234.56');
    expect(tryParseAmount('55.00', false)).toBe('55.00');
  });
  it('accepts plain integers (no separators) as the amount', () => {
    expect(tryParseAmount('230', true)).toBe('230');
    expect(tryParseAmount('750', true)).toBe('750');
    expect(tryParseAmount('2026', false)).toBe('2026');
    expect(tryParseAmount('5', true)).toBe('5');
  });
  it('rejects a bare zero (not a meaningful amount)', () => {
    expect(tryParseAmount('0', true)).toBeNull();
    expect(tryParseAmount('0,00', true)).toBeNull();
    expect(tryParseAmount('0.00', false)).toBeNull();
  });
  it('rejects non-numbers and bad decimal shapes', () => {
    expect(tryParseAmount('abc', true)).toBeNull();
    expect(tryParseAmount('12,345', true)).toBeNull();   // 3 decimals in comma locale → not money
    expect(tryParseAmount('', true)).toBeNull();
  });
});

describe('parseInput — bare amount on space', () => {
  it('detects a bare comma-decimal amount as an amount token', () => {
    const r = parseInput('Coffee 212,90', 13, { commaDecimal: true });
    const amt = r.tokens.find(t => t.type === 'amount');
    expect(amt?.value).toBe('212,90');
    expect(r.narration).toBe('Coffee');
  });
  it('keeps a date as a date, not an amount (date detection wins)', () => {
    const r = parseInput('rent 12/08', 10, { commaDecimal: true });
    expect(r.tokens.find(t => t.type === 'date')).toBeTruthy();
    expect(r.tokens.find(t => t.type === 'amount')).toBeFalsy();
  });
  it('detects a bare plain integer as the amount', () => {
    const r = parseInput('Groceries 230', 13, { commaDecimal: true });
    expect(r.tokens.find(t => t.type === 'amount')?.value).toBe('230');
    expect(r.narration).toBe('Groceries');
  });
  it('still supports the $ prefix', () => {
    const r = parseInput('$50', 3);
    expect(r.tokens.find(t => t.type === 'amount')?.value).toBe('50');
  });
});

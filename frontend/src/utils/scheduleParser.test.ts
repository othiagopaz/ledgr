import { describe, it, expect } from 'vitest';
import { parseSchedule, scheduleLabel } from './scheduleParser';

describe('scheduleParser — recurring', () => {
  it('parses a bare frequency word', () => {
    for (const [word, freq] of [
      ['weekly', 'weekly'],
      ['monthly', 'monthly'],
      ['yearly', 'yearly'],
      ['annually', 'yearly'],
    ] as const) {
      const r = parseSchedule(word);
      expect(r?.schedule).toMatchObject({ kind: 'recurring', frequency: freq });
    }
  });

  it('is case-insensitive', () => {
    expect(parseSchedule('MONTHLY')?.schedule.frequency).toBe('monthly');
    expect(parseSchedule('Weekly')?.schedule.frequency).toBe('weekly');
  });

  it('parses "every <unit>"', () => {
    expect(parseSchedule('every month')?.schedule).toMatchObject({
      kind: 'recurring', frequency: 'monthly',
    });
    expect(parseSchedule('every week')?.schedule.frequency).toBe('weekly');
    expect(parseSchedule('every year')?.schedule.frequency).toBe('yearly');
  });

  it('strips a leading recurring glyph', () => {
    expect(parseSchedule('↻ monthly')?.schedule.frequency).toBe('monthly');
    expect(parseSchedule('⟳ weekly')?.schedule.frequency).toBe('weekly');
  });

  it('parses "<freq> until <ISO date>"', () => {
    const r = parseSchedule('monthly until 2026-12-31');
    expect(r?.schedule).toMatchObject({
      kind: 'recurring', frequency: 'monthly', until: '2026-12-31',
    });
  });

  it('accepts until synonyms (till / through / thru / to)', () => {
    for (const w of ['till', 'through', 'thru', 'to']) {
      const r = parseSchedule(`monthly ${w} 2026-06-30`);
      expect(r?.schedule.until).toBe('2026-06-30');
    }
  });

  it('parses "until DD/MM/YYYY" day-first', () => {
    const r = parseSchedule('monthly until 31/12/2026');
    expect(r?.schedule.until).toBe('2026-12-31');
  });

  it('parses "until DD/MM" using the current year', () => {
    const y = new Date().getFullYear();
    const r = parseSchedule('weekly until 15/03');
    expect(r?.schedule.until).toBe(`${y}-03-15`);
  });

  it('resolves a bare month name to that month\'s last day', () => {
    // "dec" → last day of December. Year rolls to next if the month is already
    // past — compute the expectation the same way to stay green year-round.
    const now = new Date();
    const decYear = 12 < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
    expect(parseSchedule('monthly until dec')?.schedule.until).toBe(`${decYear}-12-31`);

    const janYear = 1 < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
    // February clamps correctly (28/29) via Date month-end math.
    const febYear = 2 < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
    const febLast = new Date(febYear, 2, 0).getDate();
    expect(parseSchedule('yearly until jan')?.schedule.until).toBe(`${janYear}-01-31`);
    expect(parseSchedule('monthly until feb')?.schedule.until).toBe(
      `${febYear}-02-${String(febLast).padStart(2, '0')}`,
    );
  });

  it('ignores an unparseable until target (keeps the frequency)', () => {
    const r = parseSchedule('monthly until someday');
    expect(r?.schedule).toEqual({ kind: 'recurring', frequency: 'monthly' });
    expect(r?.schedule.until).toBeUndefined();
  });
});

describe('scheduleParser — installments', () => {
  it('parses per-installment form <amount>*<count> → each amount + count', () => {
    const r = parseSchedule('212,90*10');
    expect(r?.schedule).toEqual({ kind: 'installment', count: 10, amountIsTotal: false });
    expect(r?.total).toBe('212,90');   // caller reads this as the PER-installment amount
  });

  it('matches the installment token even after narration', () => {
    const r = parseSchedule('Fast Shop 212,90*10');
    expect(r?.schedule).toMatchObject({ kind: 'installment', count: 10 });
    expect(r?.raw).toBe('212,90*10');   // only the token is consumed
  });

  it('keeps a "/" date as the until target', () => {
    const r = parseSchedule('weekly until 15/03');
    expect(r?.schedule).toMatchObject({ kind: 'recurring', frequency: 'weekly' });
  });

  it('parses * form with a plain integer amount and optional #', () => {
    expect(parseSchedule('250*12')?.schedule).toEqual({ kind: 'installment', count: 12, amountIsTotal: false });
    expect(parseSchedule('#250*12')?.total).toBe('250');
  });

  it('no longer parses the old x / × forms (they are narration now)', () => {
    expect(parseSchedule('12x')).toBeNull();
    expect(parseSchedule('6×')).toBeNull();
    expect(parseSchedule('#12x')).toBeNull();
  });

  it('parses total:count form (`:`) → amountIsTotal + total captured', () => {
    const r = parseSchedule('1000:10');
    expect(r?.schedule).toEqual({ kind: 'installment', count: 10, amountIsTotal: true });
    expect(r?.total).toBe('1000');
  });

  it('parses total:count with grouping punctuation in the total', () => {
    const r = parseSchedule('3.000,50:10');
    expect(r?.schedule).toMatchObject({ kind: 'installment', count: 10, amountIsTotal: true });
    expect(r?.total).toBe('3.000,50');
  });

  it('does NOT treat `/` as division — that is a date (1000/10, 15/03 → not a schedule)', () => {
    expect(parseSchedule('1000/10')).toBeNull();
    expect(parseSchedule('15/03')).toBeNull();
    expect(parseSchedule('3000/12')).toBeNull();
  });

  it('rejects zero count and zero amount/total', () => {
    expect(parseSchedule('0*5')).toBeNull();      // zero amount
    expect(parseSchedule('212,90*0')).toBeNull(); // zero count
    expect(parseSchedule('5:0')).toBeNull();      // zero count (total:count)
    expect(parseSchedule('0:5')).toBeNull();      // zero total
    expect(parseSchedule('0,00:5')).toBeNull();   // zero total with grouping
  });
});

describe('scheduleParser — the # overload (schedule vs tag)', () => {
  it('returns null for a plain #tag so the fast parser keeps it', () => {
    expect(parseSchedule('#groceries')).toBeNull();
    expect(parseSchedule('#trip2026')).toBeNull();
    expect(parseSchedule('#12')).toBeNull();         // numeric tag, not an installment
  });
});

describe('scheduleParser — non-schedules', () => {
  it('returns null for empty / whitespace / glyph-only', () => {
    expect(parseSchedule('')).toBeNull();
    expect(parseSchedule('   ')).toBeNull();
    expect(parseSchedule('↻')).toBeNull();
  });

  it('returns null for unrelated words', () => {
    expect(parseSchedule('Netflix subscription')).toBeNull();
    expect(parseSchedule('every')).toBeNull();       // "every" with no unit
    expect(parseSchedule('until dec')).toBeNull();   // no frequency
  });
});

describe('scheduleLabel', () => {
  it('labels recurring with and without until', () => {
    expect(scheduleLabel({ kind: 'recurring', frequency: 'monthly' })).toBe('monthly');
    expect(scheduleLabel({ kind: 'recurring', frequency: 'weekly', until: '2026-12-31' }))
      .toBe('weekly · until 2026-12-31');
  });

  it('labels installments with and without total', () => {
    expect(scheduleLabel({ kind: 'installment', count: 12 })).toBe('12×');
    expect(scheduleLabel({ kind: 'installment', count: 12, amountIsTotal: true }))
      .toBe('12× · total');
  });
});

/**
 * Schedule Parser — stateless parser for the Composer's "repeat" phrases.
 *
 * Turns a short natural phrase into a {@link Schedule} (or null when the text
 * isn't a schedule). Powers both the typed `↻ …` / `#12x` chip in the smart
 * line and the schedule side-panel's free-text entry.
 *
 * Pure — no side effects, no API, no store access. Like `fastInputParser`, it
 * may read `new Date()` for the current year when resolving a bare month name.
 *
 * Grammar (case-insensitive, leading `↻`/`⟳` optional):
 *   recurring    "weekly" | "monthly" | "yearly"
 *                "every week|month|year"
 *                "<freq> until <date>"      (also "till"/"thru"/"through")
 *   installment  "#<n>x" | "<n>x" | "<n>×"                → count = n
 *                "#<total>/<n>" | "<total>/<n>"           → count = n, amountIsTotal, total
 *
 * The `#` overload: `#<digits>x|×` or `#<num>/<num>` is a schedule; `#word`
 * (anything else) is a tag and returns null so the fast parser keeps it.
 */

import type { Schedule, SeriesFrequency } from '../types';

export interface ScheduleParseResult {
  schedule: Schedule;
  /** The total captured from a `total/count` installment phrase, if any. */
  total?: string;
  /** The raw text that matched — lets the caller strip it from the input. */
  raw: string;
}

const FREQ_WORDS: Record<string, SeriesFrequency> = {
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
  annually: 'yearly',
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

const UNTIL_WORDS = new Set(['until', 'till', 'til', 'thru', 'through', 'to']);

const DATE_FULL_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const DATE_PARTIAL_RE = /^(\d{1,2})[/.-](\d{1,2})$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate(); // month1 is 1-indexed; day 0 = last of prev
}

/**
 * Resolve an "until" target to an ISO date. Accepts a month name (→ last day of
 * that month, this year or next if it's already past), DD/MM[/YYYY], or an ISO
 * date. Day-first for partial/full numeric dates (matches `fastInputParser`).
 */
function resolveUntil(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  const first = tokens[0].toLowerCase();

  // Month name → end of that month (this year, or next year if already past).
  const month = MONTHS[first];
  if (month !== undefined) {
    const now = new Date();
    const year =
      month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
    return `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`;
  }

  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(tokens[0])) return tokens[0];

  // DD/MM/YYYY — day-first (matches fastInputParser's default for this app).
  const full = tokens[0].match(DATE_FULL_RE);
  if (full) {
    const day = parseInt(full[1], 10);
    const mon = parseInt(full[2], 10);
    return `${full[3]}-${pad(mon)}-${pad(day)}`;
  }

  // DD/MM (day-first), current year
  const partial = tokens[0].match(DATE_PARTIAL_RE);
  if (partial) {
    const a = parseInt(partial[1], 10);
    const b = parseInt(partial[2], 10);
    const y = new Date().getFullYear();
    return `${y}-${pad(b)}-${pad(a)}`;
  }

  return null;
}

/** Strip leading recurring glyphs (↻ / ⟳ / 🔁) and surrounding space. */
function stripGlyph(text: string): string {
  return text.replace(/^(?:[\s↻⟳]|🔁)+/u, '').trim();
}

/**
 * Parse a schedule phrase. Returns null when the text is not a schedule
 * (e.g. a plain `#tag`, empty, or unrelated words).
 */
export function parseSchedule(text: string): ScheduleParseResult | null {
  const cleaned = stripGlyph(text);
  if (!cleaned) return null;

  const words = cleaned.split(/\s+/);

  // ── Installments — compact forms matched on the LAST token, so they work
  //    after narration ("Fast Shop 212,90*10"). ──
  const lastRaw = words[words.length - 1];
  const last = lastRaw.toLowerCase();

  // per-installment: <amount>*<count>  → N installments of <amount> EACH.
  const perMatch = last.match(/^#?([\d.,]+)\*(\d+)$/);
  if (perMatch) {
    const count = parseInt(perMatch[2], 10);
    if (count <= 0 || !/[1-9]/.test(perMatch[1])) return null;
    return {
      schedule: { kind: 'installment', count, amountIsTotal: false },
      total: perMatch[1],   // caller reads this as the per-installment amount
      raw: lastRaw,
    };
  }
  // total:count: <total>:<count>  → total split across N (each = ÷).
  // Uses ":" (not "/") so it never collides with a date like "15/03" — dates
  // own "/". e.g. 1000:10 → 10 installments of 100.
  const totalMatch = last.match(/^#?([\d.,]+):(\d+)$/);
  if (totalMatch) {
    const count = parseInt(totalMatch[2], 10);
    const total = totalMatch[1];
    if (count > 0 && /[1-9]/.test(total)) {
      return {
        schedule: { kind: 'installment', count, amountIsTotal: true },
        total,
        raw: lastRaw,
      };
    }
  }

  // ── Recurring — find a frequency word anywhere; consume it + an optional
  //    trailing "until <date>". ──
  let fi = -1;
  let freq: SeriesFrequency | undefined;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    if (w === 'every' && i + 1 < words.length && FREQ_WORDS[words[i + 1].toLowerCase()]) {
      freq = FREQ_WORDS[words[i + 1].toLowerCase()]; fi = i; break;
    }
    if (FREQ_WORDS[w]) { freq = FREQ_WORDS[w]; fi = i; break; }
  }
  if (freq === undefined || fi < 0) return null;

  const consumedStart = fi;
  const cursor = words[fi].toLowerCase() === 'every' ? fi + 2 : fi + 1;
  const schedule: Schedule = { kind: 'recurring', frequency: freq };

  // Optional "until <date>" immediately after the frequency.
  let consumedEnd = cursor;
  if (cursor < words.length && UNTIL_WORDS.has(words[cursor].toLowerCase())) {
    const until = resolveUntil(words.slice(cursor + 1));
    if (until) { schedule.until = until; consumedEnd = words.length; }
  }
  const raw = words.slice(consumedStart, consumedEnd).join(' ');
  return { schedule, raw };
}

/**
 * Render a Schedule back to a compact chip label, e.g. "monthly · until 2026-12-31"
 * or "12× · total". Presentation helper for the chip; caller formats dates/money.
 */
export function scheduleLabel(schedule: Schedule): string {
  if (schedule.kind === 'installment') {
    const n = schedule.count ?? 0;
    return schedule.amountIsTotal ? `${n}× · total` : `${n}×`;
  }
  const freq = schedule.frequency ?? 'monthly';
  return schedule.until ? `${freq} · until ${schedule.until}` : freq;
}

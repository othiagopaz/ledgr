/**
 * Fast Input Parser — stateless parser for the fast transaction input.
 *
 * Takes the full input text and cursor position, returns parsed tokens
 * and the currently active trigger (for dropdown display).
 *
 * The parser is pure — no side effects, no API calls, no store access.
 */

export interface ParsedToken {
  type: 'narration' | 'amount' | 'payee' | 'tag' | 'link' | 'date' | 'flag';
  value: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export type ActiveTriggerType = 'account' | 'payee' | 'tag' | 'link' | 'amount';

export interface ActiveTrigger {
  type: ActiveTriggerType;
  query: string;
  position: number;
}

export interface ParseResult {
  tokens: ParsedToken[];
  narration: string;
  activeTrigger: ActiveTrigger | null;
}

// Date keywords supported (English + Portuguese + shortcuts)
const DATE_KEYWORDS: Record<string, () => string> = {
  today: () => todayISO(),
  t: () => todayISO(),
  yesterday: () => offsetDays(-1),
  y: () => offsetDays(-1),
  tomorrow: () => offsetDays(1),
  hoje: () => todayISO(),
  ontem: () => offsetDays(-1),
  'amanhã': () => offsetDays(1),
  amanha: () => offsetDays(1),
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function offsetDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Date pattern: DD/MM, DD/MM/YYYY, MM/DD, MM/DD/YYYY
const DATE_FULL_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const DATE_PARTIAL_RE = /^(\d{1,2})[/.-](\d{1,2})$/;

/**
 * Detect a bare money token (no `$` needed), locale-aware. Returns the raw
 * money string as-typed (kept for display/pill), or null.
 *
 * Fires for any numeric token — a plain integer (`230`, `750`), a decimal
 * (`212,90`), or a thousands-grouped number (`1.234,56`). The old ambiguity
 * with dates is gone: dates own `/ . -` separators and are detected first, and
 * installment counts live inside the `*` / `:` tokens (parsed before this), so
 * a bare integer here is unambiguously the amount.
 *
 * `commaDecimal` (from the user's locale): true ⇒ `1.234,56` shape (`,` decimal,
 * `.` thousands); false ⇒ `1,234.56` shape.
 */
export function tryParseAmount(token: string, commaDecimal: boolean): string | null {
  // strip a leading currency-ish sign the user might type
  const t = token.trim();
  if (!t) return null;
  // must be digits + separators only, and contain at least one digit
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const dec = commaDecimal ? ',' : '.';
  const hasDecimal = t.includes(dec);
  // Decimal part (if present) must be the LAST separator and have 1–2 digits.
  if (hasDecimal) {
    const parts = t.split(dec);
    if (parts.length !== 2) return null;              // more than one decimal sep
    if (!/^\d{1,2}$/.test(parts[1])) return null;     // 1–2 decimal digits
    // integer part may carry thousands groups but no stray decimals
    if (parts[0].includes(dec)) return null;
  }
  // Reject a bare zero (0, 0,00) — not a meaningful amount.
  if (/^0[.,0]*$/.test(t)) return null;
  return t;
}

function tryParseDate(token: string): string | null {
  const lower = token.toLowerCase();

  // Check keywords
  const keywordFn = DATE_KEYWORDS[lower];
  if (keywordFn) return keywordFn();

  // Full date pattern
  const fullMatch = token.match(DATE_FULL_RE);
  if (fullMatch) {
    const a = parseInt(fullMatch[1]);
    const b = parseInt(fullMatch[2]);
    const year = fullMatch[3];
    // If first number > 12, it's day-first unambiguously
    if (a > 12) {
      return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    // Default to day-first (locale-aware would need store access, but parser is pure;
    // caller can override). Most users of this app use dd/mm.
    return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }

  // Partial date pattern (DD/MM or MM/DD)
  const partialMatch = token.match(DATE_PARTIAL_RE);
  if (partialMatch) {
    const a = parseInt(partialMatch[1]);
    const b = parseInt(partialMatch[2]);
    const year = new Date().getFullYear();
    // Default day-first
    return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parse the fast input text.
 *
 * Trigger characters: $ > @ # ^ !
 * Everything else that isn't a recognized date keyword/pattern is narration.
 */
export interface ParseOpts {
  /** User locale uses comma as decimal (e.g. pt/BRL). Enables bare `212,90`. */
  commaDecimal?: boolean;
}

export function parseInput(text: string, cursorPosition: number, opts: ParseOpts = {}): ParseResult {
  const tokens: ParsedToken[] = [];
  const narrationParts: string[] = [];
  let activeTrigger: ActiveTrigger | null = null;
  const commaDecimal = opts.commaDecimal ?? false;

  // Split into whitespace-delimited tokens, preserving positions
  const tokenSegments = splitWithPositions(text);

  for (const seg of tokenSegments) {
    const { word, start, end } = seg;
    const cursorInToken = cursorPosition >= start && cursorPosition <= end;

    // --- Trigger: $ (amount) ---
    if (word.startsWith('$')) {
      const value = word.slice(1);
      if (cursorInToken && value === '') {
        // User just typed $, waiting for amount
        activeTrigger = { type: 'amount', query: '', position: start };
      } else if (cursorInToken) {
        // Still typing the amount
        activeTrigger = { type: 'amount', query: value, position: start };
      }
      if (value) {
        tokens.push({ type: 'amount', value, raw: word, startIndex: start, endIndex: end });
      }
      continue;
    }

    // --- Trigger: > (account) ---
    if (word.startsWith('>')) {
      const query = word.slice(1);
      if (cursorInToken) {
        activeTrigger = { type: 'account', query, position: start };
      }
      // Don't push a token — accounts are selected from dropdown, not typed
      continue;
    }

    // --- Trigger: @ (payee) ---
    if (word.startsWith('@')) {
      const query = word.slice(1);
      if (cursorInToken) {
        activeTrigger = { type: 'payee', query, position: start };
      }
      // Don't push token — payee will be added as pill after selection
      continue;
    }

    // --- Trigger: # (tag) ---
    if (word.startsWith('#')) {
      const query = word.slice(1);
      if (cursorInToken) {
        activeTrigger = { type: 'tag', query, position: start };
      }
      if (query) {
        tokens.push({ type: 'tag', value: query, raw: word, startIndex: start, endIndex: end });
      }
      continue;
    }

    // --- Trigger: ^ (link) ---
    if (word.startsWith('^')) {
      const value = word.slice(1);
      if (cursorInToken) {
        activeTrigger = { type: 'link', query: value, position: start };
      }
      if (value) {
        tokens.push({ type: 'link', value, raw: word, startIndex: start, endIndex: end });
      }
      continue;
    }

    // --- Trigger: ! (flag toggle) ---
    if (word === '!') {
      tokens.push({ type: 'flag', value: '!', raw: word, startIndex: start, endIndex: end });
      continue;
    }

    // --- Date detection (before bare-amount, so 12/08 stays a date) ---
    const dateValue = tryParseDate(word);
    if (dateValue) {
      tokens.push({ type: 'date', value: dateValue, raw: word, startIndex: start, endIndex: end });
      continue;
    }

    // --- Bare amount (no $), locale-aware: 212,90 / 1.234,56 / 55.00 ---
    const bareAmount = tryParseAmount(word, commaDecimal);
    if (bareAmount) {
      tokens.push({ type: 'amount', value: bareAmount, raw: word, startIndex: start, endIndex: end });
      continue;
    }

    // --- Everything else is narration ---
    narrationParts.push(word);
  }

  return {
    tokens,
    narration: narrationParts.join(' '),
    activeTrigger,
  };
}

interface TokenSegment {
  word: string;
  start: number;
  end: number;
}

function splitWithPositions(text: string): TokenSegment[] {
  const segments: TokenSegment[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    segments.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return segments;
}

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
export function parseInput(text: string, cursorPosition: number): ParseResult {
  const tokens: ParsedToken[] = [];
  const narrationParts: string[] = [];
  let activeTrigger: ActiveTrigger | null = null;

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

    // --- Date detection ---
    const dateValue = tryParseDate(word);
    if (dateValue) {
      tokens.push({ type: 'date', value: dateValue, raw: word, startIndex: start, endIndex: end });
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

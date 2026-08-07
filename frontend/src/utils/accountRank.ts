/**
 * Account ranking + fuzzy matching for the Composer's `>` route picker (and any
 * account autocomplete). Pure — no I/O, no store. Usage counts / recents /
 * payee-usual are passed in by the caller (computed client-side from loaded
 * transactions), so this stays testable and backend-free.
 */

export type AccountKind = 'exp' | 'pay' | 'inc' | 'ast' | 'eq';

/** Beancount root → a coarse kind, for the coloured swatch + light weighting. */
export function accountKind(name: string): AccountKind {
  const root = name.split(':')[0];
  if (root === 'Expenses') return 'exp';
  if (root === 'Income') return 'inc';
  if (root === 'Liabilities') return 'pay';
  if (root === 'Equity') return 'eq';
  // Assets split: bank/cash-ish read as "payment", the rest as generic asset.
  if (root === 'Assets') return /bank|cash|checking|wallet|card/i.test(name) ? 'pay' : 'ast';
  return 'ast';
}

export function leafName(name: string): string {
  const p = name.split(':');
  return p[p.length - 1];
}

export function parentPath(name: string): string {
  const p = name.split(':');
  return p.length > 1 ? p.slice(0, -1).join(':') + ':' : '';
}

export interface FuzzyHit {
  first: number;   // index in the full name of the first matched char
  last: number;    // index of the last matched char
  score: number;   // lower is better
}

/**
 * Subsequence fuzzy match: every char of `query` (spaces/colons ignored) must
 * appear in order in `name`. Returns null on no match, else a hit with a score
 * that prefers matches concentrated in the leaf, contiguous, and early.
 */
export function fuzzyMatch(query: string, name: string): FuzzyHit | null {
  const q = query.toLowerCase().replace(/[\s:]/g, '');
  if (!q) return { first: -1, last: -1, score: 0 };
  const t = name.toLowerCase();
  let qi = 0, first = -1, last = -1, gaps = 0, prev = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (first < 0) first = i;
      last = i;
      if (prev >= 0 && i - prev > 1) gaps++;
      prev = i;
      qi++;
    }
  }
  if (qi < q.length) return null;
  const leafStart = name.length - leafName(name).length;
  const inLeaf = first >= leafStart;
  const score = (inLeaf ? 0 : 40) + gaps * 3 + first * 0.2;
  return { first, last, score };
}

export interface RankInput {
  query: string;
  accounts: string[];
  usage: Map<string, number>;     // how often the user posts to each account
  recents: string[];              // MRU this session (index 0 = most recent)
  usual?: string | null;          // payee's usual account (from /api/suggestions)
  preferPayment?: boolean;        // choosing the "to" side → float payment accounts
  limit?: number;
}

export interface RankedAccount {
  name: string;
  kind: AccountKind;
  hit: FuzzyHit;
  used: number;
  tag: 'usual' | 'recent' | null;
}

/**
 * Rank accounts for the current query. Order: payee-usual / default first,
 * then recents, then personal frequency, with fuzzy score as the base. Returns
 * at most `limit` (default 8).
 */
export function rankAccounts(input: RankInput): RankedAccount[] {
  const { query, accounts, usage, recents, usual, preferPayment, limit = 8 } = input;
  const scored: { row: RankedAccount; score: number }[] = [];
  for (const name of accounts) {
    const hit = fuzzyMatch(query, name);
    if (!hit) continue;
    const used = usage.get(name) ?? 0;
    const kind = accountKind(name);
    let boost = 0;
    let tag: RankedAccount['tag'] = null;
    if (usual && name === usual) { boost -= 100; tag = 'usual'; }
    else {
      const ri = recents.indexOf(name);
      if (ri >= 0) { boost -= 30 - ri; tag = 'recent'; }
    }
    if (preferPayment && kind === 'pay') boost -= 8;
    const score = hit.score + boost - used * 0.15;
    scored.push({ row: { name, kind, hit, used, tag }, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map(s => s.row);
}

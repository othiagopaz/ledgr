import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAccountNames, fetchPayees, fetchTags, fetchSuggestions,
  addTransaction, editTransaction, fetchTransactions, deleteTransaction,
  createSeries, extendSeries, cancelSeries, reviseSeries, fetchSeries,
} from "../api/client";
import { useAppStore } from "../stores/appStore";
import { parseInput } from "../utils/fastInputParser";
import { parseSchedule } from "../utils/scheduleParser";
import { parseSmartDate, today } from "../utils/dateUtils";
import { formatAmount } from "../utils/format";
import { rankAccounts, accountKind, leafName, parentPath, type RankedAccount } from "../utils/accountRank";
import InlineAutocomplete from "./InlineAutocomplete";
import { CalendarIcon } from "./icons";
import type {
  Transaction, Schedule, SeriesFrequency, SeriesSummary, PostingSpec,
} from "../types";

interface ComposerProps {
  onMutated: () => void;
}

// ── Local model ───────────────────────────────────────────────────────────

interface Row {
  id: number;
  account: string;
  amount: string;   // "" = auto-balance
  currency: string;
}

interface Pill {
  type: 'payee' | 'amount' | 'accounts' | 'date' | 'tag' | 'link' | 'flag';
  label: string;
  value: string;
  secondary?: string;
}

let _id = 7000;
const nextId = () => _id++;

function shortName(account: string): string {
  const parts = account.split(':');
  return parts.length > 2 ? parts.slice(-2).join(':') : parts[parts.length - 1];
}

const swClass = (acc: string) =>
  acc.startsWith('Expenses') ? 'sw-exp'
  : acc.startsWith('Income') ? 'sw-inc'
  : 'sw-pay';

/** Friendly label for a date pill: today/yesterday/tomorrow, else DD/MM[/YY]. */
function dateChipLabel(iso: string): string {
  const t = today();
  if (iso === t) return 'today';
  const d = new Date(iso + 'T00:00:00');
  const ref = new Date(t + 'T00:00:00');
  const diff = Math.round((d.getTime() - ref.getTime()) / 86400000);
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  const [y, m, day] = iso.split('-');
  return d.getFullYear() === ref.getFullYear() ? `${day}/${m}` : `${day}/${m}/${y.slice(2)}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Composer({ onMutated }: ComposerProps) {
  const txn = useAppStore((s) => s.composerTxn);
  const seedSeries = useAppStore((s) => s.composerSeries);
  const scope = useAppStore((s) => s.composerScope);
  const initial = useAppStore((s) => s.composerInitial);
  const escalateToSeries = useAppStore((s) => s.escalateToSeries);
  const openComposer = useAppStore((s) => s.openComposer);
  const close = useAppStore((s) => s.closeComposer);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const locale = useAppStore((s) => s.locale);
  const defaultPaymentAccount = useAppStore((s) => s.defaultPaymentAccount);
  const queryClient = useQueryClient();

  // Locale uses comma as the decimal separator? (mirrors parseSmartDate's
  // day-first heuristic — pt/de/es/fr or BRL/EUR.) Drives bare-amount parsing.
  const commaDecimal = useMemo(() =>
    !!(locale?.startsWith('pt') || locale?.startsWith('de') || locale?.startsWith('es')
      || locale?.startsWith('fr') || operatingCurrency === 'BRL' || operatingCurrency === 'EUR'),
    [locale, operatingCurrency]);

  const isEditingTxn = !!txn;
  const isEditingSeries = !!seedSeries || scope === 'series';
  const editing = isEditingTxn || isEditingSeries;

  // The series being edited: seeded directly, or looked up from the txn's metadata.
  const seriesId = seedSeries?.series_id
    || (txn?.metadata?.['ledgr-series'] as string | undefined) || null;
  const seriesTypeMeta = (txn?.metadata?.['ledgr-series-type'] as string | undefined)
    || seedSeries?.type || null;
  const inSeries = !!seriesId;

  const seriesListQ = useQuery({
    queryKey: ["series", "combined"],
    queryFn: () => fetchSeries("combined"),
    enabled: inSeries,
  });
  // Prefer the LIVE list (so a revise/extend/cancel refresh is reflected in the
  // wing); fall back to the snapshot passed at open until the query resolves.
  const resolvedSeries: SeriesSummary | null =
    seriesListQ.data?.series.find((s) => s.series_id === seriesId) || seedSeries || null;

  // Per-occurrence transactions for the series (for the occurrence list). Fetched
  // by a series account, filtered client-side to this series' metadata.
  const occAccount = resolvedSeries?.account_to || resolvedSeries?.account_from
    || resolvedSeries?.postings.find(p => p.account)?.account || null;
  const occQ = useQuery({
    queryKey: ["transactions", "series-occ", occAccount],
    queryFn: () => fetchTransactions(occAccount!, undefined, undefined, "combined"),
    enabled: inSeries && !!occAccount,
  });
  const occurrences: Transaction[] = (occQ.data?.transactions || [])
    .filter(t => t.metadata?.['ledgr-series'] === seriesId)
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── smart line + pills ────────────────────────────────────────────────────
  const [inputValue, setInputValue] = useState("");
  const [pills, setPills] = useState<Pill[]>(() => seedPills(txn));
  const [ghostPills, setGhostPills] = useState<Pill[]>([]);
  const [dropdownItems, setDropdownItems] = useState<string[]>([]);
  const [dropdownActiveIdx, setDropdownActiveIdx] = useState(-1);
  const [dropdownLabel, setDropdownLabel] = useState<string | null>(null);

  // ── the `>` route picker: build "from → to" in one fluid motion ──────────
  // routeStage drives the dropdown; from/to hold picked accounts; flip swaps
  // which side is the credit. routeQuery is the live fuzzy filter.
  const [routeStage, setRouteStage] = useState<'idle' | 'from' | 'to'>('idle');
  const [routeFrom, setRouteFrom] = useState<string | null>(null);
  const [routeTo, setRouteTo] = useState<string | null>(null);
  const [routeFlip, setRouteFlip] = useState(false);
  const [routeQuery, setRouteQuery] = useState("");
  const [routeActive, setRouteActive] = useState(0);
  const recentAccountsRef = useRef<string[]>([]);   // MRU this session
  const ddListRef = useRef<HTMLDivElement>(null);

  // ── split grid (advanced) ───────────────────────────────────────────────
  const [split, setSplit] = useState<boolean>(() =>
    initial === 'split' || (txn ? txn.postings.length > 2 : false)
  );
  const [rows, setRows] = useState<Row[]>(() => seedRows(txn, seedSeries, operatingCurrency));

  // ── header fields (Details) ──────────────────────────────────────────────
  const [date, setDate] = useState(() => txn?.date || today());
  const [flag, setFlag] = useState<'*' | '!'>(() => (txn?.flag === '!' ? '!' : '*'));
  const [payee, setPayee] = useState(() => txn?.payee || seedSeries?.payee || "");
  const [narration, setNarration] = useState(() => txn?.narration || seedSeries?.narration || "");
  const [tags, setTags] = useState<string[]>(() => txn?.tags || []);
  const [links, setLinks] = useState<string[]>(() => txn?.links || []);

  // ── schedule ───────────────────────────────────────────────────────────
  const [schedule, setSchedule] = useState<Schedule | null>(() => seedSchedule(resolvedSeries, initial));
  const [scheduleTotal, setScheduleTotal] = useState<string>("");   // amount_is_total value

  // ── wings ──────────────────────────────────────────────────────────────
  const [detailsOpen, setDetailsOpen] = useState<boolean>(() => split || isEditingTxn);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseCount, setReviseCount] = useState<number>(resolvedSeries?.total ?? 12);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [continueMode, setContinueMode] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);   // transient success toast
  const inputRef = useRef<HTMLInputElement>(null);

  // Refresh series + occurrence data in place and show a success toast (used by
  // series-edit actions so the user SEES the change instead of a silent close).
  function refreshSeries(msg: string) {
    queryClient.invalidateQueries({ queryKey: ["series"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    onMutated();
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  }

  const accountNamesQ = useQuery({ queryKey: ["account-names"], queryFn: fetchAccountNames });
  const payeesQ = useQuery({ queryKey: ["payees"], queryFn: fetchPayees });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: fetchTags });
  const accountNames = useMemo(() => accountNamesQ.data?.accounts || [], [accountNamesQ.data]);
  const payeeList = useMemo(() => payeesQ.data?.payees || [], [payeesQ.data]);
  const tagList = useMemo(() => tagsQ.data?.tags || [], [tagsQ.data]);

  // Personal account-usage map for ranking the `>` picker — built once from all
  // transactions (client-side, React-Query cached; ~one page of JSON). Counts
  // how often each account is posted to.
  const allTxnsQ = useQuery({
    queryKey: ["transactions", "all-for-usage"],
    queryFn: () => fetchTransactions(undefined, undefined, undefined, "combined"),
    staleTime: 60_000,
  });
  const accountUsage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of allTxnsQ.data?.transactions || [])
      for (const p of t.postings) m.set(p.account, (m.get(p.account) ?? 0) + 1);
    return m;
  }, [allTxnsQ.data]);

  // The payee's usual expense account (populated by suggestForPayee), used to
  // pre-highlight the `from` slot.
  const [payeeUsual, setPayeeUsual] = useState<string | null>(null);
  const defaultPay = useMemo(() => {
    // The most-used payment-kind account, as the `to` default when no rule set.
    if (defaultPaymentAccount) return defaultPaymentAccount;
    let best: string | null = null, bestN = -1;
    for (const [name, n] of accountUsage)
      if (accountKind(name) === 'pay' && n > bestN) { best = name; bestN = n; }
    return best;
  }, [defaultPaymentAccount, accountUsage]);

  // Ranked results for the active route slot.
  const routeResults = useMemo<RankedAccount[]>(() => {
    if (routeStage === 'idle') return [];
    return rankAccounts({
      query: routeQuery,
      accounts: accountNames,
      usage: accountUsage,
      recents: recentAccountsRef.current,
      usual: routeStage === 'from' ? payeeUsual : (routeStage === 'to' ? defaultPay : null),
      preferPayment: routeStage === 'to',
    });
  }, [routeStage, routeQuery, accountNames, accountUsage, payeeUsual, defaultPay]);

  // Keep schedule + grid in sync once the series summary resolves (edit-from-txn,
  // series scope). Only backfills when nothing has been entered yet.
  const seededFromSeries = useRef(false);
  useEffect(() => {
    if (resolvedSeries && schedule === null) {
      setSchedule(seedSchedule(resolvedSeries, null));
      setReviseCount(resolvedSeries.total);
    }
    if (resolvedSeries && scope === 'series' && !isEditingTxn && !seededFromSeries.current) {
      seededFromSeries.current = true;
      setRows(seedRows(null, resolvedSeries, operatingCurrency));
      if (!payee) setPayee(resolvedSeries.payee || "");
      if (!narration) setNarration(resolvedSeries.narration || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSeries, scope]);

  useEffect(() => { if (!editing) inputRef.current?.focus(); }, [editing]);

  // Keep the date pill in sync with the `date` field (typed token, Details edit,
  // or the seeded today). One home for the pill so all three routes agree.
  useEffect(() => {
    if (isEditingTxn) return;   // editing an occurrence shows its date in Details, no pill
    const iso = date ? parseSmartDate(date) : '';
    setPills(prev => {
      const i = prev.findIndex(p => p.type === 'date');
      if (!iso) return i >= 0 ? prev.filter(p => p.type !== 'date') : prev;
      const pill: Pill = { type: 'date', label: dateChipLabel(iso), value: iso };
      if (i >= 0) {
        if (prev[i].value === iso) return prev;   // no-op — avoid churn
        return [...prev.slice(0, i), pill, ...prev.slice(i + 1)];
      }
      return [pill, ...prev];
    });
  }, [date, isEditingTxn]);

  // Occurrence scope: editing one txn that belongs to a series. Drives the
  // "editing this one · edit entire series →" banner, which only makes sense
  // when there IS a series to escalate to.
  const occScope = isEditingTxn && inSeries && scope !== 'series';
  // Series scope: editing the whole series.
  const seriesScope = isEditingSeries && !occScope;
  // Save routing: ANY open-with-a-txn that isn't a whole-series edit is an edit
  // of that transaction (PUT), series member or not. Without this, editing a
  // plain multi-posting txn fell through to saveTransaction() and POSTed a
  // duplicate instead of updating the original.
  const txnEditScope = isEditingTxn && !seriesScope;

  // ── derived postings (for preview + save) ──────────────────────────────
  const postings: Row[] = useMemo(() => {
    if (split || editing) return rows;
    // Level 0: build the two postings from pills — folding in any residual token
    // still sitting in the input (e.g. "$12" the user never followed with a space),
    // so nothing is silently dropped on Save.
    const residual = parseInput(inputValue, inputValue.length, { commaDecimal });
    const residualAmt = residual.tokens.find(t => t.type === 'amount')?.value;
    const amt = pills.find(p => p.type === 'amount') ?? ghostPills.find(p => p.type === 'amount');
    const acc = pills.find(p => p.type === 'accounts') ?? ghostPills.find(p => p.type === 'accounts');
    const amtVal = (amt?.value || residualAmt) || '';
    const out: Row[] = [];
    if (acc) {
      out.push({ id: 1, account: acc.value, amount: amtVal, currency: operatingCurrency });
      out.push({ id: 2, account: acc.secondary || defaultPaymentAccount || '', amount: '', currency: operatingCurrency });
    } else if (amtVal) {
      // Amount but no route yet — a single account-less row so the preview can
      // show the amount / installment breakdown before accounts are picked.
      out.push({ id: 1, account: '', amount: amtVal, currency: operatingCurrency });
    }
    return out;
  }, [split, editing, rows, pills, ghostPills, inputValue, operatingCurrency, defaultPaymentAccount, commaDecimal]);

  const balance = useMemo(() => computeBalance(postings), [postings]);

  // ── dropdown / trigger handling ──────────────────────────────────────────
  // `@` and `#` use the simple dropdown; `>` hands off to the route picker
  // (routeStage), which owns its own ranked list.
  const updateDropdown = useCallback((text: string, cursor: number) => {
    const trigger = parseInput(text, cursor).activeTrigger;
    if (!trigger) { setDropdownItems([]); setDropdownLabel(null); return; }
    if (trigger.type === 'account') {
      // Enter the route picker: strip the ">" token, start choosing FROM.
      startRoute();
      return;
    }
    let items: string[] = [];
    let label: string | null = null;
    switch (trigger.type) {
      case 'payee':
        items = payeeList.filter(p => p.toLowerCase().includes(trigger.query.toLowerCase())).slice(0, 15);
        label = "Payee"; break;
      case 'tag':
        items = tagList.filter(t => t.toLowerCase().includes(trigger.query.toLowerCase())).slice(0, 15);
        label = "Tag"; break;
      default:
        setDropdownItems([]); setDropdownLabel(null); return;
    }
    setDropdownItems(items); setDropdownLabel(label); setDropdownActiveIdx(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeList, tagList]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setInputValue(text);
    // Schedule phrases (↻ monthly / 212,90*10 / 1000:10) commit on SPACE via
    // processInlineTokens — not on every keystroke — so typing "*1" then "0"
    // doesn't prematurely fire at count 1.
    updateDropdown(text, e.target.selectionStart || text.length);
  }

  function removeTrigger(ch: string) {
    const re = new RegExp(`\\${ch}\\S*\\s?`);
    setInputValue(prev => prev.replace(re, '').trim());
  }

  // Upsert the amount pill (used by bare-amount detection and the `*` schedule).
  function setAmountPill(value: string) {
    const pill: Pill = { type: 'amount', label: `$ ${value}`, value };
    setPills(prev => {
      const i = prev.findIndex(p => p.type === 'amount');
      return i >= 0 ? [...prev.slice(0, i), pill, ...prev.slice(i + 1)] : [...prev, pill];
    });
  }

  // ── route picker (`>`) ────────────────────────────────────────────────────
  function startRoute() {
    // Pull the ">" out of the free text; seed from an existing accounts pill.
    removeTrigger('>');
    const existing = pills.find(p => p.type === 'accounts');
    setRouteFrom(existing?.value ?? null);
    setRouteTo(existing?.secondary ?? null);
    setRouteFlip(false);
    setRouteStage('from');
    setRouteQuery(''); setRouteActive(0);
    setDropdownItems([]); setDropdownLabel(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function noteRecentAccount(a: string) {
    const r = recentAccountsRef.current.filter(x => x !== a);
    r.unshift(a);
    recentAccountsRef.current = r.slice(0, 6);
  }

  function pickRoute(name: string) {
    noteRecentAccount(name);
    if (routeStage === 'from') {
      setRouteFrom(name);
      if (!routeTo) { setRouteStage('to'); setRouteQuery(''); setRouteActive(0); }
      else finishRoute(name, routeTo);
    } else if (routeStage === 'to') {
      setRouteTo(name);
      finishRoute(routeFrom, name);
    }
  }

  // Build/replace the accounts pill. `from` is the expense/source (the pill's
  // primary), `to` is the payment/counter (secondary). Flip swaps them.
  function finishRoute(from: string | null, to: string | null) {
    const primary = routeFlip ? to : from;
    const secondary = routeFlip ? from : to;
    if (primary) {
      const pill: Pill = {
        type: 'accounts',
        label: `${shortName(primary)} → ${secondary ? shortName(secondary) : '…'}`,
        value: primary, secondary: secondary || '',
      };
      const i = pills.findIndex(p => p.type === 'accounts');
      setPills(prev => i >= 0 ? [...prev.slice(0, i), pill, ...prev.slice(i + 1)] : [...prev, pill]);
    }
    setRouteStage('idle'); setRouteQuery(''); setRouteActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelRoute() {
    setRouteStage('idle'); setRouteFrom(null); setRouteTo(null);
    setRouteFlip(false); setRouteQuery(''); setRouteActive(0);
    inputRef.current?.focus();
  }

  function selectDropdownItem(item: string) {
    const trigger = parseInput(inputValue, inputRef.current?.selectionStart || inputValue.length).activeTrigger;
    if (!trigger) return;
    if (trigger.type === 'payee') {
      const existing = pills.findIndex(p => p.type === 'payee');
      const pill: Pill = { type: 'payee', label: `@ ${item}`, value: item };
      setPills(prev => existing >= 0 ? [...prev.slice(0, existing), pill, ...prev.slice(existing + 1)] : [...prev, pill]);
      removeTrigger('@');
      setPayee(item);
      void suggestForPayee(item);
    } else if (trigger.type === 'tag') {
      if (!pills.some(p => p.type === 'tag' && p.value === item)) {
        setPills(prev => [...prev, { type: 'tag', label: `# ${item}`, value: item }]);
        setTags(prev => prev.includes(item) ? prev : [...prev, item]);
      }
      removeTrigger('#');
    }
    setDropdownItems([]); setDropdownLabel(null);
    inputRef.current?.focus();
  }

  async function suggestForPayee(p: string) {
    try {
      const s = await fetchSuggestions(p);
      if (s.account) setPayeeUsual(s.account);   // pre-highlights the route's `from`
      const g: Pill[] = [];
      if (s.account && !pills.some(x => x.type === 'accounts')) {
        g.push({ type: 'accounts', label: shortName(s.account), value: s.account, secondary: defaultPaymentAccount || '' });
      }
      if (s.amount && !pills.some(x => x.type === 'amount')) {
        g.push({ type: 'amount', label: `$ ${s.amount}`, value: s.amount });
      }
      setGhostPills(g);
    } catch { /* ignore */ }
  }

  function acceptGhost(g: Pill) {
    setPills(prev => [...prev, g]);
    setGhostPills(prev => prev.filter(x => x !== g));
  }

  function processInlineTokens() {
    // Schedule phrases commit here (on space): ↻ monthly / 212,90*10 / 1000:10.
    // Attaching opens the Repeat wing so the user sees + can adjust it.
    const sched = parseSchedule(inputValue);
    if (sched) {
      setSchedule(sched.schedule);
      if (sched.total) {
        // Both compact forms put a number into the amount pill so the posting
        // grid, balance, and the ÷ preview all read it. The `amountIsTotal` flag
        // (set by parseSchedule) decides the meaning: `*` = per-installment,
        // `:` = the whole total to divide across N.
        setAmountPill(sched.total);
        setScheduleTotal(sched.total);
      }
      setInputValue(prev => prev.slice(0, prev.length - sched.raw.length).replace(/[↻⟳🔁\s]+$/u, '').trim());
      setRepeatOpen(true);
      setDropdownItems([]); setDropdownLabel(null);
      return;
    }
    const result = parseInput(inputValue, inputValue.length, { commaDecimal });
    if (result.activeTrigger?.type === 'payee' && result.activeTrigger.query) {
      const name = result.activeTrigger.query;
      const existing = pills.findIndex(p => p.type === 'payee');
      const pill: Pill = { type: 'payee', label: `@ ${name}`, value: name };
      setPills(prev => existing >= 0 ? [...prev.slice(0, existing), pill, ...prev.slice(existing + 1)] : [...prev, pill]);
      removeTrigger('@'); setPayee(name); void suggestForPayee(name);
    }
    for (const token of result.tokens) {
      if (token.type === 'amount') {
        const existing = pills.findIndex(p => p.type === 'amount');
        const pill: Pill = { type: 'amount', label: `$ ${token.value}`, value: token.value };
        setPills(prev => existing >= 0 ? [...prev.slice(0, existing), pill, ...prev.slice(existing + 1)] : [...prev, pill]);
        setInputValue(prev => prev.replace(token.raw, '').replace(/\s+/g, ' ').trim());
      } else if (token.type === 'date') {
        // The date pill is owned by the `date`→pill sync effect; just set date.
        setDate(token.value);
        setInputValue(prev => prev.replace(token.raw, '').replace(/\s+/g, ' ').trim());
      } else if (token.type === 'flag') {
        const existing = pills.findIndex(p => p.type === 'flag');
        if (existing >= 0) { setPills(prev => prev.filter((_, i) => i !== existing)); setFlag('*'); }
        else { setPills(prev => [...prev, { type: 'flag', label: '! planned', value: '!' }]); setFlag('!'); }
        setInputValue(prev => prev.replace('!', '').replace(/\s+/g, ' ').trim());
      } else if (token.type === 'link') {
        if (!pills.some(p => p.type === 'link' && p.value === token.value)) {
          setPills(prev => [...prev, { type: 'link', label: `^ ${token.value}`, value: token.value }]);
          setLinks(prev => prev.includes(token.value) ? prev : [...prev, token.value]);
        }
        setInputValue(prev => prev.replace(token.raw, '').replace(/\s+/g, ' ').trim());
      } else if (token.type === 'tag') {
        if (!pills.some(p => p.type === 'tag' && p.value === token.value)) {
          setPills(prev => [...prev, { type: 'tag', label: `# ${token.value}`, value: token.value }]);
          setTags(prev => prev.includes(token.value) ? prev : [...prev, token.value]);
        }
        setInputValue(prev => prev.replace(token.raw, '').replace(/\s+/g, ' ').trim());
      }
    }
  }

  function handleLineKeyDown(e: React.KeyboardEvent) {
    // ── route picker owns the keyboard while active ──
    if (routeStage !== 'idle') {
      const list = routeResults;
      if (e.key === 'ArrowDown') { e.preventDefault(); setRouteActive(i => Math.min(i + 1, Math.max(0, list.length - 1))); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setRouteActive(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (list[routeActive]) pickRoute(list[routeActive].name); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (routeStage === 'from') { if (list[routeActive]) pickRoute(list[routeActive].name); }
        else if (list[routeActive]) pickRoute(list[routeActive].name);
        return;
      }
      if (e.key === '>') { e.preventDefault(); setRouteFlip(f => !f); return; }
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        if (routeQuery) setRouteQuery('');
        else if (routeStage === 'to') { setRouteStage('from'); }
        else cancelRoute();
        return;
      }
      if (e.key === 'Backspace') { e.preventDefault(); setRouteQuery(q => q.slice(0, -1)); setRouteActive(0); return; }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setRouteQuery(q => q + e.key); setRouteActive(0); return; }
      return;
    }
    if (dropdownItems.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setDropdownActiveIdx(i => Math.min(i + 1, dropdownItems.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setDropdownActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && dropdownActiveIdx >= 0) { e.preventDefault(); e.stopPropagation(); selectDropdownItem(dropdownItems[dropdownActiveIdx]); return; }
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        setDropdownItems([]); setDropdownLabel(null); return;
      }
    }
    if (e.key === ' ') processInlineTokens();
    if (e.key === 'Enter' && dropdownItems.length === 0) {
      const trg = parseInput(inputValue, inputRef.current?.selectionStart || inputValue.length).activeTrigger;
      if (trg?.type === 'payee' && trg.query) {
        e.preventDefault(); e.stopPropagation();
        const name = trg.query;
        setPills(prev => [...prev.filter(p => p.type !== 'payee'), { type: 'payee', label: `@ ${name}`, value: name }]);
        removeTrigger('@'); setPayee(name); void suggestForPayee(name);
      }
    }
  }

  function removePill(i: number) {
    const p = pills[i];
    setPills(prev => prev.filter((_, idx) => idx !== i));
    if (p.type === 'tag') setTags(prev => prev.filter(t => t !== p.value));
    if (p.type === 'link') setLinks(prev => prev.filter(l => l !== p.value));
    if (p.type === 'flag') setFlag('*');
  }

  // ── grid helpers ────────────────────────────────────────────────────────
  function updateRow(i: number, field: keyof Row, value: string) {
    setRows(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'account' && value && i === prev.length - 1) {
        next.push({ id: nextId(), account: '', amount: '', currency: operatingCurrency });
      }
      return next;
    });
  }
  function addRow() { setRows(prev => [...prev, { id: nextId(), account: '', amount: '', currency: operatingCurrency }]); }
  function removeRow(i: number) { setRows(prev => prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)); }

  function enterSplit() {
    // Materialize current pill-derived postings into editable rows.
    if (!split) {
      let seeded = postings.length >= 2 ? postings.map(p => ({ ...p, id: nextId() })) : rows;
      // If a total-form installment is active, the grid holds the WHOLE total on
      // the leading leg. Splitting means "edit the per-installment postings", so
      // divide each explicit amount by count and drop the total flag — the grid
      // now shows real per-installment values the user edits from there.
      if (schedule?.kind === 'installment' && schedule.amountIsTotal && schedule.count && schedule.count > 0) {
        const n = schedule.count;
        seeded = seeded.map(p => p.amount.trim()
          ? { ...p, amount: (Math.round((parseFloat(p.amount.replace(',', '.')) / n) * 100) / 100).toString() }
          : p);
        setSchedule({ ...schedule, amountIsTotal: false });
      }
      const withBlank = [...seeded];
      if (withBlank.length < 2 || withBlank[withBlank.length - 1].account) {
        withBlank.push({ id: nextId(), account: '', amount: '', currency: operatingCurrency });
      }
      setRows(withBlank);
    }
    setSplit(true); setDetailsOpen(true);
  }

  // ── save ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving) return;
    setError(null); setSaving(true);
    try {
      if (seriesScope && resolvedSeries) return await saveSeriesEdit();
      if (txnEditScope) {
        // We opened on an existing txn: this must be an UPDATE. If the lineno
        // is missing we cannot address the entry — surface that instead of
        // silently falling through and POSTing a duplicate.
        if (txn?.lineno == null) {
          setError("Cannot edit: this transaction has no source line reference.");
          return;
        }
        return await saveOccurrence();
      }
      if (schedule) return await saveNewSeries();
      return await saveTransaction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function postingInputs() {
    const filled = postings.filter(p => p.account.trim());
    return filled.map(p => ({
      account: p.account,
      amount: p.amount ? toNum(p.amount) : null,
      currency: p.currency || operatingCurrency,
    }));
  }

  function validatePostings(): string | null {
    const filled = postings.filter(p => p.account.trim());
    if (filled.length < 2) return "At least 2 postings are required (use > to pick both accounts).";
    if (filled.filter(p => !p.amount.trim()).length > 1) return "At most one posting can be auto-balanced.";
    return null;
  }

  // In L0 the narration is the non-trigger text still in the input.
  function effectiveNarration(): string {
    if (narration.trim() || editing) return narration;
    return parseInput(inputValue, inputValue.length, { commaDecimal }).narration;
  }

  async function saveTransaction() {
    const v = validatePostings(); if (v) { setError(v); return; }
    const res = await addTransaction({
      date: parseSmartDate(date), flag, payee, narration: effectiveNarration(), tags, links,
      postings: postingInputs(),
    });
    if (!res.success) { setError(res.errors?.join(", ") || "Failed to add transaction."); return; }
    finish();
  }

  async function saveOccurrence() {
    const v = validatePostings(); if (v) { setError(v); return; }
    const res = await editTransaction({
      lineno: txn!.lineno!, date: parseSmartDate(date), flag, payee, narration, tags, links,
      postings: postingInputs(),
    });
    if (!res.success) { setError(res.errors?.join(", ") || "Failed to edit."); return; }
    finish(true);
  }

  async function saveNewSeries() {
    const v = validatePostings(); if (v) { setError(v); return; }
    const specs: PostingSpec[] = postings.filter(p => p.account.trim()).map(p => ({
      account: p.account.trim(),
      amount: p.amount.trim() ? p.amount.trim() : null,
      currency: (p.currency || operatingCurrency).trim() || null,
    }));
    const s = schedule!;
    const narr = effectiveNarration();
    if (!payee.trim() && !narr.trim()) { setError("Payee or narration is required."); return; }
    const common = { payee: payee.trim(), narration: narr.trim(), start_date: parseSmartDate(date), currency: operatingCurrency, postings: specs };
    let res;
    if (s.kind === 'recurring') {
      if (!s.until) { setError("Set an end date for the recurring series."); return; }
      // Normalize the end date to ISO — s.until may be a day-first string typed
      // straight into the Until field (e.g. "31/12/2026"); the backend expects ISO.
      res = await createSeries({ type: 'recurring', ...common, end_date: parseSmartDate(s.until), frequency: s.frequency || 'monthly' });
    } else {
      if (!s.count || s.count <= 0) { setError("Set the number of installments."); return; }
      res = await createSeries({ type: 'installment', ...common, count: s.count, amount_is_total: !!s.amountIsTotal });
    }
    if (!res.success) { setError(res.errors?.join(", ") || "Failed to create series."); return; }
    queryClient.invalidateQueries({ queryKey: ["series"] });
    finish();
  }

  async function saveSeriesEdit() {
    // Series scope save = revise the plan with the current schedule + postings.
    const specs: PostingSpec[] = postings.filter(p => p.account.trim()).map(p => ({
      account: p.account.trim(),
      amount: p.amount.trim() ? p.amount.trim() : null,
      currency: (p.currency || operatingCurrency).trim() || null,
    }));
    const s = schedule;
    const body = s?.kind === 'installment'
      ? { postings: specs.length >= 2 ? specs : undefined, count: s.count, amount_is_total: !!s.amountIsTotal }
      : { postings: specs.length >= 2 ? specs : undefined, frequency: s?.frequency, end_date: s?.until ? parseSmartDate(s.until) : undefined };
    const res = await reviseSeries(resolvedSeries!.series_id, body);
    if (!res.success) { setError(res.errors?.join(", ") || "Failed to save changes."); return; }
    refreshSeries(`Updated ${res.transactions_created ?? ''} pending`.trim());
  }

  function finish(closeAfter = false) {
    onMutated();
    if (closeAfter || !continueMode) { close(); return; }
    // Reset for the next entry — but KEEP the date so a run of same-day entries
    // reuses it (the user sets the date once). The date pill is re-seeded from
    // the kept date; everything else clears.
    setInputValue(""); setPills([{ type: 'date', label: dateChipLabel(date), value: date }]); setGhostPills([]);
    setRows(seedRows(null, null, operatingCurrency)); setSplit(false);
    setFlag('*'); setPayee(""); setNarration(""); setTags([]); setLinks([]);
    setSchedule(null); setScheduleTotal(""); setRepeatOpen(false); setDetailsOpen(false);
    setRouteStage('idle'); setRouteFrom(null); setRouteTo(null); setRouteFlip(false); setRouteQuery(''); setPayeeUsual(null);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // ── series actions (revise dialog / cancel / extend) ─────────────────────
  const [showCancel, setShowCancel] = useState(false);

  async function doCancel() {
    if (!resolvedSeries) return;
    setSaving(true); setError(null);
    try {
      const res = await cancelSeries(resolvedSeries.series_id);
      if (!res.success) { setError(res.errors?.join(", ") || "Failed to cancel."); return; }
      setShowCancel(false);
      refreshSeries(`Cancelled ${res.deleted ?? ''} pending`.trim());
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setSaving(false); }
  }

  async function doExtend(newEnd: string) {
    if (!resolvedSeries) return;
    setSaving(true); setError(null);
    try {
      const res = await extendSeries(resolvedSeries.series_id, { new_end_date: parseSmartDate(newEnd) });
      if (!res.success) { setError(res.errors?.join(", ") || "Failed to extend."); return; }
      refreshSeries(`Added ${res.transactions_created ?? ''} occurrence${res.transactions_created === 1 ? '' : 's'}`.trim());
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setSaving(false); }
  }

  async function doDeleteOccurrence(t: Transaction) {
    if (t.lineno == null) return;
    setSaving(true); setError(null);
    try {
      const res = await deleteTransaction(t.lineno);
      if (!res.success) { setError(res.errors?.join(", ") || "Failed to delete."); return; }
      refreshSeries("Occurrence deleted");
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setSaving(false); }
  }

  async function doRevisePlan() {
    if (!resolvedSeries) return;
    setSaving(true); setError(null);
    try {
      const res = await reviseSeries(resolvedSeries.series_id, { count: reviseCount });
      if (!res.success) { setError(res.errors?.join(", ") || "Failed to revise."); return; }
      setReviseOpen(false);
      refreshSeries(reviseCount > resolvedSeries.total ? `Added ${reviseCount - resolvedSeries.total}` : "Plan updated");
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
    finally { setSaving(false); }
  }

  // ── keyboard: modal-level ────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (reviseOpen) { setReviseOpen(false); return; }
      if (showCancel) { setShowCancel(false); return; }
      close(); return;
    }
    if (e.key === "Enter") {
      const isLine = (e.target as HTMLElement).classList?.contains('cx-line-input');
      if (isLine && !split && !e.metaKey && !e.ctrlKey && dropdownItems.length === 0) {
        e.preventDefault(); void handleSave();
      } else if ((e.metaKey || e.ctrlKey)) {
        e.preventDefault(); void handleSave();
      }
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  const title = seriesScope
    ? `${seriesTypeMeta === 'installment' || resolvedSeries?.type === 'installment' ? '#' : '↻'} ${payee || narration || 'Series'}`
    : occScope ? `${payee || narration || 'Transaction'}`
    : isEditingTxn ? 'Edit transaction' : 'New';
  // Unambiguous: whole-series edit says "whole series"; single-occurrence edit
  // says "this one". (The old "editing installment"/"editing occurrence" pair
  // read backwards to users.)
  const seriesKind = (resolvedSeries?.type ?? seriesTypeMeta) === 'installment' ? 'installment plan' : 'recurring series';
  const badge = seriesScope ? `editing whole ${seriesKind}`
    : occScope ? 'editing this one' : null;

  const leftWing = detailsOpen && !seriesScope;
  // Occurrence editing has no right wing — the inline scope banner already says
  // "editing one installment · Edit entire series →", so a wing would duplicate it.
  const rightWing = repeatOpen ? 'schedule' : seriesScope ? 'series' : null;
  const hasPanel = leftWing || !!rightWing;

  const isMac = navigator.platform.includes("Mac");
  const saveHint = (split || schedule || editing) ? `${isMac ? '⌘' : 'Ctrl'}+↵` : '↵';
  const saveLabel = saving ? 'Saving…'
    : seriesScope ? 'Save changes'
    : occScope ? 'Save occurrence'
    : schedule ? 'Create series' : 'Save';

  return (
    <div className="modal-overlay cx-overlay" onMouseDown={close}>
      <div className={`cx-rig${hasPanel ? ' has-panel' : ''}`} onMouseDown={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>

        {/* LEFT WING — Details */}
        {leftWing && (
          <div className="cx-addon left">
            <div className="cx-panel-head"><span className="cx-pt">⚙ Details</span>
              <button className="cx-panel-x" onClick={() => setDetailsOpen(false)}>&times;</button></div>
            <div className="cx-panel-body">
              <div className="form-field"><label>Date</label>
                <input value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="form-field"><label>Flag</label>
                <select value={flag} onChange={e => setFlag(e.target.value as '*' | '!')}>
                  <option value="*">* cleared</option><option value="!">! planned</option></select></div>
              <div className="form-field"><label>Payee</label>
                <InlineAutocomplete value={payee} onChange={setPayee} options={payeeList} placeholder="Payee" /></div>
              <div className="form-field"><label>Narration</label>
                <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Description" /></div>
              <ChipEditor label="Tags" prefix="#" values={tags} setValues={setTags} />
              <ChipEditor label="Links" prefix="^" values={links} setValues={setLinks} />
            </div>
          </div>
        )}

        {/* CENTER — the composer */}
        <div className="cx-composer" role="dialog" aria-label="Composer">
          <div className="cx-head">
            <span className="cx-title">{title}{badge && <span className="badge-edit">{badge}</span>}</span>
            <button className="cx-x" onClick={close}>&times;</button>
          </div>

          <div className="cx-body">
            {/* smart line (hidden while editing — header fields drive it) */}
            {!editing && (
              <div className="cx-line">
                <div className="cx-line-field">
                  <input ref={inputRef} className="cx-line-input" value={inputValue}
                    onChange={handleInputChange} onKeyDown={handleLineKeyDown}
                    placeholder={routeStage !== 'idle' ? '' : "Type narration — 212,90 · @ payee · > from→to · # tag · ↻ monthly · 212,90*10"} autoComplete="off" />
                  {/* the route chip builds inline while picking accounts */}
                  {routeStage !== 'idle' && (
                    <RouteChip stage={routeStage} from={routeFrom} to={routeTo} flip={routeFlip}
                      query={routeQuery}
                      onEditSlot={(s) => { setRouteStage(s); setRouteQuery(''); setRouteActive(0); }}
                      onFlip={() => setRouteFlip(f => !f)}
                      onCancel={cancelRoute} />
                  )}
                  <div className="cx-sched-slot">
                    {schedule
                      ? <ScheduleChip schedule={schedule} onEdit={() => setRepeatOpen(v => !v)} onRemove={() => { setSchedule(null); setRepeatOpen(false); }} />
                      : <button className="cx-chip-add" onClick={() => { if (!schedule) setSchedule({ kind: 'recurring', frequency: 'monthly' }); setRepeatOpen(true); }}>↻ repeat</button>}
                  </div>
                </div>
                {/* route picker dropdown (ranked accounts) */}
                {routeStage !== 'idle' && (
                  <RouteDropdown stage={routeStage} flip={routeFlip} results={routeResults}
                    active={routeActive} listRef={ddListRef}
                    onHover={setRouteActive} onPick={(n) => pickRoute(n)} />
                )}
                {/* payee / tag dropdown */}
                {routeStage === 'idle' && dropdownItems.length > 0 && (
                  <div className="cx-dropdown">
                    {dropdownLabel && <div className="cx-dropdown-label">{dropdownLabel}</div>}
                    {dropdownItems.map((item, i) => (
                      <div key={item} className={`cx-dropdown-item${i === dropdownActiveIdx ? ' active' : ''}`}
                        onMouseDown={() => selectDropdownItem(item)}>{item}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* editing header line (compact, non-parsing) */}
            {editing && (
              <div className="cx-edit-head">
                <span className="cx-edit-name">{payee || narration || '—'}</span>
                {inSeries && <span className={`cx-sched-chip ${(resolvedSeries?.type === 'installment') ? 'installment' : ''} ro`}>
                  {resolvedSeries?.type === 'installment' ? `# ${resolvedSeries?.total}× series` : `↻ ${resolvedSeries?.frequency || 'monthly'} series`}
                </span>}
              </div>
            )}

            {/* scope banner — occurrence editing */}
            {occScope && (
              <div className="cx-scope-banner">
                <span className="ic">{resolvedSeries?.type === 'installment' ? '#' : '↻'}</span>
                <span className="txt">Editing <b>one {resolvedSeries?.type === 'installment' ? 'installment' : 'occurrence'}</b> · <span className="sub">changes touch only this row</span></span>
                <button className="cx-esc" onClick={escalateToSeries}>Edit entire series →</button>
              </div>
            )}

            {/* pills */}
            {!editing && (pills.length > 0 || ghostPills.length > 0) && (
              <div className="cx-pills">
                {pills.map((p, i) => (
                  p.type === 'date' ? (
                    // Date is mandatory — not removable. Click to edit in Details.
                    <span key={`${p.type}-${i}`} className="cx-pill cx-pill-date" onClick={() => setDetailsOpen(true)} title="Change date">
                      <CalendarIcon size={13} className="cx-pill-ic" />{p.label}</span>
                  ) : (
                    <span key={`${p.type}-${i}`} className="cx-pill">
                      {p.label}<button onClick={() => removePill(i)}>&times;</button></span>
                  )
                ))}
                {ghostPills.map((g, i) => (
                  <span key={`g-${i}`} className="cx-pill ghost" onClick={() => acceptGhost(g)} title="Click to accept">{g.label}</span>
                ))}
              </div>
            )}

            {/* When editing a whole series, spell out that grid edits hit only
                the pending run — the confirmed occurrences are never rewritten. */}
            {seriesScope && resolvedSeries && resolvedSeries.confirmed > 0 && (
              <div className="cx-scope-note">
                Editing these postings updates the <b>{resolvedSeries.pending} pending</b>
                {' '}occurrence{resolvedSeries.pending === 1 ? '' : 's'} only — the
                {' '}<b>{resolvedSeries.confirmed} confirmed</b> stay as posted.
              </div>
            )}

            {/* postings: preview (L0) or grid (split/editing) */}
            {(split || editing) ? (
              <PostingGrid rows={rows} onChange={updateRow} onAdd={addRow} onRemove={removeRow} accountNames={accountNames} balance={balance} currencyPlaceholder={operatingCurrency} />
            ) : (
              <PostingPreview postings={postings} balance={balance} schedule={schedule} currency={operatingCurrency} />
            )}

            {/* actions */}
            {!seriesScope && (
              <div className="cx-actions">
                {!editing && <button className={`cx-disclose${split ? ' active' : ''}`} onClick={enterSplit}><span className="g">＋</span> Split</button>}
                {!editing && <button className={`cx-disclose${schedule ? ' active' : ''}`} onClick={() => { if (!schedule) setSchedule({ kind: 'recurring', frequency: 'monthly' }); setRepeatOpen(v => !v); }}><span className="g">↻</span> Repeat</button>}
                <button className={`cx-disclose${detailsOpen ? ' active' : ''}`} onClick={() => setDetailsOpen(v => !v)}><span className="g">⚙</span> Details</button>
              </div>
            )}

            {error && <div className="error-msg">{error}</div>}
          </div>

          <div className="cx-foot">
            {flash
              ? <span className="cx-flash">✓ {flash}</span>
              : <span className="cx-hint"><span className="kbd">{saveHint}</span> save</span>}
            {!editing && (
              <label className="cx-chk"><input type="checkbox" checked={continueMode} onChange={e => setContinueMode(e.target.checked)} /> continue</label>
            )}
            <button className="btn" onClick={close}>{seriesScope ? 'Done' : 'Cancel'}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saveLabel}</button>
          </div>
        </div>

        {/* RIGHT WING */}
        {rightWing === 'schedule' && (
          <SchedulePanel schedule={schedule!} total={scheduleTotal}
            draftAmount={postings.find(p => p.amount)?.amount || ''}
            multiposting={split || rows.filter(r => r.account.trim()).length > 2}
            currency={operatingCurrency}
            onChange={(s, t) => { setSchedule(s); if (t !== undefined) setScheduleTotal(t); }}
            onClose={() => setRepeatOpen(false)}
            onRemove={() => { setSchedule(null); setRepeatOpen(false); }} />
        )}
        {rightWing === 'series' && resolvedSeries && (
          <SeriesPanel series={resolvedSeries} occurrences={occurrences}
            onEditOccurrence={(t) => openComposer({ txn: t })}
            onDeleteOccurrence={doDeleteOccurrence}
            onEditPlan={() => { setReviseCount(resolvedSeries.total); setReviseOpen(true); }}
            onCancel={() => setShowCancel(true)}
            onExtend={doExtend} />
        )}

        {/* revise dialog (centered scrim) */}
        {reviseOpen && resolvedSeries && (
          <RevisePlanDialog series={resolvedSeries} count={reviseCount} setCount={setReviseCount}
            onCancel={() => setReviseOpen(false)} onSave={doRevisePlan} saving={saving} error={error} />
        )}
        {showCancel && resolvedSeries && (
          <div className="cx-scrim" onMouseDown={() => setShowCancel(false)}>
            <div className="cx-dialog" onMouseDown={e => e.stopPropagation()}>
              <p className="cx-warn">⚠ Delete all {resolvedSeries.pending} pending transactions? The {resolvedSeries.confirmed} confirmed stay. Cannot be undone.</p>
              <div className="cx-dialog-actions">
                <button className="btn" onClick={() => setShowCancel(false)}>Keep</button>
                <button className="btn btn-danger" onClick={doCancel} disabled={saving}>{saving ? 'Cancelling…' : 'Confirm cancel'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

/** Render the amount with any installment breakdown (e.g. "120 × 10 (total 1200)"). */
// Render an installment amount as "<per> × <n> (total <total>)". Both the total
// form (amt = whole total, per = ÷n) and the per form (amt = each, total = ×n)
// render the SAME shape for consistency; numbers go through formatAmount so the
// locale separators match (no mixed 112.09 / 1120,90).
function installmentEach(amt: string, schedule: Schedule | null, currency: string): string {
  const num = parseFloat((amt || '').replace(',', '.'));
  if (!amt || Number.isNaN(num) || schedule?.kind !== 'installment' || !schedule.count) {
    return amt ? `${formatAmount(num, currency)}` : amt;
  }
  const n = schedule.count;
  const per = schedule.amountIsTotal ? Math.round((num / n) * 100) / 100 : num;
  const total = schedule.amountIsTotal ? num : Math.round(num * n * 100) / 100;
  return `${formatAmount(per, currency)} × ${n} (total ${formatAmount(total, currency)})`;
}

function PostingPreview({ postings, balance, schedule, currency }: { postings: Row[]; balance: BalanceState; schedule: Schedule | null; currency: string }) {
  const amtPre = postings.find(p => p.amount)?.amount || '';
  if (postings.length < 2 || !postings[0].account) {
    // No accounts yet — but if an amount + installment plan is set, show the
    // breakdown now (the user typed e.g. `1200:12`) instead of a bare prompt.
    const each = installmentEach(amtPre, schedule, currency);
    return (
      <div className="cx-preview empty">
        {amtPre
          ? <><span className="cx-pv-amt">{each}</span> — pick an expense &amp; payment account with <b>&gt;</b>.</>
          : <>Pick an expense and payment account with <b>&gt;</b>, and an amount with <b>$</b>.</>}
      </div>
    );
  }
  const from = postings[0], to = postings[1];
  const amt = amtPre;
  const each = installmentEach(amt, schedule, from.currency || currency);
  return (
    <>
      <div className="cx-preview">
        <span className={`cx-swatch ${swClass(from.account)}`} />
        <span className="cx-acc">{from.account}</span>
        <span className="cx-arrow">→</span>
        <span className={`cx-swatch ${swClass(to.account)}`} />
        <span className="cx-acc">{to.account || '(payment account)'}</span>
        <span className="cx-pv-amt">{each} {from.currency}</span>
      </div>
      <div className={`cx-bal ${balance.balanced ? 'ok' : 'off'}`}>
        {balance.balanced ? `✓ balanced${amt ? ` — ${to.account ? shortName(to.account) : 'payment'} auto-balances to −${amt}` : ''}` : `Δ ${balance.delta}`}
      </div>
    </>
  );
}

function PostingGrid({ rows, onChange, onAdd, onRemove, accountNames, balance, currencyPlaceholder }: {
  rows: Row[]; onChange: (i: number, f: keyof Row, v: string) => void; onAdd: () => void; onRemove: (i: number) => void;
  accountNames: string[]; balance: BalanceState; currencyPlaceholder: string;
}) {
  // Uses the app's canonical posting-row markup (was the old AdvancedInput) so
  // the grid matches every other form in Ledgr.
  return (
    <div className="postings-section cx-postings">
      <div className="posting-header">
        <span className="account-col">Account</span>
        <span className="amount-col">Amount</span>
        <span className="currency-col">Cur.</span>
        <span className="action-col" />
      </div>
      {rows.map((r, i) => (
        <div key={r.id} className="posting-row">
          <InlineAutocomplete value={r.account} onChange={v => onChange(i, 'account', v)} options={accountNames} placeholder="Account" className="account-input" />
          <input className="amount-input" type="number" step="any" value={r.amount} placeholder="auto" onChange={e => onChange(i, 'amount', e.target.value)} />
          <input className="currency-input" value={r.currency} placeholder={currencyPlaceholder} onChange={e => onChange(i, 'currency', e.target.value.toUpperCase())} />
          <button type="button" className="remove-btn" onClick={() => onRemove(i)} disabled={rows.length <= 2} title="Remove posting">&times;</button>
        </div>
      ))}
      <div className="cx-grid-foot">
        <button type="button" className="btn-link add-posting-btn" onClick={onAdd}>+ Add posting</button>
        <span className={`cx-foot-bal ${balance.balanced ? '' : 'off'}`}>{balance.balanced ? '✓ balanced' : `Δ ${balance.delta} — one row may stay blank`}</span>
      </div>
    </div>
  );
}

const swClassOf = (name: string) => {
  const k = accountKind(name);
  return k === 'exp' ? 'sw-exp' : k === 'inc' ? 'sw-inc' : k === 'pay' ? 'sw-pay' : 'sw-ast';
};

// The `from → to` chip building inline in the smart line while `>` is active.
function RouteChip({ stage, from, to, flip, query, onEditSlot, onFlip, onCancel }: {
  stage: 'from' | 'to'; from: string | null; to: string | null; flip: boolean; query: string;
  onEditSlot: (s: 'from' | 'to') => void; onFlip: () => void; onCancel: () => void;
}) {
  const slot = (which: 'from' | 'to') => {
    const acc = which === 'from' ? from : to;
    if (stage === which) {
      return <span className="cx-rslot active"><span className="cx-rtyped">{query}</span><span className="caret" /></span>;
    }
    if (acc) {
      return <span className="cx-rslot filled" onMouseDown={(e) => { e.preventDefault(); onEditSlot(which); }}>
        <span className={`cx-swatch ${swClassOf(acc)}`} />{leafName(acc)}</span>;
    }
    return <span className="cx-rslot empty" onMouseDown={(e) => { e.preventDefault(); onEditSlot(which); }}>{which}</span>;
  };
  return (
    <span className="cx-route">
      {flip
        ? <>{slot('to')}<button className="cx-rflip" onMouseDown={(e) => { e.preventDefault(); onFlip(); }} title="Flip direction">⇄</button><span className="cx-rarrow">→</span>{slot('from')}</>
        : <>{slot('from')}<span className="cx-rarrow">→</span><button className="cx-rflip" onMouseDown={(e) => { e.preventDefault(); onFlip(); }} title="Flip direction">⇄</button>{slot('to')}</>}
      <button className="cx-rx" onMouseDown={(e) => { e.preventDefault(); onCancel(); }} title="Remove">&times;</button>
    </span>
  );
}

function RouteDropdown({ stage, flip, results, active, listRef, onHover, onPick }: {
  stage: 'from' | 'to'; flip: boolean; results: RankedAccount[]; active: number;
  listRef: React.RefObject<HTMLDivElement | null>;
  onHover: (i: number) => void; onPick: (name: string) => void;
}) {
  useEffect(() => {
    const el = listRef.current?.querySelector('.cx-row.active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, results, listRef]);
  return (
    <div className="cx-dropdown cx-route-dd">
      <div className="cx-rdd-h">
        <span>Choose <span className="cx-rdd-side">{stage}</span> account</span>
        <span>{flip ? 'to → from' : 'from → to'}</span>
      </div>
      <div className="cx-rdd-list" ref={listRef}>
        {results.length === 0 && <div className="cx-rdd-empty">No account matches — refine, or use ＋ Split for a new one.</div>}
        {results.map((r, i) => (
          <div key={r.name} className={`cx-row${i === active ? ' active' : ''}`}
            onMouseEnter={() => onHover(i)} onMouseDown={(e) => { e.preventDefault(); onPick(r.name); }}>
            <span className={`cx-swatch ${swClassOf(r.name)}`} />
            <span className="cx-racct">
              <span className="cx-rleaf">{renderLeafHighlight(r)}</span>
              {parentPath(r.name) && <span className="cx-rparent">{parentPath(r.name)}</span>}
            </span>
            {r.tag === 'usual'
              ? <span className="cx-rbadge usual">◆ usual</span>
              : r.tag === 'recent'
              ? <span className="cx-rbadge recent">↩ recent</span>
              : <span className="cx-rbadge"><span className="cx-star">★</span> {r.used}×</span>}
          </div>
        ))}
      </div>
      <div className="cx-rdd-foot">
        <span><kbd>↑↓</kbd> move</span><span><kbd>⏎</kbd> pick</span><span><kbd>tab</kbd> next</span><span><kbd>&gt;</kbd> flip</span><span><kbd>esc</kbd> back</span>
      </div>
    </div>
  );
}

// Bold the fuzzy-matched span within the leaf.
function renderLeafHighlight(r: RankedAccount): React.ReactNode {
  const leaf = leafName(r.name);
  const h = r.hit;
  const leafStart = r.name.length - leaf.length;
  if (!h || h.first < 0 || h.first < leafStart) return leaf;
  const s = Math.max(0, h.first - leafStart);
  const e = Math.max(s, h.last - leafStart + 1);
  return <>{leaf.slice(0, s)}<span className="cx-mt">{leaf.slice(s, e)}</span>{leaf.slice(e)}</>;
}

function ScheduleChip({ schedule, onEdit, onRemove }: { schedule: Schedule; onEdit: () => void; onRemove: () => void }) {
  const inst = schedule.kind === 'installment';
  const sub = inst ? (schedule.amountIsTotal ? 'total' : 'each') : (schedule.until ? `until ${schedule.until}` : 'no end');
  return (
    <button className={`cx-sched-chip ${inst ? 'installment' : ''}`} onClick={(e) => { if ((e.target as HTMLElement).dataset.x) return; onEdit(); }}>
      <span className="ic">{inst ? '#' : '↻'}</span> {inst ? `${schedule.count ?? '?'}×` : (schedule.frequency || 'monthly')}
      <span className="dot">·</span><span className="sub">{sub}</span>
      <button data-x="1" onClick={onRemove} title="Make one-off">&times;</button>
    </button>
  );
}

function SchedulePanel({ schedule, total, draftAmount, multiposting, currency, onChange, onClose, onRemove }: {
  schedule: Schedule; total: string; draftAmount: string; multiposting: boolean; currency: string;
  onChange: (s: Schedule, t?: string) => void; onClose: () => void; onRemove: () => void;
}) {
  const rec = schedule.kind === 'recurring';
  // Live installment math: when "amount is total", the amount in the draft is
  // the whole purchase and each installment is total ÷ N (remainder on last).
  const n = schedule.count && schedule.count > 0 ? schedule.count : 0;
  const amtNum = parseFloat((draftAmount || '0').replace(',', '.'));
  // Mirror the backend (ROUND_HALF_UP, remainder on the LAST installment). Using
  // Math.round — not floor — so an exact split like 2924/10 = 292,40 shows 292,40,
  // and the "last absorbs rounding" note only appears when a remainder truly exists.
  const per = n > 0 ? Math.round((amtNum / n) * 100) / 100 : 0;
  const lastCent = n > 0 ? Math.round((amtNum - per * n) * 100) / 100 : 0;
  const hasRemainder = Math.abs(lastCent) >= 0.005;
  return (
    <div className="cx-addon right">
      <div className="cx-panel-head"><span className="cx-pt">↻ Repeat</span>
        <button className="cx-panel-x" onClick={onClose}>&times;</button></div>
      <div className="cx-panel-body">
        <div className="cx-kind-seg">
          <button className={`cx-kind-btn${rec ? ' on' : ''}`} onClick={() => onChange({ kind: 'recurring', frequency: 'monthly', until: schedule.until })}><span className="ic">↻</span>Recurring</button>
          <button className={`cx-kind-btn${!rec ? ' on' : ''}`} onClick={() => onChange({ kind: 'installment', count: schedule.count ?? 12, amountIsTotal: schedule.amountIsTotal })}><span className="ic">#</span>Installments</button>
        </div>
        {rec ? (
          <>
            <div className="cx-prow"><label>Every</label>
              <div className="cx-freq-seg">
                {(['weekly', 'monthly', 'yearly'] as SeriesFrequency[]).map(f => (
                  <button key={f} className={(schedule.frequency || 'monthly') === f ? 'on' : ''} onClick={() => onChange({ ...schedule, frequency: f })}>{f[0].toUpperCase() + f.slice(1, -2)}</button>
                ))}
              </div>
            </div>
            <div className="cx-prow"><label>Until</label>
              <input className="cx-pinp" placeholder="31/12/2026 or Dec" value={schedule.until || ''} onChange={e => onChange({ ...schedule, until: e.target.value })} /></div>
          </>
        ) : (
          <>
            {/* "Amount is the total" is a single-amount convenience. In split
                mode the grid already holds explicit per-installment legs, so the
                flag is hidden — each installment is the grid × count. */}
            {!multiposting && (
              <label className="cx-chk-total"><input type="checkbox" checked={!!schedule.amountIsTotal} onChange={e => onChange({ ...schedule, amountIsTotal: e.target.checked }, total)} /> Amount is the <b>&nbsp;total</b> (split across installments)</label>
            )}
            <div className="cx-prow"><label>Count</label>
              <input className="cx-pinp" type="number" min={1} style={{ maxWidth: 80 }} value={schedule.count ?? ''} onChange={e => onChange({ ...schedule, count: parseInt(e.target.value, 10) || undefined })} /><span className="cx-note-inline">installments</span></div>
            {!multiposting && n > 0 && amtNum > 0 && (
              <div className="cx-calc">
                {schedule.amountIsTotal
                  ? <>{formatAmount(amtNum, currency)} ÷ {n} = <b>{formatAmount(per, currency)}</b> each{hasRemainder ? <> · last {formatAmount(per + lastCent, currency)}</> : null}</>
                  : <><b>{formatAmount(amtNum, currency)}</b> × {n} = {formatAmount(amtNum * n, currency)} total</>}
              </div>
            )}
            {multiposting && n > 0 && (
              <div className="cx-calc">Each installment repeats the postings below · <b>{n}×</b></div>
            )}
          </>
        )}
        <div className="cx-dialog-actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={onRemove}>Remove</button>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function SeriesPanel({ series, occurrences, onEditOccurrence, onDeleteOccurrence, onEditPlan, onCancel, onExtend }: {
  series: SeriesSummary; occurrences: Transaction[];
  onEditOccurrence: (t: Transaction) => void; onDeleteOccurrence: (t: Transaction) => void;
  onEditPlan: () => void; onCancel: () => void; onExtend: (end: string) => void;
}) {
  const inst = series.type === 'installment';
  const [extending, setExtending] = useState(false);
  const [end, setEnd] = useState("");
  const pct = series.total ? Math.round((series.confirmed / series.total) * 100) : 0;
  return (
    <div className="cx-addon right">
      <div className="cx-panel-head"><span className="cx-pt">{inst ? '#' : '↻'} Series</span></div>
      <div className="cx-panel-body">
        <div className="cx-prog">
          <span className="pchip ok">{series.confirmed} confirmed</span>
          {series.pending > 0 && <span className="pchip pend">{series.pending} pending</span>}
          <span className="cx-prog-meta">{inst ? `${series.total} installments` : series.frequency}</span>
        </div>
        <div className="cx-bar"><i className="done" style={{ width: `${pct}%` }} /><i className="pend" style={{ width: `${100 - pct}%` }} /></div>

        {/* Occurrence list — each row edits that single transaction. */}
        {occurrences.length > 0 && (
          <div className="cx-occ-list">
            {occurrences.map((t, i) => {
              const mag = txnMagnitude(t);
              const seq = t.metadata?.['ledgr-series-seq'];
              const label = inst && seq != null ? `#${seq}/${series.total}` : t.date;
              return (
                <div key={t.lineno ?? i} className={`cx-occ${t.flag === '!' ? ' pend' : ''}`}>
                  <button className="cx-occ-main" onClick={() => onEditOccurrence(t)} title="Edit this one">
                    <span className="cx-occ-fl">{t.flag === '*' ? '∗' : '!'}</span>
                    <span className="cx-occ-lbl">{label}</span>
                    <span className="cx-occ-d">{t.date}</span>
                    <span className="cx-occ-amt">{mag ? formatAmount(mag, series.currency) : ''}</span>
                  </button>
                  {t.flag === '!' && (
                    <button className="cx-occ-del" title="Delete this occurrence"
                      onClick={(e) => { e.stopPropagation(); onDeleteOccurrence(t); }}>&times;</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!extending ? (
          <div className="cx-series-actions">
            {inst
              ? <button className="btn" onClick={onEditPlan}>＋ Add / remove installments…</button>
              : <button className="btn" onClick={() => setExtending(true)}>Extend…</button>}
            {series.pending > 0 && <button className="btn btn-danger" onClick={onCancel}>{inst ? 'Cancel remaining…' : 'Cancel series…'}</button>}
          </div>
        ) : (
          <div className="cx-extend">
            <label>New end date</label>
            <input className="cx-pinp" placeholder="31/12/2026" value={end} onChange={e => setEnd(e.target.value)} autoFocus />
            <div className="cx-dialog-actions" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => setExtending(false)}>Back</button>
              <button className="btn btn-primary" onClick={() => onExtend(end)} disabled={!end.trim()}>Extend</button>
            </div>
          </div>
        )}
        <p className="cx-occ-hint">Edit amounts/accounts in the grid to apply to <b>all pending</b>, or click an occurrence above to change just that one.</p>
      </div>
    </div>
  );
}

function RevisePlanDialog({ series, count, setCount, onCancel, onSave, saving, error }: {
  series: SeriesSummary; count: number; setCount: (n: number) => void; onCancel: () => void; onSave: () => void; saving: boolean; error: string | null;
}) {
  // "Add / remove installments" KEEPS the per-installment amount and appends or
  // trims pending occurrences — it does NOT re-divide the total. (Re-splitting a
  // fixed total is a separate flow via the grid + "amount is total".)
  const per = parseFloat(series.amount_per_txn || '0');
  const n = Math.max(series.confirmed, count);
  const delta = n - series.total;                 // vs the CURRENT count
  const newTotal = per * n;
  return (
    <div className="cx-scrim" onMouseDown={onCancel}>
      <div className="cx-dialog wide" onMouseDown={e => e.stopPropagation()}>
        <h4>Add or remove installments</h4>
        <div className="cx-dialog-sub">{series.payee || series.narration} · <span className="mono">{formatAmount(per, series.currency)} {series.currency}</span> each</div>
        <div className="cx-prow"><label>Installments</label>
          <div className="cx-step">
            <button onClick={() => setCount(Math.max(series.confirmed, n - 1))}>−</button>
            <input value={n} readOnly />
            <button onClick={() => setCount(n + 1)}>+</button>
          </div>
          <span className="cx-note-inline">was {series.total}</span>
        </div>
        <div className="cx-calc">{n} × {formatAmount(per, series.currency)} = <b>{formatAmount(newTotal, series.currency)}</b> total</div>
        <div className="cx-warn small">
          {delta > 0
            ? <>＋ Adds <b>{delta}</b> pending installment{delta === 1 ? '' : 's'} at {formatAmount(per, series.currency)} each. Existing occurrences are untouched.</>
            : delta < 0
            ? <>− Removes <b>{-delta}</b> pending installment{delta === -1 ? '' : 's'} from the end. Confirmed occurrences are never removed.</>
            : <>No change to the count.</>}
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="cx-dialog-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving || delta === 0}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function ChipEditor({ label, prefix, values, setValues }: { label: string; prefix: string; values: string[]; setValues: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  return (
    <div className="form-field"><label>{label}</label>
      <div className="chips-input">
        {values.map(v => (
          <span key={v} className="chip tag-chip">{prefix}{v}<button type="button" onClick={() => setValues(values.filter(x => x !== v))}>&times;</button></span>
        ))}
        <input className="chip-text-input" value={input} placeholder={values.length ? '' : `${prefix}tag`}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',' || e.key === ' ')) {
              e.preventDefault();
              const val = input.replace(new RegExp(`^\\${prefix}`), '').trim();
              if (val && !values.includes(val)) setValues([...values, val]);
              setInput("");
            } else if (e.key === 'Backspace' && !input && values.length) {
              setValues(values.slice(0, -1));
            }
          }} />
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

interface BalanceState { balanced: boolean; delta: string }

function toNum(v: string): number { return parseFloat(v.replace(',', '.')); }

/** A transaction's magnitude = sum of its positive postings (the whole amount),
 *  so a multi-posting split shows its true total, not one leg. */
function txnMagnitude(t: Transaction): number {
  const pos = t.postings
    .filter(p => p.amount && parseFloat(p.amount) > 0)
    .reduce((s, p) => s + parseFloat(p.amount as string), 0);
  if (pos > 0) return pos;
  // Fallback (no explicit positive, e.g. all auto): use largest abs amount.
  return t.postings.reduce((m, p) => {
    const v = p.amount ? Math.abs(parseFloat(p.amount)) : 0;
    return v > m ? v : m;
  }, 0);
}

function computeBalance(postings: Row[]): BalanceState {
  const filled = postings.filter(p => p.account.trim());
  const autos = filled.filter(p => !p.amount.trim()).length;
  if (autos >= 1) return { balanced: true, delta: '0.00' };
  let sum = 0;
  for (const p of filled) if (p.amount.trim()) sum += toNum(p.amount);
  return { balanced: Math.abs(sum) < 0.005, delta: sum.toFixed(2) };
}

function seedPills(txn: Transaction | null): Pill[] {
  // Editing an existing txn: its date shows in Details, no seed pill needed.
  if (txn) return [];
  // New draft: show today as a date pill so the date is visible and selected
  // up front (removable / overridable by typing a date). Reused across
  // save & continue via finish().
  const iso = today();
  return [{ type: 'date', label: dateChipLabel(iso), value: iso }];
}

function seedRows(txn: Transaction | null, series: SeriesSummary | null, currency: string): Row[] {
  const src = txn?.postings ?? series?.postings ?? null;
  if (src && src.length) {
    const rows: Row[] = src.map(p => ({
      id: nextId(), account: p.account, amount: p.amount ?? '', currency: p.currency || currency,
    }));
    if (rows.length < 2) rows.push({ id: nextId(), account: '', amount: '', currency });
    return rows;
  }
  return [
    { id: nextId(), account: '', amount: '', currency },
    { id: nextId(), account: '', amount: '', currency },
  ];
}

function seedSchedule(series: SeriesSummary | null, initial: 'split' | 'repeat' | null): Schedule | null {
  if (series) {
    return series.type === 'installment'
      ? { kind: 'installment', count: series.total, amountIsTotal: false }
      : { kind: 'recurring', frequency: series.frequency, until: series.last_date };
  }
  if (initial === 'repeat') return { kind: 'recurring', frequency: 'monthly' };
  return null;
}

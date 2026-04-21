# PLAN — Global Filters

Spec for the Ledgr global filter system. Adds a persistent **Filter Bar**
component that controls Period, Account, Tag, and Payee filters across all
pages and reports.

---

## 1. Design overview

A thin horizontal bar sits between the tab bar and the page content.
It is always visible and contains four filter buttons that, when inactive,
show a label+icon and, when active, show the selected value as a pill
with a dismiss (✕) button. A "Clear all" action appears when any filter
is active.

All filter state is global (Zustand store) and feeds into every React
Query key, so changing a filter re-fetches all visible data automatically.

### Filter dimensions

| Filter  | Selection mode | Backend param(s)                | Dropdown style                |
|---------|----------------|----------------------------------|-------------------------------|
| Period  | Single-select  | `from_date`, `to_date`           | Preset grid + custom range    |
| Account | Single-select  | `account`                        | Searchable flat list          |
| Tag     | Multi-select   | `tags` (repeated query param)    | Searchable chip cloud         |
| Payee   | Single-select  | `payee`                          | Searchable list (freq-sorted) |

### What NOT to build

- No free-text query language (Fava-style `account:"X" #tag`)
- No saved/named filter presets (future feature)- No per-page filter overrides — filters are strictly global
- No OR logic for tags — AND only (show txns matching ALL selected tags)
- No date picker calendar widget — just preset shortcuts + manual ISO input

---

## 2. Core principle — delegate to `clamp_opt()`

Fava's `TimeFilter` uses a single Beancount function for ALL time
filtering: `beancount.ops.summarize.clamp_opt()`. Ledgr must do the
same. **No custom date filtering logic.**

What `clamp_opt(entries, begin, end, options)` does:

1. Creates synthetic opening-balance entries for balance sheet accounts
   (Assets, Liabilities, Equity) at `begin`, carrying forward the
   cumulative balance of everything before the period.
2. Zeros out Income/Expenses before `begin` (they are period accounts).
3. Truncates everything after `end`.

This means a single call to `clamp_opt()` produces entries that work
correctly for ALL report types:

- **Income Statement**: Income/Expenses only contain the period's data.
- **Balance Sheet**: Assets/Liabilities/Equity carry forward opening
  balances, then `cap_opt()` closes Income→Equity as usual.
- **Account Register**: Running balance starts with the correct opening
  balance because the synthetic entries are in the list.
- **Cash Flow**: Operates on period transactions only, which is correct.
- **Charts**: Series computed from clamped entries show the right window.
### Filter application order (matches Fava's `FilteredLedger`)

```
entries = ledger.all_entries
entries = apply_view_mode(entries, view_mode)       # 1. planned/actual (Ledgr-only)
entries = AccountFilter(account).apply(entries)     # 2. account (Fava)
entries = AdvancedFilter("#tag payee:X").apply(entries)  # 3. tag/payee (Fava)
entries, _ = clamp_opt(entries, begin, end, options) # 4. time (Beancount)
```

Entity filters (account, tag, payee) are applied BEFORE `clamp_opt()`,
exactly like Fava does. This means `clamp_opt()` computes opening
balances only for entries that survive the entity filters.

---

## 3. Date period presets

The Period dropdown offers quick presets that resolve to `from_date` /
`to_date` pairs at query time (not at selection time — "This month"
always means the current month when the request fires).

| Preset           | `from_date`                  | `to_date`                    |
|------------------|------------------------------|------------------------------|
| Today            | today                        | today + 1 day                |
| This week        | Monday of current week       | next Monday                  |
| This month       | 1st of current month         | 1st of next month            |
| This year        | Jan 1 of current year        | Jan 1 of next year           |
| Last 30 days     | today − 29 days              | today + 1 day                |
| Last 12 months   | 1st of (current month − 11)  | 1st of next month            |
| YTD              | Jan 1 of current year        | today + 1 day                |
| All time         | (no `from_date`)             | (no `to_date`)               |
| Custom range     | user-provided ISO date       | user-provided ISO date + 1   |
**Important**: `clamp_opt()` uses exclusive end dates (`end` is not
included). All presets must resolve `to_date` as the day AFTER the
last desired day. The frontend stores and displays human-friendly
inclusive dates; the backend converts to exclusive before calling
`clamp_opt()`.

The bottom of the dropdown has ◀ / ▶ month navigation. Clicking ◀ or ▶
sets "Custom range" with the previous/next month boundaries and updates
the displayed month label.

"All time" is the default state (no filters applied = no `clamp_opt()`
call = current behavior).

---

## 4. Backend changes

### 4.1 New endpoint: `GET /api/tags`

File: `backend/routers/accounts.py`

Returns all tags used across all transactions, sorted alphabetically.
The client already has `fetchTags()` wired up but no backend handler.

```python
@router.get("/api/tags")
def get_tags(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, list[str]]:
    seen: set[str] = set()
    for e in ledger.all_entries:
        if isinstance(e, data.Transaction) and e.tags:
            seen.update(e.tags)
    return {"tags": sorted(seen)}
```
### 4.2 Rewrite `get_filtered_entries()`

File: `backend/ledger.py`

This is the central change. The function becomes the single place
where ALL filtering happens — view_mode, entity, and time.

```python
import datetime
from beancount.ops.summarize import clamp_opt
from fava.core.filters import AccountFilter, AdvancedFilter

def get_filtered_entries(
    ledger: FavaLedger,
    view_mode: str = "combined",
    *,
    account: str | None = None,
    from_date: datetime.date | None = None,
    to_date: datetime.date | None = None,
    tags: list[str] | None = None,
    payee: str | None = None,
) -> list:
    """Filter ledger entries.

    Applies filters in this order (matching Fava's FilteredLedger):
      1. view_mode  — planned/actual flag filter (Ledgr-specific)
      2. account    — Fava's AccountFilter (regex + has_component)
      3. tags/payee — Fava's AdvancedFilter (parsed query syntax)
      4. time       — clamp_opt() for correct opening balances

    Step 1 is the only Ledgr-specific logic. Steps 2-4 delegate
    entirely to Fava/Beancount — no custom filtering code.
    """
    entries = ledger.all_entries

    # 1. View mode (planned/actual) — Ledgr-specific, no Fava equivalent
    if view_mode != "combined":
        flag = "*" if view_mode == "actual" else "!"
        entries = [
            e for e in entries
            if not isinstance(e, data.Transaction) or e.flag == flag
        ]

    # 2. Account filter — Fava's AccountFilter (regex + has_component)
    if account:
        entries = AccountFilter(account).apply(entries)

    # 3. Tags + payee — Fava's AdvancedFilter (query syntax parser)
    filter_parts = []
    if tags:
        filter_parts.extend(f"#{t}" for t in tags)
    if payee:
        filter_parts.append(f'payee:"{payee}"')
    if filter_parts:
        entries = AdvancedFilter(" ".join(filter_parts)).apply(entries)
    # 4. Time filter (clamp_opt — Beancount native)
    if from_date or to_date:
        begin = from_date or datetime.date.min
        end = to_date or (
            max(e.date for e in entries if isinstance(e, data.Transaction))
            + datetime.timedelta(days=1)
        ) if entries else datetime.date.max
        entries, _ = clamp_opt(entries, begin, end, ledger.options)

    return entries
```

**Why this works for every report type**: After `clamp_opt()`, the
entries contain synthetic opening-balance transactions for balance
sheet accounts. Any downstream computation — `realization.realize()`,
`cap_opt()`, running balance iteration, period bucketing — will
see correct balances without any per-report special handling.

**Why use Fava's filter classes instead of naive code**: `AccountFilter`
supports regex matching and Beancount's `has_component()` (matching
any segment of the account name, not just prefix). `AdvancedFilter`
uses a full parser that supports regex payee matching, tag composition,
metadata key matching, and amount comparisons — all for free.

### 4.3 Remove per-endpoint date filtering

The following endpoints currently handle dates internally. After this
change, they delegate entirely to `get_filtered_entries()`:

**Income Statement** (`routers/reports.py`):
- Remove the `clamp_opt()` call inside `_compute_income_statement()`.
  The entries arriving are already clamped.
- The `begin`/`end` variables used for `clamp_opt()` are no longer
  needed. The function receives pre-clamped entries.

**Transactions** (`routers/transactions.py`):
- Remove the inline `if from_date:` / `if account:` filtering block.
  `get_filtered_entries()` handles it all.
**Balance Sheet** (`routers/reports.py`):
- Remove the `as_of_date` cutoff logic inside `_compute_balance_sheet()`.
  When the frontend sends `to_date`, `clamp_opt()` handles it.
  `cap_opt()` still runs on the clamped entries (closing
  Income→Equity), which is correct.

**Cash Flow** (`routers/cashflow.py`):
- Remove internal date filtering in `compute_cashflow()`.
  Entries arrive pre-clamped.

### 4.4 Unified endpoint signatures

Every endpoint that calls `get_filtered_entries()` gains these
optional query params:

```
account:   str | None  = Query(None)
from_date: str | None  = Query(None)
to_date:   str | None  = Query(None)
tags:      list[str]   = Query([])
payee:     str | None  = Query(None)
view_mode: str         = Query("combined", pattern="^(actual|planned|combined)$")
```

All params are forwarded to `get_filtered_entries()`.

**Affected endpoints** (8 total):

| File                         | Endpoint                          |
|------------------------------|-----------------------------------|
| `routers/transactions.py`    | `GET /api/transactions`           |
| `routers/accounts.py`        | `GET /api/accounts`               |
| `routers/reports.py`         | `GET /api/reports/income-expense`  |
| `routers/reports.py`         | `GET /api/reports/account-balance` |
| `routers/reports.py`         | `GET /api/reports/net-worth`       || `routers/reports.py`         | `GET /api/reports/income-statement`|
| `routers/reports.py`         | `GET /api/reports/balance-sheet`   |
| `routers/cashflow.py`        | `GET /api/reports/cashflow`        |

### 4.5 Endpoint call pattern (example)

All endpoints follow this exact pattern:

```python
@router.get("/api/reports/income-statement")
def get_income_statement(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    entries = get_filtered_entries(
        ledger, view_mode,
        account=account,
        from_date=date.fromisoformat(from_date) if from_date else None,
        to_date=date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    # ... compute report from `entries` — NO further date handling
```

### 4.6 `comparative` view_mode interaction

Chart endpoints accept `view_mode=comparative`. When combined with
filters, the pattern is:
```python
if view_mode == "comparative":
    actual_entries = get_filtered_entries(
        ledger, "actual", account=account,
        from_date=..., to_date=..., tags=tags, payee=payee,
    )
    planned_entries = get_filtered_entries(
        ledger, "planned", account=account,
        from_date=..., to_date=..., tags=tags, payee=payee,
    )
    return {
        "series": compute(actual_entries),
        "planned_series": compute(planned_entries),
    }
```

Entity and time filters apply identically to both actual and planned
branches.

---

## 5. Frontend changes

### 5.1 Zustand — filter state in `appStore.ts`

Add to the store interface:

```typescript
type PeriodPreset =
  | 'today'
  | 'this-week'
  | 'this-month'
  | 'this-year'
  | 'last-30-days'
  | 'last-12-months'
  | 'ytd'
  | 'all-time';
interface FilterState {
  periodPreset: PeriodPreset | null;
  fromDate: string | null;  // ISO date, only used for custom range
  toDate: string | null;    // ISO date, only used for custom range
  account: string | null;
  tags: string[];
  payee: string | null;
}

// Actions
setFilter: (patch: Partial<FilterState>) => void;
clearFilters: () => void;
clearFilter: (key: keyof FilterState) => void;
hasActiveFilters: () => boolean;
```

Default state: all `null` / empty = "All time", no filters = no
`clamp_opt()` call = identical to current behavior.

### 5.2 Date resolution utility

File: `frontend/src/utils/dateUtils.ts`

```typescript
export function resolvePeriodDates(
  state: FilterState
): { from_date: string | null; to_date: string | null }
```

If `periodPreset` is set, computes dates at call time (so "This month"
always reflects the current month). If `fromDate`/`toDate` are set
directly (custom range), returns those.

**Exclusive end dates**: This function returns `to_date` as the day
AFTER the last desired day (matching `clamp_opt()` semantics). The
UI displays inclusive dates; conversion happens here.
### 5.3 Custom hook: `useFilterParams()`

File: `frontend/src/hooks/useFilterParams.ts`

```typescript
export function useFilterParams(): GlobalFilters {
  const filters = useAppStore((s) => ({
    periodPreset: s.periodPreset,
    fromDate: s.fromDate,
    toDate: s.toDate,
    account: s.account,
    tags: s.tags,
    payee: s.payee,
  }));
  const { from_date, to_date } = resolvePeriodDates(filters);
  return { account: filters.account, from_date, to_date,
           tags: filters.tags, payee: filters.payee };
}
```

Components never resolve dates manually. Always use this hook.

### 5.4 React Query key convention

Every query key includes the resolved filter params:

```typescript
const filters = useFilterParams();
const viewMode = useAppStore((s) => s.viewMode);

const { data } = useQuery({
  queryKey: ['income-expense', interval, viewMode, filters],
  queryFn: () => fetchIncomeExpenseSeries(interval, viewMode, filters),
});
```

React Query's structural comparison on `filters` ensures refetch
on any filter change.
### 5.5 API client — `appendFilters()` helper

File: `frontend/src/api/client.ts`

```typescript
export interface GlobalFilters {
  account?: string | null;
  from_date?: string | null;
  to_date?: string | null;
  tags?: string[];
  payee?: string | null;
}

function appendFilters(params: URLSearchParams, f: GlobalFilters): void {
  if (f.account) params.set('account', f.account);
  if (f.from_date) params.set('from_date', f.from_date);
  if (f.to_date) params.set('to_date', f.to_date);
  if (f.tags?.length) {
    for (const tag of f.tags) params.append('tags', tag);
  }
  if (f.payee) params.set('payee', f.payee);
}
```

Update every `fetch*` function to accept optional `filters?: GlobalFilters`
and call `appendFilters()`.

### 5.6 FilterBar component

File: `frontend/src/components/FilterBar.tsx`
Style: `frontend/src/components/FilterBar.module.css`

#### Structure

```
<div class="filter-bar">
  <FilterButton type="period" />
  <FilterButton type="account" />
  <FilterButton type="tag" />
  <FilterButton type="payee" />
  <span class="separator" />
  {hasActiveFilters && <ClearAllButton />}
  <span class="shortcut-hint">/ focus filters</span>
</div>
```
Each `FilterButton` renders:
- **Inactive**: icon + label, plain border
- **Active**: icon + display value, info-colored background, ✕ button

#### Dropdown panels

- **PeriodDropdown**: 2-column grid of presets + custom range inputs +
  ◀/▶ month nav
- **AccountDropdown**: search input + flat filtered list. Selecting a
  parent account shows "(includes children)" hint. Data from
  `fetchAccountNames()`.
- **TagDropdown**: search input + chip cloud. Multi-select (click
  toggles). Data from `fetchTags()`.
- **PayeeDropdown**: search input + flat list sorted by frequency.
  Data from `fetchPayees()`.

All dropdown data queries use `staleTime: 5 min`.

#### Keyboard

- `/` (when no input focused) focuses the first filter button
- Arrow keys navigate within an open dropdown
- `Enter` selects highlighted item
- `Escape` closes dropdown

### 5.7 Icons — inline SVG

File: `frontend/src/components/icons.tsx`

5 named SVG components: `CalendarIcon`, `AccountIcon`, `TagIcon`,
`UserIcon`, `XIcon`. Each is 24×24 viewBox, `stroke="currentColor"`,
`strokeWidth={1.5}`, round caps/joins, no fill. Lucide icon set style,
zero dependencies.
### 5.8 FilterBar placement

File: `frontend/src/App.tsx`

```tsx
<div className="main-content">
  <TabBar />
  <FilterBar />
  <ActiveTabContent />
</div>
```

### 5.9 Component updates — consume filters

Every component that currently passes its own date/account params
switches to `useFilterParams()`.

| Component              | Current behavior                    | After                                  |
|------------------------|-------------------------------------|----------------------------------------|
| `AccountRegister`      | Passes `account` prop to API        | Merges register account with filters   |
| `IncomeStatement`      | Internal date state + `clamp_opt()` | Reads from global filters; no internal dates |
| `BalanceSheet`         | Internal `as_of_date`               | Reads from global filters              |
| `CashFlowStatement`    | Internal date state                 | Reads from global filters              |
| `IncomeExpenseChart`   | No date filtering                   | Reads from global filters              |
| `NetWorthChart`        | No date filtering                   | Reads from global filters              |
| `AccountBalanceChart`  | Account from tab context            | Merges tab account with filters        |
| `Dashboard`            | No filtering                        | Reads from global filters              |

**AccountRegister special case**: When the user has a register open
for `Assets:Bank:Nubank` and sets the global Account filter to
`Expenses:Food`, the global filter wins. The register shows
transactions touching `Expenses:Food`. Clear the Account filter to
return to the register's own account.
---

## 6. Execution order

| Task | Files                                    | Depends on |
|------|------------------------------------------|------------|
| T1   | `backend/ledger.py`                       | —          |
| T2   | `backend/routers/accounts.py` (tags endpoint) | T1     |
| T3   | `backend/routers/transactions.py`         | T1         |
| T4   | `backend/routers/reports.py`              | T1         |
| T5   | `backend/routers/cashflow.py`             | T1         |
| T6   | `backend/tests/test_ledger.py`            | T1         |
| T7   | `frontend/src/types/index.ts`             | —          |
| T8   | `frontend/src/stores/appStore.ts`         | T7         |
| T9   | `frontend/src/utils/dateUtils.ts`         | T7         |
| T10  | `frontend/src/hooks/useFilterParams.ts`   | T8, T9     |
| T11  | `frontend/src/api/client.ts`              | T7         |
| T12  | `frontend/src/components/icons.tsx`       | —          |
| T13  | `frontend/src/components/FilterBar.tsx` + `.module.css` | T8, T10, T11, T12 |
| T14  | `frontend/src/App.tsx`                    | T13        |
| T15  | Update all report/chart/register components | T10, T11 |
| T16  | `frontend/src/hooks/useKeyboardNav.ts`    | T13        |

### Task details

**T1 — Rewrite `get_filtered_entries()`**

The central change. Add `clamp_opt` import and keyword-only params.
Apply entity filters first, `clamp_opt()` last. See §4.2 for full
implementation. Non-transaction entries pass through entity filters
unchanged; `clamp_opt()` handles them natively.
**T2 — Add `GET /api/tags`**

New endpoint in `accounts.py`. Iterates `ledger.all_entries`, collects
`txn.tags`, returns sorted list. No filter params on this endpoint
(returns all tags regardless of active filters — the dropdown always
shows the full tag vocabulary).

**T3 — Update transactions endpoint**

Add filter params. Remove inline account/date filtering — delegate
entirely to `get_filtered_entries()`. The endpoint body becomes:
```python
entries = get_filtered_entries(ledger, view_mode, ...)
txns = [e for e in entries if isinstance(e, data.Transaction)]
return {"transactions": [serialize_transaction(t) for t in txns], ...}
```

**T4 — Update report endpoints**

Add filter params to all 5 report endpoints. **Critical**: remove
the `clamp_opt()` call inside `_compute_income_statement()` and the
`as_of_date` cutoff inside `_compute_balance_sheet()` — these are
now handled by `get_filtered_entries()`.

For `_compute_income_statement()`: the function currently receives
`begin` and `end` params and calls `clamp_opt()` internally. After
this change, it receives already-clamped entries and the `begin`/`end`
params are removed. The `_compute_*` helpers become pure computation
on pre-filtered entries.

For `_compute_balance_sheet()`: remove the `as_of_date` param and
the `closed = [e for e in closed if e.date <= cutoff]` block. The
entries are already clamped to the right window.
**T5 — Update cashflow endpoint**

Add filter params. Forward to `get_filtered_entries()`. Remove any
internal date filtering in `compute_cashflow()` that duplicates
what `clamp_opt()` already does.

**T6 — Tests for extended `get_filtered_entries()`**

Add to `test_ledger.py`:
- `test_filter_by_account_exact` — matches exact account name
- `test_filter_by_account_prefix` — matches child accounts
- `test_filter_by_date_range_uses_clamp_opt` — verify opening
  balances are created (check for synthetic entries)
- `test_filter_by_tags_and_logic` — multiple tags = AND
- `test_filter_by_payee` — exact match
- `test_combined_filters` — account + date + tags together
- `test_no_filters_returns_all_entries` — default = `all_entries`
- `test_date_filter_preserves_opening_balances` — critical: filter
  a month, verify balance sheet accounts have opening entries

Update `tests/fixtures/minimal.beancount` to include transactions
with tags and payees for filter testing.

**T7 — TypeScript types**

Add `PeriodPreset`, `FilterState`, `GlobalFilters` to `types/index.ts`.

**T8 — Zustand store**

Add `FilterState` properties and actions to `appStore.ts`.

**T9 — Date utils**

Add `resolvePeriodDates()` to `dateUtils.ts`. Must handle exclusive
end dates for `clamp_opt()` semantics.
**T10 — `useFilterParams()` hook**

New file. Reads store, resolves dates, returns `GlobalFilters`.

**T11 — API client**

Add `GlobalFilters` type, `appendFilters()` helper, update all 8
fetch functions to accept optional `filters` param.

**T12 — Icons**

New file `icons.tsx` with inline SVGs. See §5.7.

**T13 — FilterBar component**

New component with CSS Module. Sub-components for each dropdown
type (all in same file if under ~300 lines, otherwise extract into
`FilterBar/` directory). See §5.6.

**T14 — App.tsx**

Import `FilterBar`, render between `TabBar` and active tab content.

**T15 — Update consuming components**

For each component in §5.9:
1. Import `useFilterParams()`
2. Replace internal date/account state with global filter values
3. Add `filters` to query key and API call
4. Remove any internal `clamp_opt()` or date-handling logic

**T16 — Keyboard shortcut**

Add `/` handler to `useKeyboardNav.ts`. Guard: only fires when
`document.activeElement.tagName` is not `INPUT`, `TEXTAREA`, or
`SELECT`.
---

## 7. Invariants

1. **Default = no filters = current behavior**: No filters active →
   no `clamp_opt()` call → `ledger.all_entries` unchanged → zero
   regressions.
2. **Opening balances are correct under time filters**: When a period
   is selected, `clamp_opt()` creates synthetic opening-balance entries
   for balance sheet accounts. This is verified by test
   `test_date_filter_preserves_opening_balances`.
3. **Accounting equation holds under all filters**: `cap_opt()` on
   clamped entries still satisfies `Assets + Liabilities + Equity == 0`.
4. **`clamp_opt()` is the ONLY time-filtering mechanism**: No endpoint
   performs its own date filtering. Any date filtering that bypasses
   `clamp_opt()` is a bug.
5. **Entity filters compose with time filters**: Account/tag/payee
   filters narrow the entry set, then `clamp_opt()` creates opening
   balances for the narrowed set. The opening balance of
   `Assets:Bank:Nubank` with tag filter `#food` reflects only
   `#food` transactions — this is correct and matches Fava behavior.
6. **`viewMode` and filters are orthogonal**: Planned toggle and
   global filters compose. `viewMode=actual` + `tag=food` shows
   only confirmed transactions tagged `food`.
7. **Filter state is URL-independent**: Filters live in Zustand only.
   Future React Router migration may sync to URL params — out of scope.

---

## 8. Acceptance criteria

- [ ] `get_filtered_entries()` uses `clamp_opt()` for time filtering
- [ ] All 8 endpoints accept `account`, `from_date`, `to_date`,
      `tags`, `payee` params and delegate to `get_filtered_entries()`
- [ ] No endpoint performs its own date filtering or `clamp_opt()` call
- [ ] `GET /api/tags` returns sorted tag list- [ ] Date filter produces correct opening balances (verify synthetic
      entries from `clamp_opt()` exist in filtered output)
- [ ] Balance Sheet with period filter shows correct cumulative balances
- [ ] Account Register running balance starts with correct opening balance
      when a period filter is active
- [ ] FilterBar renders on every page
- [ ] Clicking a preset updates all visible data
- [ ] Account filter with prefix matching works (selecting `Assets:Bank`
      shows transactions for all sub-accounts)
- [ ] Tag multi-select with AND logic works
- [ ] Payee single-select works
- [ ] "Clear all" resets to default (no filters)
- [ ] `/` shortcut focuses the filter bar
- [ ] `pytest` passes with new filter tests
- [ ] No visual regressions on existing pages
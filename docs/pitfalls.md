---
type: reference
last_updated: 2026-08-20
---

# Known failure modes — do not repeat

Real incidents and their fixes. Add new entries as you encounter them — with enough detail that the next agent can judge whether their change would trigger the same failure.

## Backend

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Using `float` for monetary values | Silent rounding errors | Always use `Decimal` |
| Checking `Liabilities:` before `Liabilities:Loans` | Loans misclassified as operating instead of financing | Fix the order in `classify_posting()` — see [`backend/cashflow.md`](backend/cashflow.md) |
| Checking operating before investing | Investment transactions with incidental fees misclassified as operating | Check `INVESTING` before `OPERATING` — see [`backend/cashflow.md`](backend/cashflow.md) |
| Manually iterating `entries` to compute balance | Wrong results, fragile code | Use `realization.realize()` |
| Not calling `cap_opt()` on Balance Sheet | Assets ≠ Liabilities + Equity | `summarize.cap_opt()` is mandatory |
| Writing to `.beancount` with `open()` | File corruption, no rollback | Use `FavaLedger.file.insert_entries()` — see [`backend/modules.md`](backend/modules.md) |
| Returning raw `Decimal` or `date` in JSON responses | Serialization error 500 | Always pass through `serializers.py` |
| `POST /api/transactions` writes without a balance check | Unbalanced postings are silently written to the ledger and return `success: true`, corrupting the file | Validate `interpolate.compute_residual()` before `insert_entries`. The MCP server has a defensive guard (`_balance_error`) meanwhile — see [`features/mcp-server.md`](features/mcp-server.md) |
| Treating report `to_date` as inclusive | `to_date` is **exclusive** — `to_date=2026-07-31` drops transactions on the 31st, giving a total that silently differs from the UI | For a whole month use `[first-day, first-of-next-month)`. Frontend does this in `resolvePeriodDates`; MCP does it in `_month_range` |
| `GET /api/reports/balance-sheet` with only `to_date` | Returns 500 (needs `from_date` too, or neither). Also 500s on `from_date` = year 1 | Send both dates or neither. MCP works around it with a far-past `from_date` |
| Replacing an account name by plain substring | Mangles every longer name containing it: renaming `Assets:Investments:XP` also rewrote `…:XP:Bonds` and `…:XPTruco`. Has happened for real — a `sed` over account names turned `CableTV` into `Credit-Card` mid-word | Anchor on account-name boundaries (lookarounds on `[A-Za-z0-9-]` and `:`) and make subtree inclusion an explicit choice. See `account_rename.py` and [`features/account-management.md`](features/account-management.md) |
| Renaming an account with `save_entry_slice` per entry | Not atomic — ~930 postings across 8 files on a real ledger, and a failure mid-run leaves the ledger half-renamed | Snapshot every file, rewrite, re-parse, restore on any new error. The sanctioned exception is documented in [`backend/modules.md`](backend/modules.md) |
| Deriving `closed` / `posting_count` from the **filtered** entry set | An account looks unused or absent just because it falls outside the active date range | Build those maps from `ledger.all_entries` — they are facts about the ledger, not the current filter |
| Pruning closed accounts by `closed` alone | The synthetic parent stays behind as an empty group with no directive to edit or close — the user sees a row that cannot be acted on or explained (`Assets:Vehicle` surviving `Assets:Vehicle:KA`) | Also prune structural nodes (`open_date is None`) once they have no visible children |
| Identifying a transaction by `lineno` alone | Line numbers repeat across `include`d files — 52% collide on a real 8-file ledger. An edit meant for `2025.beancount:1239` was written to `2019.beancount:1239`: the user's entry stayed unchanged (reads as "the edit didn't persist") and a stray 2025 entry appeared inside 2019 | Key on `(filename, lineno)`. `serialize_transaction` exposes `filename`; every edit/delete caller must pass it |
| Rebuilding entry metadata with `ledger.beancount_file_path` | On a multi-file ledger the rewritten entry claims to live in the main file when it does not | Use `entry.meta["filename"]` — the entry stays where it is |
| Writing a posting to a closed account | Beancount only flags it on the NEXT load ("Invalid reference to inactive account"), so the API answers `success: true` and leaves a validation error in the user's ledger | Pre-validate against `Close` dates before `insert_entries` — see `_validate_active_accounts`. Same class of bug as the unbalanced-transaction write |
| Reading Beancount's "inactive account" as *closed* | It also covers **not yet open**. A posting dated before the account's `open` produces the identical message, so a fix that only checks `Close` misses half the cases — hit for real with a `2026-01-01 open` and a posting dated 2025-12-11 | Validate both bounds: `txn_date < open_date` and `txn_date >= close_date` |
| Making the opening date create-only in the UI | The usual fix for a too-late `open` is moving it back, and with no way to edit it the user is stuck with a permanently invalid ledger | `PUT /api/accounts` accepts `date`; the modal shows the field on edit too. Moving it *forward* past an existing posting is refused with a 400 |
| Assuming Beancount's `close` cascades to child accounts | It does not. A closed parent still lets `Parent:Child` accept postings — verified, zero errors. The tree implies containment that Beancount does not have | Cascade explicitly over `name + ":"` descendants. See [`features/account-management.md`](features/account-management.md) |
| Closing an account with a date before its last posting | Ledger becomes invalid | Check the last posting date of every cascade target first and refuse with a 400 |
| Deleting several directives without re-reading between them | `delete_entry_slice` works off line numbers, and removing one line shifts the rest | Delete deepest-first and reload the ledger between deletions |
| Declaring an opening balance that an imported prior year already closes | Doubles every balance and inflates net worth by the whole prior year | When a new earlier year is imported, empty the following year's `OPENING_BALANCES` — its closing balances *are* the next year's opening |

## Frontend

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Passing `fetchFoo` directly as `queryFn` | React Query passes context object as arg → `[object Object]` in URL | Always wrap: `() => fetchFoo(args)` |
| Omitting `viewMode` from `queryKey` | Data not refetched when toggle changes → stale UI | Include `viewMode` in every query key |
| Calling `fetch()` directly in a component | Bypasses typed wrappers, no error handling | Use `src/api/client.ts` functions |
| Using `any` to silence type errors | Hides real bugs, breaks strict mode | Define proper types in `src/types/index.ts` |
| Hard-coding hex colors in components | Breaks dark mode | Use CSS variables from `global.css` |
| Using `useAppStore()` without selector | Component re-renders on every store change | Always pass a selector function |
| Adding inline `style={{}}` for static styles | Inconsistent with codebase, harder to maintain | Use CSS classes in `global.css` |
| Omitting a server-side flag from `queryKey` | Same failure as `viewMode`: toggling `include_closed` served the pruned tree from cache | Every parameter that changes the response belongs in the key |
| Budgeting an expense that consumes no cash | The envelope asks for money that never moves, so the ZBB can never close — `unallocated` is permanently off by the non-cash amount, every month. Hit with a prepaid appropriation (consortium admin fee) and monetary correction | A posting counts only when its transaction touches `cash` or a deferred-cash type (`credit-card` / `payable`) — see `consumes_budget_cash` |
| Reading Budget membership off the counterpart pair | "`Expenses` against `investment` never budgets" is wrong — the same pair budgets or not depending on whether that **transaction** has a cash leg. Two filters are at play: one on the transaction (did money move?), one on the posting (is this an envelope?) | See the decision diagram in [`features/budgets.md`](features/budgets.md) §3 |
| Extending `require_cash_counterpart` to expenses without allowing the card | Removes **all** card spend from the Budget — R$53k on a real ledger, since a card purchase has no cash leg at purchase time | The rule accepts `DEFERRED_CASH_TYPES`, not just `cash` |
| `if (result.success) { …commit… }` with no else branch | A refused write does **nothing**: editor stays open, no message, Enter reads as a dead key. Reported as "não está salvando, nada acontece" right after validation was tightened | Throw on `!result.success` so the inline editor's `await onSave(...)` rejects and it can show the reason |
| Offering a palette action that needs context the palette lacks | `Rename Account` with no account focused can only fail | Gate the entry on the context existing — see [`frontend/command-palette.md`](frontend/command-palette.md) |

## Docs / wiki

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| New page not registered in `docs/index.md` | Linter errors; agents cannot discover it | Add a row under the correct area with a one-line purpose |
| Missing YAML frontmatter | Linter errors | Add `type` and `last_updated` at the top of the file |
| Piling detail into `AGENTS.md` | File grows, agents lose the signal | Extract into the relevant `docs/` page |

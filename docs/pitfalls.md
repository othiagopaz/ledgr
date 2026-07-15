---
type: reference
last_updated: 2026-07-15
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

## Docs / wiki

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| New page not registered in `docs/index.md` | Linter errors; agents cannot discover it | Add a row under the correct area with a one-line purpose |
| Missing YAML frontmatter | Linter errors | Add `type` and `last_updated` at the top of the file |
| Piling detail into `AGENTS.md` | File grows, agents lose the signal | Extract into the relevant `docs/` page |

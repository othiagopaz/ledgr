---
type: feature
last_updated: 2026-04-21
---

# Planned toggle — Actual vs Actual + Planned

Beancount transactions have a flag field: `*` (cleared/confirmed) or `!` (pending/planned). The **Planned toggle** controls whether `!` transactions are included in reports.

## Two states

| Toggle state         | Meaning                          | Backend `view_mode` |
|----------------------|----------------------------------|---------------------|
| **Actual**           | Only `*` transactions            | `actual`            |
| **Actual + Planned** | All transactions (default)       | `combined`          |

## Backend: `get_filtered_entries()`

Centralized in `backend/ledger.py`. Every endpoint calls it instead of accessing `ledger.all_entries` directly:

```python
entries = get_filtered_entries(ledger, view_mode)
```

- `"combined"` → returns `ledger.all_entries` unchanged
- `"actual"` → filters out `!` transactions; structural directives (`Open`, `Close`, `Balance`, `Price`, `Commodity`) always pass through
- `"planned"` → filters out `*` transactions; structural directives pass through

See [`../backend/modules.md`](../backend/modules.md) for the full `ledger.py` contract.

## Endpoint `view_mode` parameter

Every endpoint that reads entries accepts an optional `view_mode` query param:

| Endpoint group                                               | Accepted values                                   | Notes                                                             |
|--------------------------------------------------------------|---------------------------------------------------|-------------------------------------------------------------------|
| Chart endpoints (income-expense, account-balance, net-worth) | `actual`, `planned`, `combined`, `comparative`    | `comparative` returns both `series` and `planned_series`           |
| Statement endpoints (income-statement, balance-sheet, cashflow) | `actual`, `planned`, `combined`                | Simple filter pass-through                                         |
| accounts, transactions                                       | `actual`, `planned`, `combined`                   | Simple filter pass-through                                         |

Default is always `"combined"` (backward-compatible).

## Frontend state

`viewMode` lives in `appStore.ts` as `'actual' | 'combined'`.

## Frontend UI

- `PlannedToggle.tsx` renders a pill button in the app header
- `P` key toggles between states (via `useKeyboardNav.ts`)

## Effect on queries

Every `useQuery` includes `viewMode` in its `queryKey`, so toggling automatically triggers refetches across all visible data. Missing `viewMode` from a query key produces stale UI — see [`../pitfalls.md`](../pitfalls.md).

## Chart rendering in combined mode

| Chart                 | Actual mode  | Combined mode                                                                   |
|-----------------------|--------------|---------------------------------------------------------------------------------|
| Income vs Expenses    | Solid bars   | Stacked: solid actual + translucent planned. Income above zero, expenses below. |
| Net Worth             | Solid line   | Solid line (actual) + dashed line (actual+planned)                              |
| Dashboard cards       | Main value   | Combined total as main value, "X planned" subtitle                              |

When `viewMode === 'combined'`, chart components send `view_mode=comparative` to the API to receive separate `series` and `planned_series` arrays. Non-chart components send `view_mode=combined`.

## Key invariants

1. **Default backward compatibility** — no `view_mode` param = `combined` = current behavior
2. **Accounting equation in actual mode** — `Assets + Liabilities + Equity == 0` still holds
3. **Non-transaction entries are never filtered** — `Open`, `Close`, `Balance`, `Price`, `Commodity` always pass through

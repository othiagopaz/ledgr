---
type: pattern
last_updated: 2026-09-08
---

# Accounting reports — correct Fava usage

These are the canonical patterns for each report. All of them delegate to Beancount/Fava rather than reimplementing the logic. See [`../principles/beancount-first.md`](../principles/beancount-first.md).

## Income Statement (P&L)

```python
from beancount.ops import summarize
from beancount.core import realization

# clamp_opt zeros Income/Expenses before the period and truncates after.
# This is what Fava uses internally.
clamped, _ = summarize.clamp_opt(
    ledger.all_entries, begin_date, end_date, ledger.options
)
real_root     = realization.realize(clamped)
income_node   = realization.get(real_root, "Income")
expenses_node = realization.get(real_root, "Expenses")
```

## Balance Sheet

```python
from beancount.ops import summarize

# cap_opt closes Income/Expenses → Equity automatically.
# Guarantees Assets = Liabilities + Equity with NO manual retained earnings logic.
closed    = summarize.cap_opt(ledger.all_entries, ledger.options)
real_root = realization.realize(closed)
```

**Invariant**: `total_assets == total_liabilities + total_equity + unrealized_gains`, where `unrealized_gains` is `0.00` under the `units` and `at_cost` lenses. This MUST pass on every generated Balance Sheet (both `combined` and `actual` view modes, every `conversion`). Tested in `backend/tests/test_reports.py` and `backend/tests/test_routers.py` — see [`testing.md`](testing.md).

`cap_opt` is necessary but not sufficient: every section is also reduced with `convert.get_cost` before the operating currency is split from the rest. A position held at cost has its OC value locked inside a non-OC `units` currency, and without the reduction that value leaves the equation. See [`../features/commodities.md`](../features/commodities.md) §9 — and note that the test helper must **call** this function rather than reimplement it, which is how the violation went unnoticed.

## The conversion lens (`conversion=`)

Every report endpoint (`net-worth`, `income-statement`, `balance-sheet`,
`account-balance`, `income-expense`) and `/api/holdings` accept
`conversion ∈ units | at_cost | at_value | <CURRENCY>`, default **`at_value`**.
Anything else is a 400. The lens is resolved once with
`fava.core.conversion.conversion_from_str` and applied to inventories with
Fava's `cost_or_value` / `convert_position` over `FavaLedger.prices`
(a `FavaPriceMap`). Ledgr never multiplies units by a price itself.

- **`units`** — raw quantities; non-OC positions stay in `other_*` buckets.
- **`at_cost`** — `convert.get_cost`; a held-at-cost position contributes its
  basis, a held-at-price position stays in `other_*`. This is the lens under
  which double-entry closes on its own (§ Balance Sheet).
- **`at_value` / `<CURRENCY>`** — market value through the price map, chaining
  through the cost currency when needed (`XAU {1700 USD}` → USD → BRL). The
  Balance Sheet reports the residual `A − L − E` as `unrealized_gains`, a
  **computed** line: it is never posted (Beancount 3 dropped the `unrealized`
  plugin; Fava computes it at presentation too). For a ledger with the
  `currency_accounts` plugin the FX side of that residual is already in
  `Equity:CurrencyTrading:*`, so `unrealized_gains` is only the held-at-cost part.
- An operating-currency-only ledger returns **byte-identical** numbers under
  every lens — pinned by an HTTP-level regression test over `minimal.beancount`.
- `GET /api/accounts` takes the same `conversion` and adds `value` (subtree
  total in the report currency under the lens, `null` when nothing converts)
  and `other` (positions the lens could not value) to every node; `balance`
  stays the raw position list. The tree shows `value` as the primary number
  and the non-OC units on a muted second line.

Holdings (`/api/holdings`) lists every non-OC position per (account,
commodity): units, cost in the cost currency, market value and unrealised gain
in the report currency, `lots` (null for booking `NONE`, where Beancount does
not reduce lots), and `fx_result` (market value of the `currency_accounts`
subtree) when that plugin is on. `unrealized_gains` on the Balance Sheet and
`totals.unrealized` on Holdings are computed by independent paths and a test
asserts they agree. See [`../plans/PLAN-commodities-ux.md`](../plans/PLAN-commodities-ux.md) §4.

## Time series (charts)

```python
from fava.util.date import Interval

filtered = ledger.get_filtered(time="2026")
trees, date_ranges = ledger.interval_balances(
    filtered, Interval.MONTH, "Income"
)
```

## Account balance — grouping accounts

`GET /api/reports/account-balance` matches the requested account **exactly**, so
a pure grouping node (`Assets:Investments`, which has children but no postings
of its own) would chart a flat zero line — accurate but useless.

When the account has no own postings *and* has descendants, the endpoint rolls
the children up instead and adds three fields:

```jsonc
{
  "consolidated": true,
  "series":   [ /* running sum of ALL descendants */ ],
  "children": [ { "account": "...", "name": "Personnalite", "series": [...] } ]
}
```

Rules that the tests pin:

- **Detection uses `ledger.all_entries`**, not the filtered entries — the
  account filter itself would mask whether the account has own postings.
- **Children are one level down**; grandchildren aggregate into them
  (`Investments:Personnalite:Float` → `Personnalite`). Drill deeper by
  selecting that child, which consolidates in turn.
- **Children reconcile with the total in every period** — the sum of the child
  series equals `series` at each index. A regression here shows the reader two
  contradictory numbers on one chart.
- **Every child series is index-aligned** with `series` (zero-filled before its
  first movement), so the frontend can zip them into one row per period.
- **Children that round to zero in every period are dropped** — an account
  opened but never moved must not add a flat line. Note this is a *period-end*
  test: an account that accrues and settles inside every period is correctly
  omitted at that granularity.
- Children are ordered by **descending final absolute balance**.
- A leaf account's response is **unchanged** (`{"series": [...]}` only).

The frontend draws the total as **bars** on the left axis and each child as a
**line** on an independently-scaled right axis, so a small component stays
readable beside a dominant one without competing with the total.

## BQL queries

```python
from beancount.query import query as bql

result_types, result_rows = bql.run_query(
    ledger.all_entries,
    ledger.options,
    "SELECT account, sum(position) WHERE account ~ '^Assets:' GROUP BY account"
)
```

## Cash Flow — the one exception

Custom logic lives in [`cashflow.md`](cashflow.md). Everything else should use the patterns above.

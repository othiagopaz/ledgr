---
type: pattern
last_updated: 2026-08-19
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

**Invariant**: `total_assets == total_liabilities + total_equity`. This MUST pass on every generated Balance Sheet (both `combined` and `actual` view modes). Tested in `test_routers.py` — see [`testing.md`](testing.md).

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

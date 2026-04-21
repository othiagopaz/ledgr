---
type: pattern
last_updated: 2026-04-21
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

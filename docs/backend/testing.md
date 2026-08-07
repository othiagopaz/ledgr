---
type: pattern
last_updated: 2026-08-06
---

# Backend testing

## Required structure

Every new module has a corresponding test file.

```
backend/ledger.py            → tests/test_ledger.py
backend/cashflow.py          → tests/test_cashflow.py
backend/serializers.py       → tests/test_serializers.py
backend/series.py            → tests/test_series.py
backend/routers/accounts.py  → tests/test_routers.py
backend/routers/series.py    → tests/test_series_router.py
```

## `.beancount` fixtures

Cashflow and report tests use real `.beancount` files in `tests/fixtures/`. **Do not mock `FavaLedger`** — use a real ledger pointed at a fixture file.

The `minimal.beancount` fixture includes both `*` (confirmed) and `!` (planned) transactions so that `view_mode` filtering can be verified.

```python
# tests/conftest.py
import pytest
from fava.core import FavaLedger

@pytest.fixture
def ledger(tmp_path):
    beancount_file = tmp_path / "test.beancount"
    beancount_file.write_text(MINIMAL_LEDGER)
    return FavaLedger(str(beancount_file))
```

## What MUST have tests

- `ledger.py`: `get_filtered_entries()` with all three modes (actual, planned, combined), structural directives preserved, edge cases
- `cashflow.py`: every category (operating, investing, financing, transfer) including edge cases — loan via credit card, asset-to-asset investment transfer, Income → Investment exclusion (see [`cashflow.md`](cashflow.md))
- `serializers.py`: every function with real Beancount types
- `routers/`: HTTP status codes, JSON response shape, `view_mode` param for every endpoint, invalid `view_mode` rejection, backward compatibility (no param = `combined`)
- Accounting invariant: `total_assets == total_liabilities + total_equity` must pass on every generated Balance Sheet (both combined and actual modes) — see [`reports.md`](reports.md)
- `series.py`: sum invariants (installment amounts sum to total), day-clamping for month-end dates, installments cannot be extended — see [`../features/series.md`](../features/series.md)
- **Revise** (`POST …/revise`, both types): confirmed (`*`) txns untouched (only installment `total` counter bumps); pending (`!`) tail regenerated; `amount_is_total` re-division ties out with remainder on the last installment; `count` below confirmed → `400`; recurring cadence change (e.g. monthly→weekly) regenerates at the new step and is reflected in the summary; regenerated postings inherit the series currency. **Seq integrity:** installments are seq-driven — the pending run fills exactly the seq slots not held by a confirmed installment, so out-of-order confirmation (seq 5 paid before 3/4) never duplicates or gaps a seq (fixture `series_noncontiguous.beancount`)

## What does NOT need tests

- Fava/Beancount internal logic (they have their own test suites)
- Trivial serialization (fields passed through without transformation)

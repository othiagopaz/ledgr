# AGENTS.md — Ledgr

Reference guide for AI agents (Claude Code, Cursor, Copilot, etc.)
working in this repository. Read this file **in full** before writing
or modifying any code.

---

## 1. What Ledgr is

Ledgr is a personal finance app with one core differentiator: it uses
**double-entry accounting** (via Beancount) as its data backend, exposed
through a modern React interface.

The product vision is a **3-statement model** for individuals:
Income Statement, Balance Sheet, and Cash Flow Statement — synchronized,
cascading from a single `.beancount` file.

---

## 2. Stack and dependencies

| Layer        | Technology                                      |
|--------------|-------------------------------------------------|
| Data         | `.beancount` file (plain text, Git-friendly)    |
| Accounting   | `beancount` (Python lib) + `fava` (Python lib)  |
| Backend      | FastAPI (Python 3.12+)                          |
| Frontend     | React 18 + TypeScript + Vite                    |
| Tests        | `pytest` (backend) + `vitest` (frontend)        |

---

## 3. Architecture

```
ledgr/
├── AGENTS.md
├── backend/
│   ├── main.py              # FastAPI app + startup
│   ├── ledger.py            # Singleton: FavaLedger wrapper
│   ├── serializers.py       # Fava/Beancount types → JSON dicts
│   ├── cashflow.py          # Only custom accounting logic: Cash Flow
│   ├── routers/
│   │   ├── accounts.py      # GET /api/accounts
│   │   ├── transactions.py  # GET/POST/PUT/DELETE /api/transactions
│   │   ├── reports.py       # GET /api/income-statement, /balance-sheet
│   │   └── cashflow.py      # GET /api/cash-flow
│   └── tests/
│       ├── fixtures/        # .beancount files used in tests
│       ├── test_serializers.py
│       ├── test_cashflow.py
│       └── test_routers.py
└── frontend/
    ├── src/
    │   ├── api/             # Typed fetch wrappers
    │   ├── components/
    │   ├── pages/
    │   └── types/           # TypeScript types mirroring backend schemas
    └── tests/
```

---

## 4. Core principle: Beancount/Fava do the work, we present

**This is the most important rule in the project.**

Beancount is an accounting library tested for over 10 years. Fava is a
reference interface with 5+ years of real-world use. Any accounting logic
that already exists in them **must not be reimplemented** in Ledgr.

### What the Ledgr backend must NEVER do:

- Manually iterate `entries` to calculate account balances → use `realization`
- Filter transactions by date with Python loops → use `summarize.clamp_opt()` or `FilteredLedger`
- Build a hierarchical account tree → use `realization.realize()` directly
- Calculate Net Income manually → use `summarize.cap_opt()` which closes books automatically
- Write/edit the `.beancount` file with string manipulation → use `FavaLedger.file`
- Calculate retained earnings manually → it is a consequence of `cap_opt()` working correctly

### What the Ledgr backend CAN and SHOULD do:

- Instantiate and manage `FavaLedger` as a singleton
- Serialize Fava/Beancount types (`Tree`, `Inventory`, `Decimal`) to JSON
- Implement the **Cash Flow Statement** (the one report Fava does not have)
- Expose thin HTTP endpoints that delegate to `FavaLedger`

### The golden rule for every new feature:

> Before writing any accounting logic, ask:
> "Does Beancount or Fava already do this?"
> If yes: use the library. If unsure: check the docs before implementing.

**Reference documentation:**
- Beancount ops API: https://beancount.github.io/docs/api_reference/beancount.ops.html
- Fava core API: https://beancount.github.io/fava/api/fava.core.html
- BQL reference: https://beancount.github.io/docs/beancount_query_language.html

---

## 5. `ledger.py` — do not bypass, do not duplicate

`ledger.py` is the only module that instantiates `FavaLedger`. It is a
singleton initialized at FastAPI startup.

```python
# backend/ledger.py
from fava.core import FavaLedger

_ledger: FavaLedger | None = None

def get_ledger() -> FavaLedger:
    global _ledger
    if _ledger is None:
        raise RuntimeError("Ledger not initialized")
    return _ledger

def init_ledger(path: str) -> FavaLedger:
    global _ledger
    _ledger = FavaLedger(path)
    return _ledger
```

**Usage rules:**
- Routers obtain the ledger via `Depends(get_ledger)` (FastAPI dependency injection)
- No router imports `FavaLedger` directly
- No router calls `loader.load_file()` directly
- `ledger.changed()` is polled to reload if the file was externally modified

---

## 6. `serializers.py` — the boundary between Fava and JSON

All Fava and Beancount types (`Tree`, `Inventory`, `Amount`, `Decimal`,
`date`) are **not JSON-serializable by default**. The conversion happens
exclusively in `serializers.py`.

```python
# backend/serializers.py

def serialize_tree_node(node: Tree) -> dict: ...
def serialize_inventory(inv: Inventory) -> list[dict]: ...
def serialize_transaction(txn: data.Transaction) -> dict: ...
```

**Rules:**
- No router converts types directly — always calls a serializer
- Serializers are pure functions (no side effects, no I/O)
- All monetary values are returned as strings (`Decimal` → `str`) to preserve
  precision across JSON transport
- Serializers are 100% covered in `test_serializers.py`

---

## 7. `cashflow.py` — the only custom accounting logic

The Cash Flow Statement is the only report that Fava/Beancount does not
implement natively. All custom accounting logic in Ledgr lives here and
only here.

### Classification rules (order is CRITICAL):

```
1. FINANCING   → counterpart is Liabilities:Loans (or any sub-account)
2. INVESTING   → self or counterpart is Assets:Investments (or sub-account)
3. OPERATING   → counterpart is Income:*, Expenses:*, or Liabilities:* (CC etc.)
4. TRANSFER    → asset ↔ asset without the above characteristics
```

**Order matters**: `Liabilities:Loans` MUST be checked BEFORE the generic
`Liabilities:` prefix. Otherwise, loan payments are misclassified as
"operating" instead of "financing". This was a real bug — do not regress.

### How the Cash Flow is computed:

1. Get a `FilteredLedger` for the period via `FavaLedger.get_filtered(time=...)`
2. Iterate `filtered.entries`, take only `Transaction` entries
3. For each transaction, take postings that touch `Assets:*`
4. Classify each posting by its counterparts using the rules above
5. Group by category and sum

### What must NOT be done in `cashflow.py`:

- Do not reload the `.beancount` file
- Do not call `loader.load_file()`
- Do not compute account balances — only period deltas

---

## 8. Accounting reports — correct Fava usage

### Income Statement (P&L)

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

### Balance Sheet

```python
from beancount.ops import summarize

# cap_opt closes Income/Expenses → Equity automatically.
# Guarantees Assets = Liabilities + Equity with NO manual retained earnings logic.
closed    = summarize.cap_opt(ledger.all_entries, ledger.options)
real_root = realization.realize(closed)
```

### Time series (charts)

```python
from fava.util.date import Interval

filtered = ledger.get_filtered(time="2026")
trees, date_ranges = ledger.interval_balances(
    filtered, Interval.MONTH, "Income"
)
```

### BQL queries

```python
from beancount.query import query as bql

result_types, result_rows = bql.run_query(
    ledger.all_entries,
    ledger.options,
    "SELECT account, sum(position) WHERE account ~ '^Assets:' GROUP BY account"
)
```

---

## 9. Mutations to the `.beancount` file

**ALWAYS use `FavaLedger.file`**. Never manipulate the file directly.

```python
# Insert new transaction
ledger.file.insert_entries([new_entry])

# Edit existing transaction (by hash)
ledger.file.save_entry_slice(entry_hash, new_source, sha256sum)

# Delete transaction
ledger.file.delete_entry_slice(entry_hash, sha256sum)
```

`FileModule` handles `ExternallyChangedError` (when the file was edited
externally between the read and the write). Routers must propagate this
error to the frontend as HTTP 409 Conflict.

---

## 10. Tests

### Required structure

Every new module has a corresponding test file.

```
backend/cashflow.py          → tests/test_cashflow.py
backend/serializers.py       → tests/test_serializers.py
backend/routers/accounts.py  → tests/test_routers.py
```

### `.beancount` fixtures

Cashflow and report tests use real `.beancount` files in `tests/fixtures/`.
Do not mock `FavaLedger` — use a real ledger pointed at a fixture file.

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

### What MUST have tests:

- `cashflow.py`: every category (operating, investing, financing, transfer),
  including edge cases: loan via credit card, asset-to-asset investment transfer
- `serializers.py`: every function with real Beancount types
- `routers/`: HTTP status codes and JSON response shape
- Accounting invariant: `total_assets == total_liabilities + total_equity`
  must pass on every generated Balance Sheet

### What does NOT need tests:

- Fava/Beancount internal logic (they have their own test suites)
- Trivial serialization (fields passed through without transformation)

---

## 11. Code conventions

### Python

- Type hints required on all public functions
- Docstrings required on functions with non-trivial logic
- `Decimal` for all monetary values — **never `float`**
- No `print()` in production code — use `logging`

```python
# ✅ Correct
def classify_cashflow(asset_account: str, counterparts: list[str]) -> str:
    """Classify a posting into operating/investing/financing/transfer."""
    ...

# ❌ Wrong
def classify(acct, cps):
    ...
```

### TypeScript / React

- Explicit types for all API responses (in `src/types/`)
- No `any` without a justifying comment
- Fetch wrappers in `src/api/` — components do not call `fetch` directly

### Naming

| Context          | Convention         |
|------------------|--------------------|
| Python files     | `snake_case.py`    |
| Python classes   | `PascalCase`       |
| Python functions | `snake_case`       |
| React components | `PascalCase.tsx`   |
| React hooks      | `usePascalCase.ts` |
| API endpoints    | `/api/kebab-case`  |

---

## 12. Out of scope (do not implement without discussion)

- Multi-ledger (multiple `.beancount` files)
- Authentication / multi-user
- Bank sync via Open Banking
- Automatic statement import (use `beancount-import` for that)
- Any feature Fava already does better (reconciliation UI, source editor, etc.)

---

## 13. Known failure modes — do not repeat

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Using `float` for monetary values | Silent rounding errors | Always use `Decimal` |
| Checking `Liabilities:` before `Liabilities:Loans` | Loans misclassified as operating | Fix the order in `classify_cashflow()` |
| Manually iterating `entries` to compute balance | Wrong results, fragile code | Use `realization.realize()` |
| Not calling `cap_opt()` on Balance Sheet | Assets ≠ Liabilities + Equity | `summarize.cap_opt()` is mandatory |
| Writing to `.beancount` with `open()` | File corruption, no rollback | Use `FavaLedger.file.insert_entries()` |
| Returning raw `Decimal` or `date` in JSON responses | Serialization error 500 | Always pass through `serializers.py` |

---

## 14. PR checklist

- [ ] `pytest` passes with no warnings
- [ ] No public function without type hints
- [ ] No new accounting logic without checking if Beancount/Fava already does it
- [ ] New endpoints have a corresponding router test
- [ ] Changes to the cashflow classifier have a test for the new case
- [ ] Balance Sheet invariant test passes: `assets == liabilities + equity`
- [ ] `mypy` reports no errors in `backend/`

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
│   ├── ledger.py            # Singleton: FavaLedger wrapper + entry filtering
│   ├── serializers.py       # Fava/Beancount types → JSON dicts
│   ├── cashflow.py          # Only custom accounting logic: Cash Flow
│   ├── account_types.py     # ledgr-type vocabulary, type map, classification helpers
│   ├── routers/
│   │   ├── accounts.py      # GET /api/accounts, /api/account-names, etc.
│   │   ├── transactions.py  # GET/POST/PUT/DELETE /api/transactions
│   │   ├── reports.py       # GET /api/reports/income-expense, /net-worth, etc.
│   │   └── cashflow.py      # GET /api/reports/cashflow
│   └── tests/
│       ├── fixtures/        # .beancount files used in tests
│       ├── test_ledger.py   # Unit tests for get_filtered_entries
│       ├── test_serializers.py
│       ├── test_cashflow.py
│       └── test_routers.py
└── frontend/
    ├── src/
    │   ├── api/client.ts       # Typed fetch wrappers (all accept viewMode)
    │   ├── stores/appStore.ts  # Zustand store (includes viewMode toggle)
    │   ├── hooks/              # useKeyboardNav (P shortcut)
    │   ├── components/
    │   │   ├── PlannedToggle.tsx  # Global toggle: Actual ↔ Actual + Planned
    │   │   ├── Dashboard.tsx
    │   │   ├── StatusBar.tsx
    │   │   └── reports/          # Charts + statement components
    │   └── types/index.ts        # TypeScript types (includes ViewMode)
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
- Filter entries by transaction flag via `get_filtered_entries()` (§15)

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

It also provides `get_filtered_entries()`, the centralized entry filter
for the Planned toggle feature (see §15).

```python
# backend/ledger.py
from fava.core import FavaLedger
from beancount.core import data

_ledger: FavaLedger | None = None

def get_ledger() -> FavaLedger:
    ...

def init_ledger(path: str) -> FavaLedger:
    ...

def get_filtered_entries(ledger: FavaLedger, view_mode: str = "combined") -> list:
    """Filter entries by transaction flag (* or !).

    - "combined" → all entries (default, backward-compatible)
    - "actual"   → only transactions with flag '*'; non-txn entries pass through
    - "planned"  → only transactions with flag '!'; non-txn entries pass through
    """
    ...
```

**Usage rules:**
- Routers obtain the ledger via `Depends(get_ledger)` (FastAPI dependency injection)
- No router imports `FavaLedger` directly
- No router calls `loader.load_file()` directly
- All entry access goes through `get_filtered_entries(ledger, view_mode)`

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
- Report aggregate totals are returned as float (via `decimal_to_report_number()`)
  only for chart consumption
- Serializers are 100% covered in `test_serializers.py`

---

## 7. `cashflow.py` — the only custom accounting logic

The Cash Flow Statement is the only report that Fava/Beancount does not
implement natively. All custom accounting logic in Ledgr lives here and
only here.

### `ledgr-type` metadata — account classification

Accounts are classified by `ledgr-type` metadata on their `Open` directive,
not by name prefixes. This lives in `account_types.py`.

```beancount
2024-01-01 open Assets:Bank:Itau  BRL
  ledgr-type: "cash"

2024-01-01 open Liabilities:CreditCard:Nubank  BRL
  ledgr-type: "credit-card"
```

| `ledgr-type` | Applies to | Cash Flow role |
|---|---|---|
| `cash` | Assets | **Cash account** — generates cash flow postings |
| `investment` | Assets | Counterpart → **Investing** |
| `receivable` | Assets | Operating working capital |
| `prepaid` | Assets | Operating working capital |
| `credit-card` | Liabilities | Operating counterpart |
| `loan` | Liabilities | Counterpart → **Financing** |
| `payable` | Liabilities | Operating counterpart |
| `general` | Income/Expenses/Equity | Default, no special behavior |

**Enforcement**: `Assets` and `Liabilities` accounts **require** `ledgr-type`.
`Income`, `Expenses`, `Equity` default to `"general"` if absent.

### 3-tier asset classification

| Tier | `ledgr-type` | Cash Flow role |
|------|-------------|----------------|
| **Cash** | `"cash"` | Only these accounts generate cash flow postings |
| **Investment** | `"investment"` | Counterpart → **Investing** |
| **Other** | `"receivable"`, `"prepaid"`, etc. | Counterpart → **Operating** (working capital) |

Key behaviors:
- Only transactions touching a **cash** account appear in the Cash Flow
- Cash ↔ Investment = **Investing**
- Cash ↔ Other non-cash (Receivables, Deposits…) = **Operating** (working capital)
- Non-cash ↔ Non-cash = **excluded** (no cash movement)
- Income → Investment (interest reinvested, never hits bank) = **excluded**

Account names do not matter — only `ledgr-type` does. `Liabilities:Emprestimo`
with `ledgr-type: "loan"` correctly classifies as financing.

### Classification rules (order is CRITICAL):

```
1. FINANCING   → counterpart has ledgr-type "loan" (checked FIRST)
2. INVESTING   → counterpart has ledgr-type "investment" (checked BEFORE operating)
3. OPERATING   → counterpart is Income:*, Expenses:*, Liabilities:*, or other non-cash asset
4. TRANSFER    → default (cash ↔ cash, e.g. bank transfer)
```

**Order matters**:
- Loan accounts MUST be checked BEFORE generic Liabilities.
  Otherwise, loan payments are misclassified as "operating" instead of
  "financing". This was a real bug — do not regress.
- `INVESTING` MUST be checked BEFORE `OPERATING`. Otherwise, investment
  transactions with incidental expenses (commissions, fees) get misclassified
  as operating. Dividends still classify as operating because they flow
  from Income → cash account (no investment counterpart).

### How the Cash Flow is computed:

1. Get entries for the period
2. Iterate entries, take only `Transaction` entries
3. For each transaction, take postings on **cash accounts** (whitelist)
4. Counterparts = all accounts in the txn that are NOT cash accounts
5. Classify each cash posting using the 3-tier rules above
6. Group by category and sum

Transactions with no cash postings (e.g. `Income:Interest → Assets:Investments:Float`
or `Assets:Investments:Account → Assets:Investments:Bucket1`) are skipped entirely.

### Investing breakdown labels

Investing items strip the `Assets:` prefix from the counterpart name for readability:
`Assets:Investments:Account` → `"Investments:Account"`, `Assets:Broker:XP` → `"Broker:XP"`.

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
backend/ledger.py            → tests/test_ledger.py
backend/cashflow.py          → tests/test_cashflow.py
backend/serializers.py       → tests/test_serializers.py
backend/routers/accounts.py  → tests/test_routers.py
```

### `.beancount` fixtures

Cashflow and report tests use real `.beancount` files in `tests/fixtures/`.
Do not mock `FavaLedger` — use a real ledger pointed at a fixture file.

The `minimal.beancount` fixture includes both `*` (confirmed) and `!`
(planned) transactions so that `view_mode` filtering can be verified.

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

- `ledger.py`: `get_filtered_entries()` with all three modes (actual, planned, combined),
  structural directives preserved, edge cases
- `cashflow.py`: every category (operating, investing, financing, transfer),
  including edge cases: loan via credit card, asset-to-asset investment transfer
- `serializers.py`: every function with real Beancount types
- `routers/`: HTTP status codes, JSON response shape, `view_mode` param for
  every endpoint, invalid `view_mode` rejection, backward compatibility
  (no param = combined)
- Accounting invariant: `total_assets == total_liabilities + total_equity`
  must pass on every generated Balance Sheet (both combined and actual modes)

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
def classify_posting(asset_account: str, counterparts: list[str]) -> str:
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
- All `useQuery` calls must wrap fetch functions in lambdas (`() => fetchFoo(args)`)
  to prevent React Query from passing its context object as arguments
- All data-fetching queries must include `viewMode` in the `queryKey`

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
| Checking `Liabilities:` before `Liabilities:Loans` | Loans misclassified as operating | Fix the order in `classify_posting()` |
| Manually iterating `entries` to compute balance | Wrong results, fragile code | Use `realization.realize()` |
| Not calling `cap_opt()` on Balance Sheet | Assets ≠ Liabilities + Equity | `summarize.cap_opt()` is mandatory |
| Writing to `.beancount` with `open()` | File corruption, no rollback | Use `FavaLedger.file.insert_entries()` |
| Returning raw `Decimal` or `date` in JSON responses | Serialization error 500 | Always pass through `serializers.py` |
| Passing `fetchFoo` directly as `queryFn` | React Query passes context object as arg → `[object Object]` in URL | Always wrap: `() => fetchFoo(args)` |

---

## 14. PR checklist

- [ ] `pytest` passes with no warnings
- [ ] No public function without type hints
- [ ] No new accounting logic without checking if Beancount/Fava already does it
- [ ] New endpoints have a corresponding router test
- [ ] Changes to the cashflow classifier have a test for the new case
- [ ] Balance Sheet invariant test passes: `assets == liabilities + equity`
- [ ] `mypy` reports no errors in `backend/`
- [ ] `view_mode` param tested for all affected endpoints

---

## 15. Planned toggle — Actual vs Actual + Planned

Beancount transactions have a flag field: `*` (cleared/confirmed) or `!`
(pending/planned). The **Planned toggle** controls whether `!` transactions
are included in reports.

### Two states

| Toggle state       | Meaning                         | Backend `view_mode` |
|--------------------|---------------------------------|---------------------|
| **Actual**         | Only `*` transactions           | `actual`            |
| **Actual + Planned** | All transactions (default)    | `combined`          |

### Backend: `get_filtered_entries()`

Centralized in `ledger.py`. Every endpoint calls it instead of accessing
`ledger.all_entries` directly:

```python
entries = get_filtered_entries(ledger, view_mode)
```

- `"combined"` → returns `ledger.all_entries` unchanged
- `"actual"` → filters out `!` transactions; structural directives (`Open`,
  `Close`, `Balance`, `Price`, `Commodity`) always pass through
- `"planned"` → filters out `*` transactions; structural directives pass through

### Endpoint `view_mode` parameter

Every endpoint that reads entries accepts an optional `view_mode` query param:

| Endpoint group | Accepted values | Notes |
|---|---|---|
| Chart endpoints (income-expense, account-balance, net-worth) | `actual`, `planned`, `combined`, `comparative` | `comparative` returns both `series` and `planned_series` |
| Statement endpoints (income-statement, balance-sheet, cashflow) | `actual`, `planned`, `combined` | Simple filter pass-through |
| accounts, transactions | `actual`, `planned`, `combined` | Simple filter pass-through |

Default is always `"combined"` (backward-compatible).

### Frontend toggle

- **State**: `viewMode` in `appStore.ts` (`'actual' | 'combined'`)
- **UI**: `PlannedToggle.tsx` pill button in the app header
- **Keyboard**: `P` key toggles between states
- **Queries**: every `useQuery` includes `viewMode` in the `queryKey`
  and passes it to the fetch function

When the toggle is "Actual + Planned", chart components send
`view_mode=comparative` to get separate actual/planned series for stacked
rendering. Non-chart components send `view_mode=combined`.

### Chart rendering in combined mode

- **Income vs Expenses**: Stacked bars — actual bars + translucent planned bars.
  Income above zero, expenses below zero (centered layout).
- **Net Worth**: Solid line for actual, dashed line for combined (actual+planned).
- **Dashboard cards**: Show combined total as main value, "X planned" subtitle
  for the planned portion.

### Key invariants

1. **Default backward compatibility**: no `view_mode` param = `combined` = current behavior
2. **Accounting equation in actual mode**: `Assets + Liabilities + Equity == 0` still holds
3. **Non-transaction entries are never filtered**: `Open`, `Close`, `Balance`, `Price`, `Commodity` always pass through

---

## 14. Series (Recurring & Installments)

Series transactions are normal Beancount transactions linked by
`ledgr-series` metadata. There is no plugin, no special flag — just
metadata on standard `!`/`*` transactions.

### Metadata keys:
- `ledgr-series`: unique series ID (required)
- `ledgr-series-type`: "recurring" | "installment" (required)
- `ledgr-series-seq`: 1-indexed sequence as Decimal (installment only)
- `ledgr-series-total`: total count as Decimal (installment only)

### Rules:
- All series transactions start as `!` (planned)
- Users flip individual transactions to `*` via normal editing
- Cancel = delete all future `!` transactions in the series
- Extend (recurring only) = append new `!` transactions after last date
- Individual transactions can be edited via normal CRUD endpoints
- The series router handles bulk creation/deletion only
- `series.py` is pure functions — no I/O, no ledger access
- `routers/series.py` handles I/O via FavaLedger.file

### Invariants:
- sum(installment amounts) == total purchase price
- All dates use day-clamping for month-end edge cases
- Installments cannot be extended; recurring can
- Metadata integer values (seq, total) stored as `Decimal` (beancount requirement)

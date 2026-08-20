---
type: module
last_updated: 2026-08-20
---

# Backend modules — `ledger.py`, `serializers.py`, file mutations

Contracts for the three modules every router depends on. For the one module of custom accounting, see [`cashflow.md`](cashflow.md). For accounting-report patterns, see [`reports.md`](reports.md).

## `ledger.py` — the singleton

`ledger.py` is the only module that instantiates `FavaLedger`. It is a singleton initialized at FastAPI startup.

It also provides `get_filtered_entries()`, the centralized entry filter for the Planned toggle feature — see [`../features/planned-toggle.md`](../features/planned-toggle.md).

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

### Usage rules

- Routers obtain the ledger via `Depends(get_ledger)` (FastAPI dependency injection)
- No router imports `FavaLedger` directly
- No router calls `loader.load_file()` directly
- All entry access goes through `get_filtered_entries(ledger, view_mode)`

---

## `serializers.py` — the boundary between Fava and JSON

All Fava and Beancount types (`Tree`, `Inventory`, `Amount`, `Decimal`, `date`) are **not JSON-serializable by default**. The conversion happens exclusively in `serializers.py`.

```python
# backend/serializers.py

def serialize_tree_node(node: Tree) -> dict: ...
def serialize_inventory(inv: Inventory) -> list[dict]: ...
def serialize_transaction(txn: data.Transaction) -> dict: ...
```

### Rules

- No router converts types directly — always calls a serializer
- Serializers are pure functions (no side effects, no I/O)
- All monetary values are returned as strings (`Decimal` → `str`) to preserve precision across JSON transport
- Report aggregate totals are returned as float (via `decimal_to_report_number()`) only for chart consumption
- Serializers are 100% covered in `test_serializers.py`

---

## Mutations to the `.beancount` file

**ALWAYS use `FavaLedger.file`**. Never manipulate the file directly.

```python
# Insert new transaction
ledger.file.insert_entries([new_entry])

# Edit existing transaction (by hash)
ledger.file.save_entry_slice(entry_hash, new_source, sha256sum)

# Delete transaction
ledger.file.delete_entry_slice(entry_hash, sha256sum)
```

`FileModule` handles `ExternallyChangedError` (when the file was edited externally between the read and the write). Routers must propagate this error to the frontend as HTTP 409 Conflict.

### Why this matters

Manual file writes bypass Beancount's parser, so syntax errors don't surface until the next reload. `FavaLedger.file` validates and atomically writes. See [`../pitfalls.md`](../pitfalls.md) for the failure mode this has already produced.

### The one exception: `account_rename.py`

Renaming an account is the **only** sanctioned write outside `FavaLedger.file`. It earns the exception because the alternative is less safe, not more:

- `save_entry_slice` rewrites **one entry at a time**, each keyed by its own hash and sha256. An account name appears in every directive that references it — on a real ledger that is ~930 postings across 8 files (main + every `include`).
- Entry-by-entry is therefore **not atomic**. A failure on the 400th write leaves the ledger half-renamed, which is strictly worse than not starting.

What makes the text-level rewrite acceptable:

1. **Snapshot first** — every affected file is read into memory before a single byte is written.
2. **Validate after** — the ledger is re-parsed and compared against the error count from *before* the rename, so pre-existing errors aren't blamed on it.
3. **Roll back on any failure** — all files are restored from the snapshot. Verified byte-identical by `test_failed_validation_restores_every_file`.

The failure mode is "nothing happened", never "half renamed".

This does **not** breach [`../principles/beancount-first.md`](../principles/beancount-first.md): a rename changes account *names*, not amounts, dates, or structure. No accounting is performed. Beancount and Fava have no rename primitive at all — there is nothing to delegate to.

**Anchoring is load-bearing.** Naive replacement of `Assets:Investments:XP` also hits `Assets:Investments:XP:Bonds` and `Assets:Investments:XPTruco`. Every pattern is anchored on account-name boundaries; `include_children` decides whether the subtree comes along. This exact bug has already corrupted account names once — see [`../pitfalls.md`](../pitfalls.md).

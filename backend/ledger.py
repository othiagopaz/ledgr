"""
Singleton wrapper around FavaLedger.

This is the **only** module that instantiates ``FavaLedger``.  Routers obtain
the ledger via ``Depends(get_ledger)`` — no router imports ``FavaLedger``
directly, and no router calls ``loader.load_file()``.

See AGENTS.md §5 for the full usage contract.
"""

from __future__ import annotations

from beancount.core import data
from fava.core import FavaLedger

_ledger: FavaLedger | None = None


def init_ledger(path: str) -> FavaLedger:
    """Create (or replace) the global FavaLedger singleton.

    Called once during FastAPI lifespan startup.
    """
    global _ledger
    _ledger = FavaLedger(path)
    _ledger.load_file()
    return _ledger


def get_ledger() -> FavaLedger:
    """Return the initialised FavaLedger.

    Intended for use as a FastAPI dependency::

        @router.get("/api/accounts")
        def get_accounts(ledger: FavaLedger = Depends(get_ledger)):
            ...

    Raises ``RuntimeError`` if called before ``init_ledger()``.
    """
    if _ledger is None:
        raise RuntimeError("Ledger not initialized — call init_ledger() first")
    return _ledger


def get_filtered_entries(
    ledger: FavaLedger,
    view_mode: str = "combined",
) -> list:
    """Return ledger entries filtered by planned/actual view mode.

    view_mode:
      - "combined"  → all entries (default, backward-compatible)
      - "actual"    → only transactions with flag '*'; non-txn entries pass through
      - "planned"   → only transactions with flag '!'; non-txn entries pass through
    """
    if view_mode == "combined":
        return ledger.all_entries

    flag = "*" if view_mode == "actual" else "!"
    return [
        e for e in ledger.all_entries
        if not isinstance(e, data.Transaction) or e.flag == flag
    ]

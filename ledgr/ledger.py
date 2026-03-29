"""
Singleton wrapper around FavaLedger.

This is the **only** module that instantiates ``FavaLedger``.  Consumers
obtain the ledger via ``get_ledger()`` after calling ``init_ledger()``
once at startup.

See AGENTS.md §5 for the full usage contract.
"""

from __future__ import annotations

from fava.core import FavaLedger

_ledger: FavaLedger | None = None


def init_ledger(path: str) -> FavaLedger:
    """Create (or replace) the global FavaLedger singleton.

    Called once at application startup.
    """
    global _ledger
    _ledger = FavaLedger(path)
    _ledger.load_file()
    return _ledger


def get_ledger() -> FavaLedger:
    """Return the initialised FavaLedger.

    Raises ``RuntimeError`` if called before ``init_ledger()``.
    """
    if _ledger is None:
        raise RuntimeError("Ledger not initialized — call init_ledger() first")
    return _ledger
